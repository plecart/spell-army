/**
 * La saison (game design § 7) : son état, la graine de chaque combat et la transition après un
 * combat, sans base ni horloge. Lancer le combat, choisir l'armée du jour et écrire l'état, le
 * journal et p en base reviennent à l'appelant.
 */
import { type BudgetComponents, capRecruitShare } from "./calibration.ts";
import type { Outcome } from "./log.ts";
import { sha256Hex } from "./sha256.ts";
import type { Stats } from "./spell.ts";

/**
 * Le nombre de chapitres d'une saison (game design § 7, « Y » ; issue #21, Décisions, 5) : la
 * victoire du 30e la termine.
 */
export const SEASON_CHAPTERS = 30;

/** Les défaites de suite d'une paire : p baisse à chacune (game design § 6, « Baisse de p »). */
const DEFEATS_PER_DROP = 2;

/**
 * Les décimales de p gardées après une baisse : la soustraction en virgule flottante laisse un
 * résidu (0,4 − 0,1 = 0,30000000000000004, et sept baisses de 0,1 depuis 0,7 laissent 2,8 × 10⁻¹⁷
 * au lieu de 0), que l'arrondi efface. Un p réglé avec plus de neuf décimales y perd les suivantes.
 */
const SHARE_DECIMALS = 9;

/**
 * L'état d'une saison, en JSON tel quel :
 * - `season`, `chapter`, `attempt` : saison, chapitre en cours (1 à 30), tentative du chapitre ;
 * - `combatsPlayed` : les combats joués dans la saison ; le prochain se joue au jour
 *   `combatsPlayed + 1` (`dayOf`) ;
 * - `defeatStreak` : les défaites de suite, épuisement compris ;
 * - `budget` : le budget du monstre du prochain combat, `null` avant le premier combat — il se fixe
 *   au lancement sur l'armée du jour (`budgetForLaunch`) — et après la fin de la saison ;
 * - `lastOutcome` : l'issue du dernier combat, `null` avant le premier ;
 * - `endDay` : le jour de la victoire du dernier chapitre, `null` tant que la saison continue.
 */
export interface SeasonState {
	season: number;
	chapter: number;
	attempt: number;
	combatsPlayed: number;
	defeatStreak: number;
	budget: BudgetComponents | null;
	lastOutcome: Outcome | null;
	endDay: number | null;
}

/** Le début de la saison 1 : chapitre 1, tentative 1, aucun combat joué. */
export const SEASON_START: Readonly<SeasonState> = {
	season: 1,
	chapter: 1,
	attempt: 1,
	combatsPlayed: 0,
	defeatStreak: 0,
	budget: null,
	lastOutcome: null,
	endDay: null,
};

/**
 * Les réglages du calibrage que lit la transition (`calibration_settings`, game design § 6) : p, la
 * baisse de p, la recrue moyenne et le nombre de recrues moyennes du budget du jour 2.
 */
export interface SeasonSettings {
	recruitShare: number;
	recruitShareDrop: number;
	averageRecruit: Stats;
	dayTwoBudgetRecruits: number;
}

/**
 * Ce que la transition lit d'un combat joué : son issue ; les stats réelles de son armée (sommes) ;
 * les recrues de référence de ce jour (`referenceRecruitsOf`) ; les réglages en base à ce moment.
 */
export interface CombatResult {
	outcome: Outcome;
	army: Stats;
	referenceRecruits: number;
	settings: SeasonSettings;
}

/** La saison après un combat, et le p à écrire en base : inchangé, ou baissé. */
export interface SeasonTransition {
	state: SeasonState;
	recruitShare: number;
}

/**
 * La graine d'un combat (game design § 4, « Déterminisme ») : SHA-256 de
 * `<saison>:<chapitre>:<tentative>`, en hexadécimal. Le séparateur garde distincts deux triplets
 * que leurs chiffres seuls confondraient, (1, 11, 1) et (11, 1, 1).
 *
 * @example `seedOf(state)` au premier combat : SHA-256 de « 1:1:1 », 64 caractères hexadécimaux.
 */
export function seedOf({
	season,
	chapter,
	attempt,
}: Pick<SeasonState, "season" | "chapter" | "attempt">): string {
	return sha256Hex(`${season}:${chapter}:${attempt}`);
}

/** Le jour du prochain combat : son numéro dans la saison (issue #21, Décisions, 3). */
export function dayOf(state: SeasonState): number {
	return state.combatsPlayed + 1;
}

/**
 * Le budget du monstre du prochain combat : celui de l'état ; au premier combat de la saison, qui
 * n'en a pas encore, l'armée du jour seule (game design § 6 : le jour 1, un monstre « de sa
 * force »). `afterCombat` le garde, une défaite rejouant le même monstre.
 *
 * @throws {RangeError} si la saison est terminée : « saison 1 terminée au jour 34 ».
 */
export function budgetForLaunch(
	state: SeasonState,
	army: Stats,
): BudgetComponents {
	assertOngoing(state);
	return currentBudget(state, army);
}

/**
 * Le budget du monstre de l'état ; au premier combat de la saison, qui n'en a pas encore, l'armée
 * `army` seule.
 */
