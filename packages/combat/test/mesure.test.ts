import { describe, expect, test } from "vitest";
import { measureSpell, STARTING_POOL, type Spell } from "../src/index.ts";
import { armyOf, SEEDS, SIMULATION_TIMEOUT } from "./armees.ts";
import { spellNumbered } from "./combattants.ts";

/** L'écart de victoire qu'un sort retiré de la réserve de départ reste sous (annexe B). */
const ANNEX_B_GAP = 4;

describe("la mesure d'un sort candidat", () => {
	test("sans lui, la réserve privée du sort de même numéro ; avec lui, cette réserve et lui ; l'écart en points", () => {
		// Une réserve de soins seuls ne gagne jamais ; une Boule de feu, retouchée, remplace la sienne.
		const heal = spellNumbered(11);
		const candidate = { ...spellNumbered(6), name: "Boule de feu retouchée" };
		const seeds = ["1", "2", "3", "4"];
		const pools = new Set<string>();

		const measure = measureSpell({
			pool: [heal, spellNumbered(6)],
			candidate,
			seeds,
			armyOf: (seed, pool) => {
				pools.add(pool.map(({ name }) => name).join(" + "));
				return armyOf(seed, pool);
			},
		});

		expect(pools).toEqual(new Set(["Soin + Boule de feu retouchée", "Soin"]));
		expect(measure.withoutSpell).toBe(0);
		expect(measure.withSpell).toBeGreaterThan(0);
		expect(measure.gap).toBe(measure.withSpell * 100);
		expect(measure.seeds).toEqual(seeds);
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
