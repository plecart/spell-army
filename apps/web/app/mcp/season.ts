/**
 * La saison pilotée par le MCP (issue #21) : le lancement du combat du jour, ce qu'il lira et
 * refusera avant d'être confirmé, et l'état de la saison. Les règles sont dans `combat`, l'accès aux
 * tables dans `donnees` : ce module enchaîne leurs lectures et leurs écritures, dans la transaction
 * de l'outil qui l'appelle (PR #72, T1). Les noms et les textes des outils sont à `season-tools.ts`.
 */
import {
	afterCombat,
	type BudgetComponents,
	budgetForLaunch,
	budgetOf,
	type CombatLog,
	dayOf,
	type Fighter,
	type Forced,
	fight,
	type Monster,
	type Outcome,
	poolVersionOf,
	referenceRecruitsOf,
	type SeasonLog,
	type SeasonSettings,
	type SeasonState,
	type SeasonTransition,
	type Spell,
	type Stats,
	seasonEndNotice,
	seasonLogOf,
	seedOf,
	sizeMonster,
	summarize,
} from "combat";
import {
	type CalibrationSettings,
	COMBAT_DATE_UNIQUE,
	dailyArrivals,
	type Executor,
	findCombat,
	insertCombat,
	listArmy,
	listMonsters,
	listSpells,
	type MonsterRecord,
	type ParisDay,
	parisCalendar,
	postgresErrorCode,
	readCalibrationSettings,
	readForced,
	readSeasonState,
	replaceForced,
	type SeasonStateRecord,
	updateCalibrationSettings,
	writeSeasonState,
} from "donnees";
import { characterOf } from "personnages";
import { z } from "zod";
import { designOf } from "./monster-tools.ts";
import { spellOf } from "./spell-vocabulary.ts";
import { refuseIfAny } from "./tool.ts";
import { modelStats } from "./vocabulary.ts";

// Les deux règles d'un budget que `BudgetComponents` réunit : N recrues moyennes, et la formule.
const recruits = { recruits: z.number(), averageRecruit: modelStats };
const formula = {
	army: modelStats,
	referenceRecruits: z.number(),
	averageRecruit: modelStats,
	recruitShare: z.number(),
};

/**
 * Le budget du monstre que `season_state` range en JSON, et que `donnees` rend sans le lire : relu
 * par ce schéma avant tout usage, jamais pris sur parole (`BudgetComponents`). `null` avant le
 * premier combat de la saison, et après sa fin.
 */
const storedBudget = z
	.discriminatedUnion("kind", [
		z.strictObject({ kind: z.literal("army"), army: modelStats }),
		z.strictObject({ kind: z.literal("recruits"), ...recruits }),
		z.strictObject({ kind: z.literal("formula"), ...formula }),
		z.strictObject({ kind: z.literal("larger"), ...recruits, ...formula }),
	])
	.nullable() satisfies z.ZodType<BudgetComponents | null>;

/**
 * L'état de la saison que rend `donnees`, son budget relu par `storedBudget`.
 *
 * @throws {z.ZodError} si le budget rangé n'a pas la forme de `BudgetComponents` : une erreur
 * franche, qui refuse l'appel de l'outil.
 */
function seasonStateOf({ budget, ...record }: SeasonStateRecord): SeasonState {
	return { ...record, budget: storedBudget.parse(budget) };
}

/** Les réglages du calibrage tels que la transition de la saison les lit (`SeasonSettings`). */
function seasonSettingsOf(settings: CalibrationSettings): SeasonSettings {
	return {
		recruitShare: settings.recruitShare,
		recruitShareDrop: settings.recruitShareDrop,
		averageRecruit: {
			life: settings.averageRecruitLife,
			strength: settings.averageRecruitStrength,
			magic: settings.averageRecruitMagic,
			speed: settings.averageRecruitSpeed,
		},
		dayTwoBudgetRecruits: settings.dayTwoBudgetRecruits,
	};
}

/** Le monstre du chapitre en cours de `state` dans `bestiary`, ou `undefined` s'il y manque. */
function chapterMonster(
	bestiary: readonly MonsterRecord[],
	{ season, chapter }: SeasonState,
): MonsterRecord | undefined {
	return bestiary.find(
		(monster) => monster.season === season && monster.chapter === chapter,
	);
}

