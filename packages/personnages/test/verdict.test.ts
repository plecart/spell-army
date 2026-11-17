import { expect, test } from "vitest";
import {
	type ClassKey,
	characterOf,
	VERDICT_LEVELS,
	verdictOf,
} from "../src/index.ts";
import { identifiers } from "./identifiants.ts";

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

const VERDICTS = identifiers(100_000).map((id) => {
	const character = characterOf(id);
	return { classKey: character.class, level: verdictOf(character) };
});

test("le verdict rend un niveau de la liste ordonnée, et chacun est atteint sur les identifiants 1 à 100 000", () => {
	expect(VERDICT_LEVELS).toEqual(LEVELS);
	expect(new Set(VERDICTS.map(({ level }) => level))).toEqual(new Set(LEVELS));
});

test("sur les identifiants 1 à 100 000, la part de chaque niveau dans chaque classe est à ± 3 points de la table", () => {
	const byClass = Map.groupBy(VERDICTS, ({ classKey }) => classKey);
	const deviations = [...byClass].flatMap(([classKey, verdicts]) =>
		LEVELS.flatMap((level, index) => {
			const count = verdicts.filter(
				(verdict) => verdict.level === level,
			).length;
			const share = (100 * count) / verdicts.length;
			const expected = SHARES_BY_CLASS[classKey][index] ?? Number.NaN;
			return Math.abs(share - expected) <= TOLERANCE_POINTS
				? []
				: [{ classKey, level, share, expected }];
		}),
	);

	expect([...byClass.keys()].sort()).toEqual(
		Object.keys(SHARES_BY_CLASS).sort(),
	);
	expect(deviations).toEqual([]);
});
