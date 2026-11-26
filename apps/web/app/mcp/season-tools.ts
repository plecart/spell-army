import {
	dayOf,
	type Forced,
	type Outcome,
	type SeasonTransition,
} from "combat";
import {
	type Executor,
	type ForcedRecord,
	findCombat,
	playersAmong,
	readSeasonState,
	replaceForced,
} from "donnees";
import { z } from "zod";
import { text } from "./bounds.ts";
import {
	type LaunchPlan,
	launchCombat,
	planLaunch,
	readSeason,
	type SeasonView,
} from "./season.ts";
import { MAX_DESCRIPTION_LENGTH } from "./spell-vocabulary.ts";
import { type McpTool, refuseIfAny } from "./tool.ts";
import {
	instagramId,
	inverse,
	renamed,
	STATS,
	toolStats,
} from "./vocabulary.ts";

// La saison pilotée par le MCP (issue #21) dans les noms français des outils : les forcés du
// prochain combat, le lancement du combat du jour, son journal et l'état de la saison. Le service
// qu'ils appellent est `season.ts`.

/** Le nom de chaque position d'un forcé dans les outils (game design § 5, « Position »). */
const POSITIONS = {
	first: "premier",
	last: "dernier",
	middle: "milieu",
} as const satisfies Record<Forced["position"], string>;

/** La position du modèle de chaque nom de position des outils. */
const POSITION_OF = inverse(POSITIONS);

/** Le nom de chaque issue d'un combat dans les outils (game design § 4). */
const OUTCOMES = {
	victory: "victoire",
	defeat: "defaite",
	exhaustion: "epuisement",
} as const satisfies Record<Outcome, string>;

const READ_ONLY = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
};

/** Un forcé du prochain combat dans le vocabulaire des outils, en entrée comme en sortie. */
const toolForced = z.strictObject({
	identifiant: instagramId.describe(
		"L'identifiant du joueur forcé, tel que chercher_joueur le rend ; jamais un pseudo.",
	),
	position: z
		.enum(POSITIONS)
		.describe(
			"premier : les premières actions de l'armée ; dernier : sa première action en phase finale, un camp sous 25 % de sa Vie ; milieu : une action tirée par la graine entre la 2e et la 10e (game design § 5).",
		),
	motif: text(MAX_DESCRIPTION_LENGTH).describe(
		`La raison du choix, extérieure au jeu, un commentaire ou un partenaire, que le journal du combat garde : non vide, au plus ${MAX_DESCRIPTION_LENGTH} caractères, sans les blancs qui l'entourent.`,
	),
});

type ToolForced = z.output<typeof toolForced>;

const forcedList = z.strictObject({
	forces: z
		.array(toolForced)
		.describe(
			"Les forcés du prochain combat, dans l'ordre du choix, chacun une fois ; la liste vide n'en garde aucun.",
		),
});

function toToolForced({
	instagramId,
	position,
	reason,
}: ForcedRecord): ToolForced {
	return {
		identifiant: instagramId,
		position: POSITIONS[position],
		motif: reason,
	};
}

function toForcedRecord({
	identifiant,
	position,
	motif,
}: ToolForced): ForcedRecord {
	return {
		instagramId: identifiant,
		position: POSITION_OF[position],
		reason: motif,
	};
}

/** Le refus de chaque identifiant que `forces` porte plus d'une fois, nommé une fois. */
function repeatedErrors(forces: readonly ToolForced[]): string[] {
	const ids = forces.map(({ identifiant }) => identifiant);
	const repeated = new Set(
		ids.filter((id, index) => ids.indexOf(id) !== index),
	);
	return [...repeated].map(
		(id) => `le joueur ${id} est forcé deux fois : un forcé figure une fois`,
	);
}

/** Le refus de chaque identifiant de `forces` qui n'est celui d'aucun joueur, nommé une fois. */
async function unknownErrors(
	executor: Executor,
	forces: readonly ToolForced[],
): Promise<string[]> {
	const ids = [...new Set(forces.map(({ identifiant }) => identifiant))];
	const known = new Set(await playersAmong(executor, ids));
	return ids
		.filter((id) => !known.has(id))
		.map((id) => `aucun joueur d'identifiant ${id} : un forcé est un joueur`);
}

/**
 * `choisir_forces` (issue #21, Décisions, 4, 11 et 13) : remplace la liste entière, sans
 * confirmation — l'audit garde l'ancienne liste, comme celui de `modifier_reglages` les anciens
 * réglages. `destructiveHint` : la liste d'avant est écrasée ; `idempotentHint` : N appels
 * identiques laissent la même liste.
 */
