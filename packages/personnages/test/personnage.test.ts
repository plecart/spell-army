import { describe, expect, test } from "vitest";
import {
	CLASS_KEYS,
	CLASS_RANGES,
	type ClassKey,
	characterOf,
	STAT_KEYS,
} from "../src/index.ts";
import { identifiers } from "./identifiants.ts";

// Annexe A du game design, recopiée : le test la confronte au code, jamais le code à lui-même.
const ANNEX_A = {
	wizard: { life: [0, 8], strength: [0, 10], magic: [5, 15], speed: [0, 8] },
	golem: { life: [7, 14], strength: [8, 15], magic: [0, 3], speed: [0, 3] },
	warrior: { life: [4, 11], strength: [8, 15], magic: [0, 5], speed: [4, 11] },
	dwarf: { life: [6, 13], strength: [5, 12], magic: [0, 8], speed: [0, 8] },
	vampire: { life: [3, 10], strength: [3, 10], magic: [5, 12], speed: [5, 12] },
	druid: { life: [3, 10], strength: [0, 5], magic: [5, 12], speed: [5, 12] },
	peasant: { life: [0, 15], strength: [0, 15], magic: [0, 15], speed: [0, 15] },
	fairy: { life: [0, 5], strength: [0, 3], magic: [8, 15], speed: [8, 15] },
} as const;
const ANNEX_A_CLASSES = Object.keys(ANNEX_A) as ClassKey[];
const ANNEX_A_STATS = ["life", "strength", "magic", "speed"] as const;

const CHARACTERS = identifiers(100_000).map((id) => characterOf(id));

describe("contrat du paquet", () => {
	test("les classes, dans l'ordre de l'annexe A, et les stats sont les clés exportées", () => {
		expect(CLASS_KEYS).toEqual(ANNEX_A_CLASSES);
		expect(STAT_KEYS).toEqual(ANNEX_A_STATS);
	});

	test("les plages exportées sont celles de l'annexe A", () => {
		expect(CLASS_RANGES).toEqual(ANNEX_A);
	});
});

test("l'identifiant 18446744073709551615 donne un personnage, le même à chaque appel", () => {
	const character = characterOf("18446744073709551615");

	expect(ANNEX_A_CLASSES).toContain(character.class);
	expect(characterOf("18446744073709551615")).toEqual(character);
});

test("l'identifiant reste un texte : des identifiants qu'un nombre JS confond donnent des personnages distincts", () => {
	// Les seize s'arrondissent au même nombre JS, 2 ** 64 : lus comme nombres, ils se confondraient.
	const neighbours = Array.from(
		{ length: 16 },
		(_, offset) => `184467440737095516${String(offset).padStart(2, "0")}`,
	);
	const distinct = new Set(
		neighbours.map((id) => JSON.stringify(characterOf(id))),
	);

	expect(new Set(neighbours.map(Number))).toEqual(new Set([2 ** 64]));
	expect(distinct.size).toBeGreaterThan(1);
});

test("sur les identifiants 1 à 100 000, chaque personnage a 30 points, chaque stat dans la plage de sa classe", () => {
	const deviations = CHARACTERS.filter(({ class: classKey, stats }) => {
		const total = ANNEX_A_STATS.reduce((sum, stat) => sum + stats[stat], 0);
		const outOfRange = ANNEX_A_STATS.some((stat) => {
			const value = stats[stat];
			const [min, max] = ANNEX_A[classKey][stat];
			const inStatScale = Number.isInteger(value) && value >= 0 && value <= 15;
			return !(inStatScale && value >= min && value <= max);
		});
		return total !== 30 || outOfRange;
	});

	expect(CHARACTERS).toHaveLength(100_000);
	expect(deviations).toEqual([]);
});

test.each(ANNEX_A_CLASSES)(
	"la classe %s est valide : Σ minimums ≤ 30 ≤ Σ maximums",
	(classKey) => {
		const ranges = Object.values(CLASS_RANGES[classKey]);
		const minimums = ranges.reduce((sum, [min]) => sum + min, 0);
		const maximums = ranges.reduce((sum, [, max]) => sum + max, 0);

		expect(minimums).toBeLessThanOrEqual(30);
		expect(maximums).toBeGreaterThanOrEqual(30);
	},
);

test("sur les identifiants 1 à 80 000, chaque classe compte entre 9 400 et 10 600 personnages", () => {
	const counts = Object.fromEntries(
		ANNEX_A_CLASSES.map((classKey) => [classKey, 0]),
	);
	for (const { class: classKey } of CHARACTERS.slice(0, 80_000)) {
		counts[classKey] = (counts[classKey] ?? 0) + 1;
	}
	const outside = Object.entries(counts).filter(
		([, count]) => count < 9_400 || count > 10_600,
	);

	expect(Object.keys(counts)).toEqual(ANNEX_A_CLASSES);
	expect(outside).toEqual([]);
});
