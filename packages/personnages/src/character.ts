import { diceOf } from "./dice.ts";

/**
 * Les classes, dans l'ordre de l'annexe A du game design. Ordre figé : la classe se tire par rang.
 */
export const CLASS_KEYS = [
	"wizard",
	"golem",
	"warrior",
	"dwarf",
	"vampire",
	"druid",
	"peasant",
	"fairy",
] as const;
export type ClassKey = (typeof CLASS_KEYS)[number];

/** Les stats, dans l'ordre où le tirage les parcourt. Ordre figé, comme celui des classes. */
export const STAT_KEYS = ["life", "strength", "magic", "speed"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** Des entiers de 0 à 15 dont la somme fait 30 (game design § 1, « Statistiques » et « Total »). */
export type Stats = Record<StatKey, number>;

export interface Character {
	class: ClassKey;
	stats: Stats;
}

/** La plage d'une stat, bornes comprises. */
type StatRange = readonly [min: number, max: number];
export type ClassRanges = Readonly<Record<StatKey, StatRange>>;

/** Annexe A du game design : la plage de chaque stat, par classe. */
export const CLASS_RANGES: Readonly<Record<ClassKey, ClassRanges>> = {
	wizard: { life: [0, 8], strength: [0, 10], magic: [5, 15], speed: [0, 8] },
	golem: { life: [7, 14], strength: [8, 15], magic: [0, 3], speed: [0, 3] },
	warrior: { life: [4, 11], strength: [8, 15], magic: [0, 5], speed: [4, 11] },
	dwarf: { life: [6, 13], strength: [5, 12], magic: [0, 8], speed: [0, 8] },
	vampire: { life: [3, 10], strength: [3, 10], magic: [5, 12], speed: [5, 12] },
	druid: { life: [3, 10], strength: [0, 5], magic: [5, 12], speed: [5, 12] },
	peasant: { life: [0, 15], strength: [0, 15], magic: [0, 15], speed: [0, 15] },
	fairy: { life: [0, 5], strength: [0, 3], magic: [8, 15], speed: [8, 15] },
};

export const STATS_TOTAL = 30;

/**
 * Le personnage d'un identifiant Instagram (game design § 1, « Classe » et « Tirage des stats »).
 * La classe est tirée parmi les huit de `CLASS_KEYS`, à chances égales (flux `class`). Chaque stat
 * part de son minimum, puis chaque point restant jusqu'à 30 va à l'une des stats encore sous leur
 * maximum, à chances égales, prises dans l'ordre de `STAT_KEYS` (flux `stats`).
 *
 * @throws {RangeError} si l'identifiant n'est pas un texte non vide de chiffres décimaux, ou si
 * une classe ne peut atteindre 30 points (aucune stat ouverte).
 */
export function characterOf(instagramId: string): Character {
	const characterClass = diceOf("class", instagramId).pick(CLASS_KEYS);
	const ranges = CLASS_RANGES[characterClass];
	const dice = diceOf("stats", instagramId);
	const stats = startingStats(ranges);
	for (let points = statsTotal(stats); points < STATS_TOTAL; points++) {
		stats[dice.pick(openStats(stats, ranges))] += 1;
	}
	return { class: characterClass, stats };
}

/** Chaque stat à son minimum : le départ du tirage. */
export function startingStats(ranges: ClassRanges): Stats {
	return Object.fromEntries(
		STAT_KEYS.map((key) => [key, ranges[key][0]]),
	) as Stats;
}

/**
 * Les stats encore sous leur maximum, dans l'ordre de `STAT_KEYS` : elles se disputent le point
 * suivant.
 */
export function openStats(stats: Stats, ranges: ClassRanges): StatKey[] {
	return STAT_KEYS.filter((key) => stats[key] < ranges[key][1]);
}

export function statsTotal(stats: Stats): number {
	return STAT_KEYS.reduce((total, key) => total + stats[key], 0);
}