function currentBudget(state: SeasonState, army: Stats): BudgetComponents {
	return state.budget ?? { kind: "army", army };
}

/**
 * La saison après un combat (game design § 6 et § 7 ; issue #21, Décisions, 2, 3, 5, 6 et 10) :
 * - toujours : un combat joué de plus, l'issue en dernier résultat ;
 * - victoire : chapitre suivant, tentative 1, défaites de suite à 0, budget du chapitre suivant
 *   fixé maintenant, p inchangé ; victoire du chapitre 30 : saison terminée au jour de ce combat,
 *   sans budget suivant ;
 * - défaite ou épuisement : même chapitre, tentative + 1, une défaite de suite de plus ; à chaque
 *   paire (2e, 4e, 6e…), p baisse du réglage, plancher 0, et le budget en cours est recalculé avec
 *   ce p — il ne peut que rétrécir ; sinon le même budget et le même p.
 *
 * @example `afterCombat(SEASON_START, { outcome: "victory", army, referenceRecruits: 20,
 * settings })` : chapitre 2, tentative 1, budget de `settings.dayTwoBudgetRecruits` recrues
 * moyennes.
 * @throws {RangeError} si la saison est terminée : « saison 1 terminée au jour 34 ».
 */
export function afterCombat(
	state: SeasonState,
	result: CombatResult,
): SeasonTransition {
	assertOngoing(state);
	const { state: next, recruitShare } =
		result.outcome === "victory"
			? afterVictory(state, result)
			: afterDefeat(state, result);
	return {
		state: {
			...next,
			combatsPlayed: state.combatsPlayed + 1,
			lastOutcome: result.outcome,
		},
		recruitShare,
	};
}

/** La victoire : le chapitre suivant et son budget, ou la fin de la saison au dernier chapitre. */
function afterVictory(
	state: SeasonState,
	result: CombatResult,
): SeasonTransition {
	const won = { ...state, defeatStreak: 0 };
	const { recruitShare } = result.settings;
	if (state.chapter === SEASON_CHAPTERS) {
		return {
			state: { ...won, budget: null, endDay: dayOf(state) },
			recruitShare,
		};
	}
	return {
		state: {
			...won,
			chapter: state.chapter + 1,
			attempt: 1,
			budget: nextChapterBudget(state, result),
		},
		recruitShare,
	};
}

/**
 * La défaite, épuisement compris : le même chapitre et le même budget, sauf à une paire de défaites
 * de suite, où p baisse et le budget se recalcule avec lui.
 */
function afterDefeat(
	state: SeasonState,
	{ army, settings }: CombatResult,
): SeasonTransition {
	const defeatStreak = state.defeatStreak + 1;
	const lost = { ...state, attempt: state.attempt + 1, defeatStreak };
	const budget = currentBudget(state, army);
	if (defeatStreak % DEFEATS_PER_DROP !== 0) {
		return {
			state: { ...lost, budget },
			recruitShare: settings.recruitShare,
		};
	}
	const recruitShare = loweredShare(settings);
	return {
		state: { ...lost, budget: capRecruitShare(budget, recruitShare) },
		recruitShare,
	};
}

/**
 * Le budget du chapitre qui suit `state.chapter`, fixé juste après sa victoire (game design § 6) :
 * - le chapitre 2 après une victoire au premier combat : N recrues moyennes ;
 * - le chapitre 2 après une victoire plus tardive : le plus grand de N recrues et de la formule ;
 * - les suivants : la formule, au p du moment.
 */
function nextChapterBudget(
	state: SeasonState,
	{ army, referenceRecruits, settings }: CombatResult,
): BudgetComponents {
	const { recruitShare, averageRecruit, dayTwoBudgetRecruits } = settings;
	const formula = { army, referenceRecruits, averageRecruit, recruitShare };
	if (state.chapter > 1) return { kind: "formula", ...formula };
	const recruits = { recruits: dayTwoBudgetRecruits, averageRecruit };
	if (state.combatsPlayed === 0) return { kind: "recruits", ...recruits };
	return { kind: "larger", ...recruits, ...formula };
}

/** p baissé du réglage, plancher 0, sans résidu de virgule flottante (`SHARE_DECIMALS`). */
function loweredShare({
	recruitShare,
	recruitShareDrop,
}: SeasonSettings): number {
	const lowered = recruitShare - recruitShareDrop;
	return Math.max(0, Number(lowered.toFixed(SHARE_DECIMALS)));
}

/**
 * Le constat de fin de la saison (issue #21, Décisions, 5) : « saison 1 terminée au jour 34 » après
 * la victoire du dernier chapitre ; `null` tant qu'elle continue.
 */
export function seasonEndNotice({
	season,
	endDay,
}: SeasonState): string | null {
	return endDay === null ? null : `saison ${season} terminée au jour ${endDay}`;
}

/** @throws {RangeError} si la saison est terminée, de message son constat de fin. */
function assertOngoing(state: SeasonState): void {
	const notice = seasonEndNotice(state);
	if (notice !== null) {
		throw new RangeError(notice);
	}
}