/**
 * Le monstre `record` du bestiaire dimensionné sur `budget` (game design § 3 et § 6) : pour chaque
 * stat, budget × profil × facteur d'échelle ; son profil et ses attaques relus (`designOf`).
 */
function sizedMonster(record: MonsterRecord, budget: Stats): Monster {
	const { profile, attacks } = designOf(record);
	return {
		stats: sizeMonster(budget, profile, record.scaleFactor),
		attacks,
		profile,
		trait: record.trait,
	};
}

/**
 * L'armée du combat : les joueurs arrivés avant `lastMidnight` (`listArmy`), chacun le personnage de
 * son identifiant, classe et stats calculées (`characterOf`), avec le sort de son numéro dans `pool`.
 */
async function armyOf(
	executor: Executor,
	lastMidnight: Date,
	pool: readonly Spell[],
): Promise<Fighter[]> {
	const spells = new Map(pool.map((spell) => [spell.number, spell]));
	return (await listArmy(executor, lastMidnight)).map(
		({ instagramId, spellNumber }) => {
			const { class: characterClass, stats } = characterOf(instagramId);
			// La clé étrangère de `players.spell_number` vers `spells` garantit le sort.
			const spell = spells.get(spellNumber) as Spell;
			return { id: instagramId, characterClass, stats, spell };
		},
	);
}

/** Les forcés du prochain combat, dans l'ordre de leur choix, sous la forme de `combat`. */
async function forcedOf(executor: Executor): Promise<Forced[]> {
	return (await readForced(executor)).map(
		({ instagramId, position, reason }) => ({
			id: instagramId,
			position,
			reason,
		}),
	);
}

/** Le refus d'un second combat à la date `date` (issue #21, Décisions, 9). */
function dateTaken(date: string): string {
	return `un combat a déjà eu lieu le ${date} : un seul combat par jour, jamais relancé`;
}

/**
 * La date du dernier combat joué dans la saison, `undefined` avant le premier. Les combats se jouent
 * un par date, dans l'ordre de leurs jours : un combat à la date du jour ne peut être que le dernier.
 */
async function lastFoughtOn(
	executor: Executor,
	{ season, combatsPlayed }: SeasonState,
): Promise<string | undefined> {
	// Avant le premier combat, le jour 0 n'en a aucun.
	return (await findCombat(executor, season, combatsPlayed))?.foughtOn;
}

/** Le refus d'une armée vide (issue #21, Décisions, 10). */
const EMPTY_ARMY =
	"l'armée du jour est vide : aucun joueur arrivé avant le dernier minuit (Europe/Paris)";

/**
 * Les refus d'un lancement que la saison permet, un par ligne : le monstre du chapitre de `state`
 * manque, chapitre nommé ; l'armée est vide ; chaque forcé de `forced` absent de `army`, nommé
 * (issue #21, Décisions, 4).
 */
function launchErrors(
	state: SeasonState,
	monster: MonsterRecord | undefined,
	army: readonly Fighter[],
	forced: readonly Forced[],
): string[] {
	const present = new Set(army.map(({ id }) => id));
	return [
		...(monster === undefined
			? [
					`le chapitre ${state.chapter} de la saison ${state.season} attend son monstre : creer_monstre le crée`,
				]
			: []),
		...(army.length === 0 ? [EMPTY_ARMY] : []),
		...forced
			.filter(({ id }) => !present.has(id))
			.map(
				({ id }) =>
					`le forcé ${id} n'est pas dans l'armée du jour : arrivé après le dernier minuit, ou retiré`,
			),
	];
}

/** Ce que le lancement du combat du jour lit, tout refus écarté : de quoi le décrire, puis le jouer. */
export interface LaunchPlan {
	/** La date du combat et son dernier minuit, au calendrier Europe/Paris. */
	calendar: ParisDay;
	state: SeasonState;
	bestiary: MonsterRecord[];
	/** Le monstre du chapitre en cours. */
	monster: MonsterRecord;
	/** La réserve entière, par numéro croissant, dans le modèle de `combat`. */
	pool: Spell[];
	army: Fighter[];
	forced: Forced[];
	settings: CalibrationSettings;
}

