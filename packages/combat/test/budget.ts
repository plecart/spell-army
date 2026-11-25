import { expect } from "vitest";
import type { Stats } from "../src/index.ts";

/** La recrue moyenne de départ (game design § 6, « Recrue moyenne »). */
export const AVERAGE_RECRUIT: Stats = {
	life: 7.6,
	strength: 7.6,
	magic: 7.5,
	speed: 7.3,
};

/** Une armée de stats réelles 100 partout, celle de l'exemple de budget de l'issue #21. */
export const ARMY_100: Stats = {
	life: 100,
	strength: 100,
	magic: 100,
	speed: 100,
};

/** 10 recrues moyennes : le budget du jour 2 (game design § 6, « Jour 2 »). */
export const TEN_RECRUITS: Stats = {
	life: 76,
	strength: 76,
	magic: 75,
	speed: 73,
};

/**
 * Le budget de l'exemple de l'issue #21 : armée de 100, p = 0,7, 20 recrues de référence ;
 * 100 + 0,7 × 20 × 7,6 = 206,4, 100 + 0,7 × 20 × 7,5 = 205, 100 + 0,7 × 20 × 7,3 = 202,2.
 */
export const EXAMPLE_BUDGET: Stats = {
	life: 206.4,
	strength: 206.4,
	magic: 205,
	speed: 202.2,
};

/**
 * Chaque stat de `actual` à moins de 10⁻⁹ / 2 de celle de `expected` (`expect.closeTo`, 9 décimales) :
 * un budget est un flottant.
 */
export function expectStatsCloseTo(actual: Stats, expected: Stats): void {
	expect(actual).toEqual({
		life: expect.closeTo(expected.life, 9),
		strength: expect.closeTo(expected.strength, 9),
		magic: expect.closeTo(expected.magic, 9),
		speed: expect.closeTo(expected.speed, 9),
	});
}