export const chooseForcedTool: McpTool<typeof forcedList> = {
	name: "choisir_forces",
	title: "Choisir les forcés du prochain combat",
	description:
		"Remplace la liste entière des forcés du prochain combat (game design § 5) : des joueurs placés dans l'ordre de passage de l'armée, chacun à une position, premier, dernier ou milieu, et pour un motif extérieur au jeu, que le journal du combat garde. Refuse sans rien changer un identifiant qui n'est celui d'aucun joueur et un joueur forcé deux fois, chacun nommé. La liste vide retire tous les forcés ; le combat suivant consomme la liste. Rend la nouvelle liste ; le journal d'audit garde l'ancienne et la nouvelle.",
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: forcedList,
	output: forcedList,
	run: async (executor, { forces }) => {
		refuseIfAny([
			...repeatedErrors(forces),
			...(await unknownErrors(executor, forces)),
		]);
		const before = await replaceForced(executor, forces.map(toForcedRecord));
		const output = { forces };
		return {
			output,
			before: { forces: before.map(toToolForced) },
			after: output,
		};
	},
};

/** L'état de la saison dans le vocabulaire des outils (`SeasonView`). */
const toolSeason = z.strictObject({
	saison: z.int(),
	dernier_resultat: z
		.enum(OUTCOMES)
		.nullable()
		.describe("L'issue du dernier combat ; null avant le premier."),
	fin: z
		.string()
		.nullable()
		.describe(
			"« saison 1 terminée au jour N » après la victoire du dernier chapitre ; null tant que la saison continue.",
		),
	prochain_combat: z
		.strictObject({
			jour: z
				.int()
				.describe(
					"Le numéro du prochain combat dans la saison : 1 + les combats joués, sans trou pour un jour sans combat.",
				),
			chapitre: z.int(),
			tentative: z.int(),
			monstre: z
				.strictObject({
					nom: z.string(),
					stats: toolStats
						.nullable()
						.describe(
							"Ses stats, dimensionnées sur le budget en cours : budget × profil × facteur d'échelle ; null avant le premier combat, dont le budget se fixe au lancement, sur l'armée du jour.",
						),
				})
				.nullable()
				.describe(
					"Le monstre du chapitre ; null quand il manque au bestiaire, ce qui refuserait le lancement.",
				),
		})
		.nullable()
		.describe("Le prochain combat ; null une fois la saison terminée."),
});

/** L'état de la saison (`SeasonView`) dans le vocabulaire des outils, champ par champ. */
function toToolSeason({
	season,
	lastOutcome,
	end,
	next,
}: SeasonView): z.output<typeof toolSeason> {
	return {
		saison: season,
		dernier_resultat: lastOutcome === null ? null : OUTCOMES[lastOutcome],
		fin: end,
		prochain_combat: next && {
			jour: next.day,
			chapitre: next.chapter,
			tentative: next.attempt,
			monstre: next.monster && {
				nom: next.monster.name,
				stats: next.monster.stats && renamed(next.monster.stats, STATS),
			},
		},
	};
}

export const readSeasonTool: McpTool = {
	name: "lire_saison",
	title: "Lire l'état de la saison",
	description:
		"Lit l'état de la saison : le prochain combat, son jour, son chapitre, sa tentative, le monstre du chapitre et, son budget fixé, ses stats ; l'issue du dernier combat ; et, une fois le dernier chapitre gagné, « saison 1 terminée au jour N ».",
	annotations: READ_ONLY,
	input: z.strictObject({}),
	output: toolSeason,
	run: async (executor) => ({
		output: toToolSeason(await readSeason(executor)),
	}),
};

/** Ce que fera le lancement de `plan`, pour le mainteneur. */
function describeLaunch({
	calendar,
	state,
	monster,
	army,
	forced,
}: LaunchPlan): string {
	const forcedText =
		forced.length === 0
			? "sans forcé"
			: `forcés : ${forced
					.map(
						({ id, position, reason }) =>
							`${id} (${POSITIONS[position]}, « ${reason} »)`,
					)
					.join(", ")}`;
	return `Lancera le combat du ${calendar.date}, jour ${dayOf(state)} de la saison ${state.season} : chapitre ${state.chapter}, tentative ${state.attempt}, contre le monstre « ${monster.name} », avec une armée de ${army.length} : les joueurs arrivés avant le dernier minuit (Europe/Paris) ; ${forcedText}. Le combat se joue une fois : son journal, l'état de la saison et, s'il baisse, p s'écrivent pour de bon, et la liste des forcés se vide. Un seul combat par jour, jamais relancé. Sans annulation.`;
}

/**
 * La saison et p tels que l'audit de `lancer_combat` les garde (PR #72, T6) : l'état de la saison,
 * dans le modèle de `combat`, et p seulement quand le combat le change.
 */
function audited(
	{ state, recruitShare }: SeasonTransition,
	shareChanged: boolean,
) {
	return shareChanged ? { etat: state, p: recruitShare } : { etat: state };
}

