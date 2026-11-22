import { describe, expect, test } from "vitest";
import {
	type MonsterDesign,
	NEUTRAL_PROFILE,
	REFERENCE_ATTACKS,
	scaleFactor,
} from "../src/index.ts";
import { armyOf, SEEDS, SIMULATION_TIMEOUT } from "./armees.ts";
import { fighterOf, LAVA_GOLEM } from "./combattants.ts";

/** La tolérance sur un facteur d'échelle, ± 0,02 : au-delà, deux facteurs se distinguent. */
const TOLERANCE = 0.02;
/** Le golem de lave aux attaques de référence : une de Force, une de Magie. */
const GOLEM: MonsterDesign = {
	profile: LAVA_GOLEM,
	attacks: REFERENCE_ATTACKS,
};
/**
 * Un profil à Magie ×0,5, le reste au budget : celui de l'issue #20 (Décisions, 1), où le choix des
 * attaques change la difficulté. Le golem de lave, Force et Magie ×1, n'y suffit pas : l'armée y a
 * presque autant de Force que de Magie, et deux attaques de Force n'y déplacent le facteur que de
 * 0,007 (relevé du 2026-11-22, graines 1 à 2 000).
 */
const HALF_MAGIC = { ...NEUTRAL_PROFILE, magic: 0.5 };
/** Deux attaques de Force, au même coefficient moyen ×0,78 que les attaques de référence. */
const STRENGTH_ATTACKS: MonsterDesign["attacks"] = [
	{ name: "Poing", recipe: { strength: 100 }, coefficient: 0.78 },
	{ name: "Écrasement", recipe: { strength: 100 }, coefficient: 0.78 },
];

describe("le facteur d'échelle d'un monstre", () => {
	test(
		"le golem de lave (Vie ×1,5, Vitesse ×0,5) aux attaques de référence : ×1,165 à 0,02 près, sur les graines 1 à 2 000",
		() => {
			const factor = scaleFactor(GOLEM, { seeds: SEEDS, armyOf });

			expect(Math.abs(factor - 1.165)).toBeLessThanOrEqual(TOLERANCE);
		},
		SIMULATION_TIMEOUT,
	);

	test(
		"un profil à Magie ×0,5 : deux attaques de Force le rendent plus dur qu'aux attaques de référence, son facteur baisse de plus de 0,02, sur les graines 1 à 2 000",
		() => {
			const sample = { seeds: SEEDS, armyOf };
			const factorWith = (attacks: MonsterDesign["attacks"]) =>
				scaleFactor({ profile: HALF_MAGIC, attacks }, sample);

			const drop = factorWith(REFERENCE_ATTACKS) - factorWith(STRENGTH_ATTACKS);

			expect(drop).toBeGreaterThan(TOLERANCE);
		},
		SIMULATION_TIMEOUT,
	);

	test("chaque graine tire son armée une fois, pour tous les essais", () => {
		const calls: string[] = [];
		scaleFactor(GOLEM, {
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
			GOLEM,
			[],
			"l'échantillon doit compter au moins une graine",
		],
		[
			// Un monstre sans Vie tombe avant la première action, à tout facteur.
			"un profil qu'aucun facteur de ÷8 à ×8 n'équilibre",
			{ ...GOLEM, profile: { ...LAVA_GOLEM, life: 0 } },
			["1"],
			"aucun facteur d'échelle de 0.125 à 8 ne laisse 50 % de victoires à l'armée",
		],
	])("%s est refusé", (_, design, seeds, message) => {
		expect(() =>
			scaleFactor(design, { seeds, armyOf: () => [fighterOf("1", 6)] }),
		).toThrow(new RangeError(message));
	});
});