/**
 * Lit le lancement du combat du jour à l'instant `now`, ou le refuse sans rien écrire. L'état de la
 * saison se lit d'abord, verrouillé jusqu'à la fin de la transaction de `executor` : un retrait de
 * joueur ou un choix des forcés, qui prennent le même verrou, ne passe pas entre cette lecture et
 * l'écriture du journal. Refus, dans cet ordre, chacun seul :
 * - la saison est terminée, par son constat : « saison 1 terminée au jour N » (issue #21,
 *   Décisions, 5) ;
 * - un combat s'est déjà joué à cette date (Décisions, 9).
 * Puis ceux de `launchErrors`, tous ensemble.
 *
 * @throws {Error} chaque refus, de message les refus qu'il réunit.
 */
export async function planLaunch(
	executor: Executor,
	now = new Date(),
): Promise<LaunchPlan> {
	const state = seasonStateOf(
		await readSeasonState(executor, { forUpdate: true }),
	);
	const calendar = await parisCalendar(executor, now);
	const end = seasonEndNotice(state);
	if (end !== null) {
		throw new Error(end);
	}
	if ((await lastFoughtOn(executor, state)) === calendar.date) {
		throw new Error(dateTaken(calendar.date));
	}
	const bestiary = await listMonsters(executor);
	const pool = (await listSpells(executor)).map(spellOf);
	const army = await armyOf(executor, calendar.lastMidnight, pool);
	const forced = await forcedOf(executor);
	const monster = chapterMonster(bestiary, state);
	refuseIfAny(launchErrors(state, monster, army, forced));
	return {
		calendar,
		state,
		bestiary,
		// Refusé ci-dessus s'il manque.
		monster: monster as MonsterRecord,
		pool,
		army,
		forced,
		settings: await readCalibrationSettings(executor),
	};
}

/** Le prochain combat de la saison : son jour, son chapitre, sa tentative et son monstre. */
export interface NextCombat {
	day: number;
	chapter: number;
	attempt: number;
	/**
	 * Le monstre du chapitre, `null` s'il manque au bestiaire ; ses stats, dimensionnées sur le budget
	 * en cours, `null` tant que ce budget n'est pas fixé : au premier combat de la saison, il se fixe
	 * au lancement, sur l'armée du jour.
	 */
	monster: { name: string; stats: Stats | null } | null;
}

/**
 * L'état de la saison tel que les outils le rendent (PR #72, T7) : la saison ; l'issue du dernier
 * combat, `null` avant le premier ; son constat de fin, « saison 1 terminée au jour N », `null` tant
 * qu'elle continue ; et le prochain combat, `null` une fois la saison terminée.
 */
export interface SeasonView {
	season: number;
	lastOutcome: Outcome | null;
	end: string | null;
	next: NextCombat | null;
}

/** Le prochain combat de `state`, son monstre pris dans `bestiary`. */
function nextCombatOf(
	state: SeasonState,
	bestiary: readonly MonsterRecord[],
): NextCombat {
	const monster = chapterMonster(bestiary, state);
	const { chapter, attempt, budget } = state;
	return {
		day: dayOf(state),
		chapter,
		attempt,
		monster:
			monster === undefined
				? null
				: {
						name: monster.name,
						stats: budget && sizedMonster(monster, budgetOf(budget)).stats,
					},
	};
}

/** La saison `state` telle que les outils la rendent, son monstre pris dans `bestiary`. */
function seasonViewOf(
	state: SeasonState,
	bestiary: readonly MonsterRecord[],
): SeasonView {
	const end = seasonEndNotice(state);
	return {
		season: state.season,
		lastOutcome: state.lastOutcome,
		end,
		next: end === null ? nextCombatOf(state, bestiary) : null,
	};
}

/** L'état de la saison (`SeasonView`), lu sans verrou. */
export async function readSeason(executor: Executor): Promise<SeasonView> {
	return seasonViewOf(
		seasonStateOf(await readSeasonState(executor)),
		await listMonsters(executor),
	);
}