const launched = z.strictObject({
	jour: z.int(),
	date: z.iso.date(),
	chapitre: z.int(),
	tentative: z.int(),
	issue: z.enum(OUTCOMES),
	actions: z.int().describe("Le nombre d'actions du combat, des deux camps."),
	saison: toolSeason.describe(
		"L'état de la saison après le combat, comme lire_saison le rend.",
	),
});

/**
 * `lancer_combat` (issue #21 ; Décisions, 9 et 13), irréversible : l'enrobage exige un code de
 * confirmation (ADR 0005, « Décisions », ligne « Confirmation »), et `confirmation` décrit le
 * lancement, ou le refuse, d'après l'état présent. `idempotentHint` faux : rejoué le même jour, il
 * est refusé, mais un autre jour il lance un autre combat.
 */
export const launchCombatTool: McpTool = {
	name: "lancer_combat",
	title: "Lancer le combat du jour",
	description:
		"Lance le combat du jour, un seul par date (Europe/Paris), jamais relancé : l'armée des joueurs arrivés avant le dernier minuit, sans les retirés, contre le monstre du chapitre en cours, dimensionné sur son budget (budget × profil × facteur d'échelle), avec les forcés de choisir_forces, qu'il consomme. Dans une seule transaction, range le combat et son journal et fait avancer la saison : une victoire passe au chapitre suivant ; une défaite, épuisement compris, rejoue le chapitre à la tentative suivante, et p baisse à chaque deuxième défaite de suite. Refuse sans rien écrire une saison terminée, un combat déjà joué à cette date, un chapitre sans monstre, une armée vide et un forcé absent de l'armée du jour, chacun nommé. Rend le jour, la date, le chapitre, la tentative, l'issue, le nombre d'actions et l'état de la saison après le combat ; lire_journal relit son journal ; le journal d'audit garde l'état de la saison avant et après, et p quand il change.",
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: false,
		openWorldHint: false,
	},
	input: z.strictObject({}),
	output: launched,
	confirmation: async (executor) => describeLaunch(await planLaunch(executor)),
	run: async (executor) => {
		const { date, log, before, after, next } = await launchCombat(executor);
		const { header, summary } = log;
		const shareChanged = after.recruitShare !== before.recruitShare;
		return {
			output: {
				jour: header.day,
				date,
				chapitre: header.chapter,
				tentative: header.attempt,
				issue: OUTCOMES[summary.outcome],
				actions: summary.actionCount,
				saison: toToolSeason(next),
			},
			before: audited(before, shareChanged),
			after: audited(after, shareChanged),
		};
	},
};

const logRequest = z.strictObject({
	jour: z
		.int32()
		.min(1)
		.describe(
			"Le jour du combat, son numéro dans la saison en cours : 1 pour le premier.",
		),
});

// Un objet du journal stocké, que le schéma ne détaille pas : `seasonLogOf` l'a écrit.
const logPart = z.record(z.string(), z.unknown());

/**
 * `lire_journal` (PR #72, T8) : le journal stocké tel quel, que le lancement a écrit, dans le
 * vocabulaire de `combat`.
 *
 * ponytail: le journal entier en une réponse, répété en texte et en `structuredContent` ; celui
 * d'un combat arrêté par épuisement, 10 000 actions, fait 2 576 086 caractères en JSON (un soin seul
 * contre un monstre inoffensif, Node 24.3, mesuré le 2026-11-26). Une lecture des actions par
 * tranche, s'il faut un jour en lire un.
 */
export const readLogTool: McpTool<typeof logRequest> = {
	name: "lire_journal",
	title: "Lire le journal d'un combat",
	description:
		"Lit le journal stocké du combat de ce jour dans la saison en cours, tel quel, sous les noms du moteur de combat : l'en-tête (versions des règles et de la réserve, saison, chapitre, jour, tentative, graine, monstre, armée, p, recrues de référence, forcés), les actions dans l'ordre, et le bilan (issue, nombre d'actions, Vie restante des deux camps, tirés, forcés non atteints). Un joueur retiré y figure sous « retiré ». Refuse un jour sans combat.",
	annotations: READ_ONLY,
	input: logRequest,
	output: z.strictObject({
		jour: z.int(),
		date: z.iso.date(),
		journal: z.strictObject({
			header: logPart,
			actions: z.array(logPart),
			summary: logPart,
		}),
	}),
	run: async (executor, { jour }) => {
		const { season } = await readSeasonState(executor);
		const combat = await findCombat(executor, season, jour);
		if (combat === undefined) {
			throw new Error(`aucun combat au jour ${jour} de la saison ${season}`);
		}
		return { output: { jour, date: combat.foughtOn, journal: combat.log } };
	},
};
