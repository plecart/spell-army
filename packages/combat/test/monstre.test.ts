import { describe, expect, test } from "vitest";
import {
	type MonsterAttack,
	type MonsterDesign,
	NEUTRAL_PROFILE,
	REFERENCE_ATTACKS,
	REFERENCE_DESIGN,
	sizeMonster,
	validateMonster,
} from "../src/index.ts";
import { LAVA_GOLEM } from "./combattants.ts";

const PRECISION = 10;

describe("le monstre de référence", () => {
	test("le profil neutre garde chaque stat de son budget", () => {
		expect(NEUTRAL_PROFILE).toEqual({
			life: 1,
			strength: 1,
			magic: 1,
			speed: 1,
		});
	});

	test("2 à 4 attaques de Force et de Magie, au coefficient moyen ×0,78, à parts égales", () => {
		const count = REFERENCE_ATTACKS.length;
		const mean = (values: number[]) =>
			values.reduce((sum, value) => sum + value, 0) / count;

		expect(count).toBeGreaterThanOrEqual(2);
		expect(count).toBeLessThanOrEqual(4);
		expect(
			mean(REFERENCE_ATTACKS.map(({ coefficient }) => coefficient)),
		).toBeCloseTo(0.78, PRECISION);
		// La part moyenne de chaque stat dans les recettes, en % : 50 de Force, 50 de Magie.
		expect(
			mean(REFERENCE_ATTACKS.map(({ recipe }) => recipe.strength ?? 0)),
		).toBe(50);
		expect(mean(REFERENCE_ATTACKS.map(({ recipe }) => recipe.magic ?? 0))).toBe(
			50,
		);
	});
});

describe("la taille d'un monstre", () => {
	test("chaque stat vaut budget × multiplicateur du profil × facteur d'échelle", () => {
		const stats = sizeMonster(
			{ life: 1000, strength: 800, magic: 600, speed: 400 },
			LAVA_GOLEM,
			1.165,
		);

		expect(stats.life).toBeCloseTo(1747.5, PRECISION);
		expect(stats.strength).toBeCloseTo(932, PRECISION);
		expect(stats.magic).toBeCloseTo(699, PRECISION);
		expect(stats.speed).toBeCloseTo(233, PRECISION);
	});
});

/** Une attaque nommée `name`, de Force par défaut, au coefficient moyen ×0,78 par défaut. */
function attack(
	name: string,
	coefficient = 0.78,
	recipe: MonsterAttack["recipe"] = { strength: 100 },
): MonsterAttack {
	return { name, recipe, coefficient };
}

// Un monstre valide, écrit ici plutôt que pris au monstre de référence : chaque cas n'en remplace que
// ce qu'il éprouve.
const GOLEM: MonsterDesign = {
	profile: LAVA_GOLEM,
	attacks: [attack("Poing de lave"), attack("Coulée", 0.78, { magic: 100 })],
};

