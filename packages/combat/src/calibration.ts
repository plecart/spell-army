/**
 * Le calibrage (game design § 6) : le budget du prochain monstre, calculé sans base ni horloge.
 * L'appelant fournit l'armée, les arrivées par date et les réglages ; le monstre se dimensionne
 * ensuite sur ce budget (`sizeMonster`).
 */
import { type Stats, statsOf } from "./spell.ts";

/** N recrues moyennes : le budget du jour 2 (game design § 6, « Jour 2 »). */
interface Recruits {
	recruits: number;
	averageRecruit: Stats;
}

/**
 * Les termes de la formule (game design § 6, « Calcul du prochain monstre ») : stats réelles de
 * l'armée, recrues de référence, recrue moyenne et p, la part des recrues de référence comptée.
 */
interface Formula {
	army: Stats;
	referenceRecruits: number;
	averageRecruit: Stats;
	recruitShare: number;
}

/**
 * Le budget d'un monstre tel qu'il a été fixé : la règle qui l'a fixé et ses composantes, pour le
 * recalculer à la baisse de p (issue #21, Décisions, 6). Que des nombres et des textes : il passe
 * en JSON tel quel.
 * - `army` : l'armée seule, le premier combat de la saison (le monstre « de sa force ») ;
 * - `recruits` : N recrues moyennes, le chapitre 2 fixé après une victoire au premier combat ;
 * - `formula` : la formule, les chapitres suivants ;
 * - `larger` : le plus grand des deux précédents, stat par stat, le chapitre 2 fixé après une
 *   victoire plus tardive (issue #21, Décisions, 2).
 */
export type BudgetComponents =
	| { kind: "army"; army: Stats }
	| ({ kind: "recruits" } & Recruits)
	| ({ kind: "formula" } & Formula)
	| ({ kind: "larger" } & Recruits & Formula);

/**
 * Le budget d'un monstre, stat par stat, selon sa règle :
 * - armée seule : les stats de l'armée ;
 * - N recrues : N × recrue moyenne ;
 * - formule : armée + p × recrues de référence × recrue moyenne ;
 * - le plus grand : pour chaque stat, le plus grand de N recrues et de la formule.
 *
 * @example une armée de 100 partout, p = 0,7, 20 recrues de référence, recrue moyenne de départ
 * (Vie 7,6) : Vie 100 + 0,7 × 20 × 7,6 = 206,4.
 */
export function budgetOf(components: BudgetComponents): Stats {
	switch (components.kind) {
		case "army":
			return components.army;
		case "recruits":
			return recruitsBudget(components);
		case "formula":
			return formulaBudget(components);
		case "larger": {
			const recruits = recruitsBudget(components);
			const formula = formulaBudget(components);
			return statsOf((stat) => Math.max(recruits[stat], formula[stat]));
		}
	}
}

/**
 * Les mêmes composantes, leur p ramené à `recruitShare` s'il est plus bas : le monstre recalculé à
 * la baisse de p « ne peut que rétrécir » (game design § 6), même si le mainteneur a relevé p depuis
 * qu'il a été fixé. Une règle sans terme en p rend ses composantes telles quelles.
 */
export function lowerShare(
	components: BudgetComponents,
	recruitShare: number,
): BudgetComponents {
	if (!("recruitShare" in components)) return components;
	return {
		...components,
		recruitShare: Math.min(components.recruitShare, recruitShare),
	};
}

/**
 * Les recrues de référence (game design § 6, « Recrues de référence ») : la médiane du nombre de
 * joueurs arrivés par date sur la fenêtre ; une fenêtre paire prend la moyenne des deux valeurs du
 * milieu. Une date sans arrivée vaut 0, et c'est à l'appelant de la fournir.
 *
 * @example `referenceRecruitsOf([10, 30, 20])` vaut 20 ; `referenceRecruitsOf([10, 40, 0, 30])`,
 * (10 + 30) / 2 = 20.
 * @throws {RangeError} si la fenêtre est vide : elle n'a pas de médiane.
 */
export function referenceRecruitsOf(dailyArrivals: readonly number[]): number {
	if (dailyArrivals.length === 0) {
		throw new RangeError("la fenêtre des recrues de référence est vide");
	}
	const sorted = dailyArrivals.toSorted((a, b) => a - b);
	const middle = sorted.length / 2;
	// Deux rangs de la fenêtre, non vide : le même au milieu d'une fenêtre impaire. Le `?? 0` ne sert
	// qu'au typage d'un accès par rang.
	const low = sorted[Math.ceil(middle) - 1] ?? 0;
	const high = sorted[Math.floor(middle)] ?? 0;
	return (low + high) / 2;
}

function recruitsBudget({ recruits, averageRecruit }: Recruits): Stats {
	return statsOf((stat) => recruits * averageRecruit[stat]);
}

function formulaBudget(formula: Formula): Stats {
	const { army, referenceRecruits, averageRecruit, recruitShare } = formula;
	return statsOf(
		(stat) =>
			army[stat] + recruitShare * referenceRecruits * averageRecruit[stat],
	);
}
