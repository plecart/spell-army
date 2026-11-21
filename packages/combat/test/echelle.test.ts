import { describe, expect, test } from "vitest";
import { scaleFactor } from "../src/index.ts";
import { armyOf, SEEDS, SIMULATION_TIMEOUT } from "./armees.ts";
import { fighterOf, LAVA_GOLEM } from "./combattants.ts";

describe("le facteur d'échelle d'un profil", () => {
	test(
		"le golem de lave (Vie ×1,5, Vitesse ×0,5) : ×1,165 à 0,02 près, sur les graines 1 à 2 000",
		() => {
			const factor = scaleFactor(LAVA_GOLEM, { seeds: SEEDS, armyOf });

			expect(Math.abs(factor - 1.165)).toBeLessThanOrEqual(0.02);
		},
		SIMULATION_TIMEOUT,
	);

	test("chaque graine tire son armée une fois, pour tous les essais", () => {
		const calls: string[] = [];
		scaleFactor(LAVA_GOLEM, {
			seeds: ["1", "2"],
			armyOf: (seed) => {
				calls.push(seed);
				return armyOf(seed);
			},
		});

		expect(calls).toEqual(["1", "2"]);
	});

	test.each([
		[
			"un échantillon vide",
			LAVA_GOLEM,
			[],
			"l'échantillon doit compter au moins une graine",
		],
		[
			// Un monstre sans Vie tombe avant la première action, à tout facteur.
			"un profil qu'aucun facteur de ÷8 à ×8 n'équilibre",
			{ ...LAVA_GOLEM, life: 0 },
			["1"],
			"aucun facteur d'échelle de 0.125 à 8 ne laisse 50 % de victoires à l'armée",
		],
	])("%s est refusé", (_, profile, seeds, message) => {
		expect(() =>
			scaleFactor(profile, { seeds, armyOf: () => [fighterOf("1", 6)] }),
		).toThrow(new RangeError(message));
	});
});
