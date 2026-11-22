import {
	CLASS_RANGES,
	type Character,
	type ClassKey,
	type ClassRanges,
	openStats,
	STAT_KEYS,
	STATS_TOTAL,
	type StatKey,
	type Stats,
	startingStats,
	statsTotal,
} from "./character.ts";

/** Les niveaux de verdict, du mal né à l'excellent. */
export const VERDICT_LEVELS = [
	"ill_born",
	"weak",
	"average",
	"gifted",
	"excellent",
] as const;
export type VerdictLevel = (typeof VERDICT_LEVELS)[number];

/** Les coupures du centile entre deux niveaux, pour une cible de 10 / 20 / 40 / 20 / 10 %. */
const CENTILE_CUTS = [0.1, 0.3, 0.7, 0.9];

// La loi exacte du score dans chaque classe, score → probabilité, calculée à son premier verdict.
const scoreDistributions = new Map<ClassKey, ReadonlyMap<number, number>>();

/**
 * Le niveau de verdict d'un personnage : son rang parmi les personnages de sa classe, selon son
 * score, la somme des stats que rend `scoringStatsOf`. Le rang est le centile milieu du score s
 * dans la loi exacte du tirage de la classe, P(score < s) + P(score = s) / 2, coupé à 0,1 / 0,3 /
 * 0,7 / 0,9 : le niveau est le nombre de coupures qu'il atteint. Aucun seuil n'est écrit à la
 * main : une classe ajoutée ou réglée suit.
 *
 * Les flottants suffisent. Chaque point se partage entre 1 à 4 stats : les probabilités n'ont que
 * des 2 et des 3 au dénominateur, les coupures ont un 5, et aucun centile n'en égale une. La marge
 * la plus fine est de 0,001 (Vampire), mesurée en fractions exactes le 2026-11-17.
 */
export function verdictOf(character: Character): VerdictLevel {
	const score = scoreOf(character.stats, scoringStatsOf(character));
	let centile = 0;
	for (const [value, probability] of classScoreDistribution(character.class)) {
		if (value < score) centile += probability;
		else if (value === score) centile += probability / 2;
	}
	const reached = CENTILE_CUTS.filter((cut) => cut <= centile).length;
	return VERDICT_LEVELS[reached] as VerdictLevel;
}

/**
 * Les stats qui font le score du verdict : les stats fortes de la classe, celles au plus haut
 * maximum de l'annexe A, dans l'ordre de `STAT_KEYS` ; quand les quatre le sont, la meilleure
 * seule, la première de `STAT_KEYS` à égalité.
 */
export function scoringStatsOf(character: Character): StatKey[] {
	return scoringStats(
		character.stats,
		strongStatsOf(CLASS_RANGES[character.class]),
	);
}

function classScoreDistribution(
	classKey: ClassKey,
): ReadonlyMap<number, number> {
	let distribution = scoreDistributions.get(classKey);
	if (distribution === undefined) {
		distribution = scoreDistributionOf(CLASS_RANGES[classKey]);
		scoreDistributions.set(classKey, distribution);
	}
	return distribution;
}

function strongStatsOf(ranges: ClassRanges): StatKey[] {
	const highest = Math.max(...STAT_KEYS.map((key) => ranges[key][1]));
	return STAT_KEYS.filter((key) => ranges[key][1] === highest);
}

function scoringStats(stats: Stats, strongStats: StatKey[]): StatKey[] {
	if (strongStats.length < STAT_KEYS.length) {
		return strongStats;
	}
	// Quatre stats fortes font toujours 30 : la meilleure les départage, la première à égalité.
	const best = strongStats.reduce((a, b) => (stats[b] > stats[a] ? b : a));
	return [best];
}

function scoreOf(stats: Stats, keys: readonly StatKey[]): number {
	return keys.reduce((total, key) => total + stats[key], 0);
}

/**
 * La loi exacte du score, par programmation dynamique sur le tirage de `characterOf` : partie des
 * minimums, chaque répartition donne à chaque stat encore sous son maximum une part égale du point
 * suivant, jusqu'à 30.
 */
function scoreDistributionOf(ranges: ClassRanges): Map<number, number> {
	const strongStats = strongStatsOf(ranges);
	const start = startingStats(ranges);
	let layer = new Map([[layerKey(start), { stats: start, probability: 1 }]]);
	for (let points = statsTotal(start); points < STATS_TOTAL; points++) {
		const next: typeof layer = new Map();
		for (const { stats, probability } of layer.values()) {
			const open = openStats(stats, ranges);
			const share = probability / open.length;
			for (const key of open) {
				const grown = { ...stats, [key]: stats[key] + 1 };
				const grownKey = layerKey(grown);
				const reached = next.get(grownKey);
				if (reached === undefined) {
					next.set(grownKey, { stats: grown, probability: share });
				} else {
					reached.probability += share;
				}
			}
		}
		layer = next;
	}
	const distribution = new Map<number, number>();
	for (const { stats, probability } of layer.values()) {
		const score = scoreOf(stats, scoringStats(stats, strongStats));
		distribution.set(score, (distribution.get(score) ?? 0) + probability);
	}
	return distribution;
}

function layerKey(stats: Stats): string {
	return STAT_KEYS.map((key) => stats[key]).join(",");
}
