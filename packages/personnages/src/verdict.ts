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

interface ClassVerdict {
	strongStats: readonly StatKey[];
	/** La loi exacte du score dans la classe : score → probabilité. */
	scoreDistribution: ReadonlyMap<number, number>;
}

const classVerdicts = new Map<ClassKey, ClassVerdict>();

/**
 * Le niveau de verdict d'un personnage : son rang parmi les personnages de sa classe, selon le
 * score de ses stats fortes. Les stats fortes d'une classe sont celles au plus haut maximum de
 * l'annexe A, et le score est leur somme, ou la meilleure d'entre elles quand les quatre sont
 * fortes. Le rang est le centile milieu du score s dans la loi exacte du tirage de la classe,
 * P(score < s) + P(score = s) / 2, coupé à 0,1 / 0,3 / 0,7 / 0,9 : le niveau est le nombre de
 * coupures qu'il atteint. Aucun seuil n'est écrit à la main : une classe ajoutée ou réglée suit.
 *
 * Les flottants suffisent. Chaque point se partage entre 1 à 4 stats : les probabilités n'ont que
 * des 2 et des 3 au dénominateur, les coupures ont un 5, et aucun centile n'en égale une. La marge
 * la plus fine est de 0,001 (Vampire), mesurée en fractions exactes le 2026-11-17.
 */
export function verdictOf(character: Character): VerdictLevel {
	const { strongStats, scoreDistribution } = classVerdictOf(character.class);
	const score = scoreOf(character.stats, strongStats);
	let centile = 0;
	for (const [value, probability] of scoreDistribution) {
		if (value < score) centile += probability;
		else if (value === score) centile += probability / 2;
	}
	const reached = CENTILE_CUTS.filter((cut) => cut <= centile).length;
	return VERDICT_LEVELS[reached] as VerdictLevel;
}

// Calculée une fois par classe, à son premier verdict.
function classVerdictOf(classKey: ClassKey): ClassVerdict {
	let classVerdict = classVerdicts.get(classKey);
	if (classVerdict === undefined) {
		const ranges = CLASS_RANGES[classKey];
		const strongStats = strongStatsOf(ranges);
		classVerdict = {
			strongStats,
			scoreDistribution: scoreDistributionOf(ranges, strongStats),
		};
		classVerdicts.set(classKey, classVerdict);
	}
	return classVerdict;
}

function strongStatsOf(ranges: ClassRanges): StatKey[] {
	const highest = Math.max(...STAT_KEYS.map((key) => ranges[key][1]));
	return STAT_KEYS.filter((key) => ranges[key][1] === highest);
}

function scoreOf(stats: Stats, strongStats: readonly StatKey[]): number {
	const values = strongStats.map((key) => stats[key]);
	// Quatre stats fortes font toujours 30 : la meilleure les départage.
	return values.length === STAT_KEYS.length
		? Math.max(...values)
		: values.reduce((total, value) => total + value, 0);
}

/**
 * La loi exacte du score, par programmation dynamique sur le tirage de `characterOf` : partie des
 * minimums, chaque répartition donne à chaque stat encore sous son maximum une part égale du point
 * suivant, jusqu'à 30.
 */
function scoreDistributionOf(
	ranges: ClassRanges,
	strongStats: readonly StatKey[],
): Map<number, number> {
	const start = startingStats(ranges);
	let layer = new Map([[layerKey(start), { stats: start, probability: 1 }]]);
	for (let points = statsTotal(start); points < STATS_TOTAL; points++) {
		const next: typeof layer = new Map();
		for (const { stats, probability } of layer.values()) {
			const open = openStats(stats, ranges);
			for (const key of open) {
				const grown = { ...stats, [key]: stats[key] + 1 };
				const share = probability / open.length;
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
		const score = scoreOf(stats, strongStats);
		distribution.set(score, (distribution.get(score) ?? 0) + probability);
	}
	return distribution;
}

function layerKey(stats: Stats): string {
	return STAT_KEYS.map((key) => stats[key]).join(",");
}