describe("validité d'un monstre", () => {
	test.each<[string, Partial<MonsterDesign>, string[]]>([
		[
			"une seule attaque",
			{ attacks: [attack("Poing de lave")] },
			["un monstre doit avoir de 2 à 4 attaques, reçu : 1"],
		],
		[
			"cinq attaques",
			{
				attacks: [
					attack("Poing de lave"),
					attack("Coulée"),
					attack("Souffle"),
					attack("Éruption"),
					attack("Séisme"),
				],
			},
			["un monstre doit avoir de 2 à 4 attaques, reçu : 5"],
		],
		[
			"deux attaques du même nom",
			{ attacks: [attack("Poing de lave"), attack("Poing de lave")] },
			["le nom d'attaque « Poing de lave » doit être unique dans le monstre"],
		],
		[
			"une recette à 99 %",
			{
				attacks: [
					attack("Poing de lave", 0.78, { strength: 49, magic: 50 }),
					attack("Coulée"),
				],
			},
			[
				"l'attaque « Poing de lave » : les parts de la recette doivent faire 100 %, reçu : 99 %",
			],
		],
		[
			"une recette à 101 %",
			{
				attacks: [
					attack("Poing de lave", 0.78, { strength: 51, magic: 50 }),
					attack("Coulée"),
				],
			},
			[
				"l'attaque « Poing de lave » : les parts de la recette doivent faire 100 %, reçu : 101 %",
			],
		],
		[
			"une recette à parts non entières",
			{
				attacks: [
					attack("Poing de lave", 0.78, { strength: 50.5, magic: 49.5 }),
					attack("Coulée"),
				],
			},
			[
				"l'attaque « Poing de lave » : la part « strength » de la recette doit être un entier de 0 à 100, reçu : 50.5",
				"l'attaque « Poing de lave » : la part « magic » de la recette doit être un entier de 0 à 100, reçu : 49.5",
			],
		],
		[
			// Une part négative ne laisse 100 % qu'avec une autre au-delà de 100.
			"une recette à part négative",
			{
				attacks: [
					attack("Poing de lave", 0.78, { strength: 110, magic: -10 }),
					attack("Coulée"),
				],
			},
			[
				"l'attaque « Poing de lave » : la part « strength » de la recette doit être un entier de 0 à 100, reçu : 110",
				"l'attaque « Poing de lave » : la part « magic » de la recette doit être un entier de 0 à 100, reçu : -10",
			],
		],
		[
			// 0 et 1,56 : la moyenne reste ×0,78, seul le coefficient est refusé.
			"un coefficient 0",
			{ attacks: [attack("Poing de lave", 0), attack("Coulée", 1.56)] },
			[
				"l'attaque « Poing de lave » : le coefficient doit être un nombre fini > 0, reçu : 0",
			],
		],
		[
			"un coefficient négatif",
			{ attacks: [attack("Poing de lave", -0.78), attack("Coulée", 2.34)] },
			[
				"l'attaque « Poing de lave » : le coefficient doit être un nombre fini > 0, reçu : -0.78",
			],
		],
		[
			"un coefficient NaN",
			{ attacks: [attack("Poing de lave", Number.NaN), attack("Coulée")] },
			[
				"l'attaque « Poing de lave » : le coefficient doit être un nombre fini > 0, reçu : NaN",
				"le coefficient moyen des attaques doit valoir 0.78 au centième, reçu : NaN",
			],
		],
		[
			"un coefficient infini",
			{
				attacks: [
					attack("Poing de lave", Number.POSITIVE_INFINITY),
					attack("Coulée"),
				],
			},
			[
				"l'attaque « Poing de lave » : le coefficient doit être un nombre fini > 0, reçu : Infinity",
				"le coefficient moyen des attaques doit valoir 0.78 au centième, reçu : Infinity",
			],
		],
		[
			"des coefficients 0,50 et 1,08, de moyenne ×0,79",
			{ attacks: [attack("Poing de lave", 0.5), attack("Coulée", 1.08)] },
			[
				"le coefficient moyen des attaques doit valoir 0.78 au centième, reçu : 0.79",
			],
		],
		[
			"un multiplicateur de profil négatif",
			{ profile: { ...LAVA_GOLEM, speed: -0.5 } },
			[
				"le multiplicateur « speed » du profil doit être un nombre fini ≥ 0, reçu : -0.5",
			],
		],
		[
			"un multiplicateur de profil NaN",
			{ profile: { ...LAVA_GOLEM, life: Number.NaN } },
			[
				"le multiplicateur « life » du profil doit être un nombre fini ≥ 0, reçu : NaN",
			],
		],
		[
			"un multiplicateur de profil infini",
			{ profile: { ...LAVA_GOLEM, magic: Number.POSITIVE_INFINITY } },
			[
				"le multiplicateur « magic » du profil doit être un nombre fini ≥ 0, reçu : Infinity",
			],
		],
		[
			"plusieurs règles enfreintes",
			{
				profile: { ...LAVA_GOLEM, life: -1 },
				attacks: [attack("Poing de lave", 0)],
			},
			[
				"un monstre doit avoir de 2 à 4 attaques, reçu : 1",
				"l'attaque « Poing de lave » : le coefficient doit être un nombre fini > 0, reçu : 0",
				"le coefficient moyen des attaques doit valoir 0.78 au centième, reçu : 0",
				"le multiplicateur « life » du profil doit être un nombre fini ≥ 0, reçu : -1",
			],
		],
	])("%s : refusé", (_, change, errors) => {
		expect(validateMonster({ ...GOLEM, ...change })).toEqual(errors);
	});

	test.each<[string, Partial<MonsterDesign>]>([
		["deux attaques", {}],
		[
			"quatre attaques",
			{
				attacks: [
					attack("Poing de lave"),
					attack("Coulée"),
					attack("Souffle"),
					attack("Éruption"),
				],
			},
		],
		[
			"une recette à part nulle",
			{
				attacks: [
					attack("Poing de lave", 0.78, { strength: 100, magic: 0 }),
					attack("Coulée"),
				],
			},
		],
		[
			"des coefficients 0,50 et 1,06, de moyenne ×0,78",
			{ attacks: [attack("Poing de lave", 0.5), attack("Coulée", 1.06)] },
		],
		[
			// Aucun facteur ne l'équilibre : `scaleFactor` la refuse, pas la validation.
			"une Vie ×0",
			{ profile: { ...LAVA_GOLEM, life: 0 } },
		],
		["le monstre de référence", REFERENCE_DESIGN],
	])("%s : accepté", (_, change) => {
		expect(validateMonster({ ...GOLEM, ...change })).toEqual([]);
	});
});
