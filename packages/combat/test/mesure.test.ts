import { describe, expect, test } from "vitest";
import {
	measureSpell,
	STARTING_POOL,
	type Spell,
	victoryShare,
} from "../src/index.ts";
import { armyOf, SEEDS, SIMULATION_TIMEOUT } from "./armees.ts";
import { spellNumbered } from "./combattants.ts";

/** L'écart de victoire qu'un sort retiré de la réserve de départ reste sous (annexe B). */
const ANNEX_B_GAP = 4;

describe("la mesure d'un sort candidat", () => {
	test("sans lui, la réserve privée du sort de même numéro ; avec lui, cette réserve et lui ; l'écart en points", () => {
		// Une Boule de feu, retouchée, remplace la sienne ; Coup d'épée reste dans les deux réserves.
		const sword = spellNumbered(1);
		const candidate = { ...spellNumbered(6), name: "Boule de feu retouchée" };
		const seeds = SEEDS.slice(0, 20);
		const pools = new Set<string>();
		const shareOn = (spells: readonly Spell[]) =>
			victoryShare(seeds.map((seed) => ({ seed, army: armyOf(seed, spells) })));
		const withSpell = shareOn([sword, candidate]);
		const withoutSpell = shareOn([sword]);

		const measure = measureSpell({
			pool: [sword, spellNumbered(6)],
			candidate,
			seeds,
			armyOf: (seed, pool) => {
				pools.add(pool.map(({ name }) => name).join(" + "));
				return armyOf(seed, pool);
			},
		});

		// La garde de l'échantillon : deux parts non nulles et distinctes, sans quoi un écart qui
		// oublierait l'une d'elles, ou les inverserait, passerait.
		expect(withSpell).toBeGreaterThan(0);
		expect(withoutSpell).toBeGreaterThan(0);
		expect(withSpell).not.toBe(withoutSpell);
		expect(pools).toEqual(
			new Set(["Coup d'épée + Boule de feu retouchée", "Coup d'épée"]),
		);
		expect(measure).toEqual({
			withSpell,
			withoutSpell,
			gap: (withSpell - withoutSpell) * 100,
			seeds,
		});
	});

	test("graine après graine, l'armée se tire avec puis sans le candidat : une seule graine à la fois", () => {
		const calls: string[] = [];

		measureSpell({
			pool: [spellNumbered(1)],
			candidate: spellNumbered(6),
			seeds: ["1", "2"],
			armyOf: (seed, pool) => {
				calls.push(`${seed} : ${pool.map(({ name }) => name).join(" + ")}`);
				return armyOf(seed, pool);
			},
		});

		expect(calls).toEqual([
			"1 : Coup d'épée + Boule de feu",
			"1 : Coup d'épée",
			"2 : Coup d'épée + Boule de feu",
			"2 : Coup d'épée",
		]);
	});

	test("un échantillon vide est refusé", () => {
		expect(() =>
			measureSpell({
				pool: STARTING_POOL,
				candidate: spellNumbered(6),
				seeds: [],
				armyOf,
			}),
		).toThrow(new RangeError("l'échantillon doit compter au moins une graine"));
	});
});

describe("la réserve de départ (annexe B)", () => {
	test.each(
		STARTING_POOL.map((spell): [number, string, Spell] => [
			spell.number,
			spell.name,
			spell,
		]),
	)(
		"n° %i, %s : retiré, il déplace la victoire de moins de 4 points, sur les graines 1 à 2 000",
		(_, __, spell) => {
			const { gap } = measureSpell({
				pool: STARTING_POOL.filter((other) => other !== spell),
				candidate: spell,
				seeds: SEEDS,
				armyOf,
			});

			expect(Math.abs(gap)).toBeLessThan(ANNEX_B_GAP);
		},
		SIMULATION_TIMEOUT,
	);
});
