import { expect, test } from "vitest";
import {
	type ClassKey,
	characterOf,
	STAT_KEYS,
	type Stats,
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

// Le score d'une classe : la somme de ses stats fortes, ou la meilleure quand les quatre le sont.
test.each<[ClassKey, string, (stats: Stats) => number]>([
	["vampire", "Magie + Vitesse", ({ magic, speed }) => magic + speed],
	["wizard", "Magie", ({ magic }) => magic],
	[
		"peasant",
		"sa meilleure stat",
		(stats) => Math.max(...STAT_KEYS.map((key) => stats[key])),
	],
])(
	"le verdict d'un %s ne dépend que de %s, et monte avec, du mal né à l'excellent",
	(classKey, _, scoreOf) => {
		const characters = idsOf(classKey, 2_000).map((id) => characterOf(id));
		// Les niveaux atteints à chaque score, du plus bas au plus haut.
		const levelsByScore = [
			...Map.groupBy(characters, ({ stats }) => scoreOf(stats)),
		]
			.sort(([a], [b]) => a - b)
			.map(([, group]) => [...new Set(group.map(verdictOf))]);

		expect(levelsByScore.filter((levels) => levels.length > 1)).toEqual([]);
		const ladder = levelsByScore.flat();
		expect(
			ladder.filter((level, index) => level !== ladder[index - 1]),
		).toEqual(LEVELS);
	},
);