/** Ce qu'un lancement a joué et écrit. */
export interface LaunchReport {
	/** La date du combat, au calendrier Europe/Paris. */
	date: string;
	/** Le journal stocké du combat. */
	log: SeasonLog;
	/** L'état de la saison et p avant le combat. */
	before: SeasonTransition;
	/** L'état de la saison et p après lui (`afterCombat`). */
	after: SeasonTransition;
	/** La saison après le combat, telle que `readSeason` la rendra. */
	next: SeasonView;
}

/**
 * Le combat de `plan` (game design § 4) : l'armée du jour contre le monstre du chapitre, dimensionné
 * sur le budget en cours (`budgetForLaunch`), sur la graine de la saison, du chapitre et de la
 * tentative (`seedOf`). Rend aussi les stats de l'armée, les sommes de l'en-tête du journal, sur
 * lesquelles le budget s'est fixé au premier combat, et que `afterCombat` relit pour le suivant.
 */
function play({ state, monster, pool, army, forced }: LaunchPlan): {
	log: CombatLog;
	armyStats: Stats;
} {
	const armyStats = summarize(army).stats;
	const budget = budgetOf(budgetForLaunch(state, armyStats));
	const log = fight({
		army,
		monster: sizedMonster(monster, budget),
		seed: seedOf(state),
		poolVersion: poolVersionOf(pool),
		forced,
	});
	return { log, armyStats };
}

/**
 * Range le combat de `plan`, de journal stocké `log`. L'unicité de la date en base est le filet de la
 * lecture de `planLaunch` : un combat à cette date qu'elle n'aurait pas vu est refusé par le même
 * message.
 */
async function storeCombat(
	executor: Executor,
	{ calendar, monster }: LaunchPlan,
	log: SeasonLog,
): Promise<void> {
	const { season, chapter, day, attempt } = log.header;
	try {
		await insertCombat(executor, {
			foughtOn: calendar.date,
			season,
			chapter,
			day,
			attempt,
			monsterId: monster.id,
			outcome: log.summary.outcome,
			log,
		});
	} catch (error) {
		throw postgresErrorCode(error)?.constraint === COMBAT_DATE_UNIQUE
			? new Error(dateTaken(calendar.date))
			: error;
	}
}

/**
 * Lance le combat du jour à l'instant `now` (game design § 4 à § 7 ; issue #21) : lit et refuse
 * comme `planLaunch`, joue le combat, puis écrit son journal stocké, l'en-tête complété de la
 * saison, du chapitre, du jour, de la tentative, de p et des recrues de référence de ce lancement ;
 * l'état de la saison après lui (`afterCombat`) ; la liste des forcés vidée, que le combat consomme
 * (Décisions, 11) ; et p, s'il baisse (Décisions, 8). Tout s'écrit dans la transaction de
 * `executor`, que l'outil ouvre (Décisions, 9) : un échec en cours d'écriture ne laisse ni combat, ni
 * état avancé, ni p baissé.
 *
 * @throws {Error} les refus de `planLaunch`, rien n'étant écrit.
 */
export async function launchCombat(
	executor: Executor,
	now = new Date(),
): Promise<LaunchReport> {
	const plan = await planLaunch(executor, now);
	const { calendar, state, settings } = plan;
	const { log, armyStats } = play(plan);
	const referenceRecruits = referenceRecruitsOf(
		await dailyArrivals(
			executor,
			calendar.lastMidnight,
			settings.referenceWindowDays,
		),
	);
	const after = afterCombat(state, {
		outcome: log.summary.outcome,
		army: armyStats,
		referenceRecruits,
		settings: seasonSettingsOf(settings),
	});
	const stored = seasonLogOf(log, {
		...state,
		day: dayOf(state),
		recruitShare: settings.recruitShare,
		referenceRecruits,
	});
	await storeCombat(executor, plan, stored);
	await writeSeasonState(executor, after.state);
	await replaceForced(executor, []);
	if (after.recruitShare !== settings.recruitShare) {
		await updateCalibrationSettings(executor, {
			recruitShare: after.recruitShare,
		});
	}
	return {
		date: calendar.date,
		log: stored,
		before: { state, recruitShare: settings.recruitShare },
		after,
		next: seasonViewOf(after.state, plan.bestiary),
	};
}
