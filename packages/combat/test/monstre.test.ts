import { describe, expect, test } from "vitest";
import {
	NEUTRAL_PROFILE,
	REFERENCE_ATTACKS,
	sizeMonster,
} from "../src/index.ts";

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
			{ life: 1.5, strength: 1, magic: 1, speed: 0.5 },
			1.165,
		);

		expect(stats.life).toBeCloseTo(1747.5, PRECISION);
		expect(stats.strength).toBeCloseTo(932, PRECISION);
		expect(stats.magic).toBeCloseTo(699, PRECISION);
		expect(stats.speed).toBeCloseTo(233, PRECISION);
	});
});
