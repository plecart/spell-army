import { expect, test } from "vitest";
import {
	type ClassKey,
	characterOf,
	type StatKey,
	type Stats,
	scoringStatsOf,
	VERDICT_LEVELS,
	verdictOf,
} from "../src/index.ts";
import { idsOf, population } from "./identifiants.ts";

const LEVELS = ["ill_born", "weak", "average", "gifted", "excellent"];

// Table « Verdict — parts par classe » des Décisions de #10, recopiée : %, du mal né à l'excellent.
const SHARES_BY_CLASS: Record<ClassKey, readonly number[]> = {
	wizard: [7, 27, 37, 22, 8],
	golem: [7, 15, 47, 18, 13],
	warrior: [9, 18, 47, 15, 11],
	dwarf: [10, 15, 41, 16, 18],
	vampire: [8, 13, 58, 12, 8],
	druid: [10, 14, 42, 27, 6],
	peasant: [5, 24, 50, 12, 9],
	fairy: [0, 22, 48, 18, 11],
};
const TOLERANCE_POINTS = 3;

test("le verdict rend un niveau de la liste ordonnée, et chacun est atteint sur les identifiants 1 à 100 000", () => {
	expect(VERDICT_LEVELS).toEqual(LEVELS);
	expect(new Set(population().map(verdictOf))).toEqual(new Set(LEVELS));
});

test("sur les identifiants 1 à 100 000, la part de chaque niveau dans chaque classe est à ± 3 points de la table", () => {
	const byClass = Map.groupBy(population(), (character) => character.class);
	const deviations = [...byClass].flatMap(([classKey, characters]) => {
		const levels = characters.map(verdictOf);
		return LEVELS.flatMap((level, index) => {
			const count = levels.filter((reached) => reached === level).length;
			const share = (100 * count) / levels.length;
			const expected = SHARES_BY_CLASS[classKey][index] ?? Number.NaN;
			return Math.abs(share - expected) <= TOLERANCE_POINTS
				? []
				: [{ classKey, level, share, expected }];
		});
	});

	expect([...byClass.keys()].sort()).toEqual(
		Object.keys(SHARES_BY_CLASS).sort(),
	);
	expect(deviations).toEqual([]);
});

test.each<[ClassKey, StatKey[]]>([
	["vampire", ["magic", "speed"]],
	["wizard", ["magic"]],
])("le score d'un %s compte ses stats fortes : %j", (classKey, expected) => {
	for (const id of idsOf(classKey, 10)) {
		expect(scoringStatsOf(characterOf(id))).toEqual(expected);
	}
});

// Un paysan a ses quatre stats fortes : son score ne compte que la meilleure.
test.each<[string, Stats, StatKey[]]>([
	[
		"sa meilleure stat",
		{ life: 7, strength: 5, magic: 13, speed: 5 },
		["magic"],
	],
	[
		"à égalité, la première de STAT_KEYS",
		{ life: 8, strength: 7, magic: 8, speed: 7 },
		["life"],
	],
])("le score d'un paysan compte %s", (_, stats, expected) => {
	expect(scoringStatsOf({ class: "peasant", stats })).toEqual(expected);
});
