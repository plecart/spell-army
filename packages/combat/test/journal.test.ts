import { describe, expect, test } from "vitest";
import {
	type CombatLog,
	type Fighter,
	type FightInput,
	fight,
	RULES_VERSION,
	serializeLog,
} from "../src/index.ts";
import { fighterOf, monsterOf } from "./combattants.ts";

// Un magicien, un guerrier et deux golems (personnages 1, 2, 7 et 16), chacun avec son sort.
function smallArmy(): Fighter[] {
	return [
		fighterOf("1", 6),
		fighterOf("2", 1),
		fighterOf("7", 2),
		fighterOf("16", 14),
	];
}

function input(seed: string): FightInput {
	return {
		army: smallArmy(),
		monster: monsterOf({ life: 60, strength: 40, magic: 20, speed: 20 }, [
			{ name: "Griffe", recipe: { strength: 100 }, coefficient: 0.7 },
			{
				name: "Souffle",
				recipe: { strength: 30, magic: 70 },
				coefficient: 0.9,
			},
		]),
		seed,
		poolVersion: "réserve-1",
	};
}

/** Le même objet, chaque clé insérée dans l'ordre inverse, à toute profondeur. */
function reversedKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reversedKeys);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value)
			.reverse()
			.map(([key, entry]) => [key, reversedKeys(entry)]),
	);
}

describe("le journal du combat", () => {
	test("l'en-tête porte les versions, la graine, le monstre, l'armée et les forcés", () => {
		const forced = [
			{ id: "7", position: "first" as const, reason: "commentaire du jour" },
		];
		const { header } = fight({ ...input("42"), forced });

		expect(header).toEqual({
			rulesVersion: RULES_VERSION,
			poolVersion: "réserve-1",
			seed: "42",
			monster: input("42").monster,
			army: {
				size: 4,
				// Vie 8 + 9 + 12 + 11, Force 6 + 10 + 13 + 13, Magie 8 + 3 + 3 + 3, Vitesse 8 + 8 + 2 + 3.
				stats: { life: 40, strength: 42, magic: 17, speed: 21 },
				classShares: { wizard: 0.25, warrior: 0.25, golem: 0.5 },
			},
			forced,
		});
	});

	test("chaque action porte son numéro, son camp, son acteur, sa recette, sa valeur et la Vie des deux camps", () => {
		// La fée 38 (Vie 3, Magie 15) lance Boule de feu ; R = 9 / 9, l'armée d'abord.
		const log = fight({
			army: [fighterOf("38", 6)],
			monster: monsterOf({ life: 100, strength: 10, magic: 0, speed: 9 }, [
				{ name: "Griffe", recipe: { strength: 100 }, coefficient: 1 },
			]),
			seed: "1",
			poolVersion: "réserve-1",
		});

		expect(log.actions.slice(0, 2)).toEqual([
			{
				number: 1,
				side: "army",
				fighter: { id: "38", characterClass: "fairy" },
				spell: { number: 6, name: "Boule de feu" },
				recipe: { magic: 100 },
				armyStat: 15,
				efficiency: 1,
				damage: expect.closeTo(3, 10),
				heal: 0,
				armyLife: [3, 3],
				monsterLife: [100, expect.closeTo(97, 10)],
				forced: false,
			},
			{
				number: 2,
				side: "monster",
				attack: "Griffe",
				recipe: { strength: 100 },
				monsterStat: 10,
				damage: expect.closeTo(2, 10),
				armyLife: [3, expect.closeTo(1, 10)],
				monsterLife: [expect.closeTo(97, 10), expect.closeTo(97, 10)],
			},
		]);
	});

	test("le bilan porte l'issue, le nombre d'actions, la Vie restante des deux camps et les tirés", () => {
		// Sur la graine « 42 », le monstre l'emporte en 23 actions.
		const log = fight(input("42"));
		const lastAction = log.actions.at(-1);
		const drawnInOrder = log.actions.flatMap((action) =>
			action.side === "army" ? [action.fighter.id] : [],
		);

		expect(log.summary).toEqual({
			outcome: "defeat",
			actionCount: 23,
			armyLife: lastAction?.armyLife[1],
			monsterLife: lastAction?.monsterLife[1],
			drawn: [...new Set(drawnInOrder)],
			unreachedForced: [],
		});
	});

	test("même graine et mêmes entrées : le même journal, octet pour octet", () => {
		expect(serializeLog(fight(input("42")))).toBe(
			serializeLog(fight(input("42"))),
		);
	});

	test("une autre graine : d'autres tirages", () => {
		// Douze personnages : deux graines ne tirent pas les mêmes acteurs dans le même ordre.
		const army = Array.from({ length: 12 }, (_, index) =>
			fighterOf(String(index + 1), 6),
		);
		const actors = (seed: string) =>
			fight({ ...input(seed), army }).actions.map((action) =>
				action.side === "army" ? action.fighter.id : action.attack,
			);

		expect(actors("1")).not.toEqual(actors("2"));
	});

	test("l'ordre des clés est fixé par le code, pas par l'ordre d'insertion", () => {
		const log = fight(input("42"));

		expect(serializeLog(reversedKeys(log) as CombatLog)).toBe(
			serializeLog(log),
		);
	});
});
