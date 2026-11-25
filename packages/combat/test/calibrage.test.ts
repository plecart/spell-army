import { describe, expect, test } from "vitest";
import { budgetOf, referenceRecruitsOf } from "../src/index.ts";
import {
	ARMY_100,
	AVERAGE_RECRUIT,
	EXAMPLE_BUDGET,
	expectStatsCloseTo,
	TEN_RECRUITS,
} from "./budget.ts";

describe("le budget du monstre", () => {
	test("la formule : armée + p × recrues de référence × recrue moyenne, stat par stat", () => {
		const budget = budgetOf({
			kind: "formula",
			army: ARMY_100,
			referenceRecruits: 20,
			averageRecruit: AVERAGE_RECRUIT,
			recruitShare: 0.7,
		});

		expectStatsCloseTo(budget, EXAMPLE_BUDGET);
	});

	test("l'armée seule : le monstre a la force de l'armée", () => {
		const army = { life: 12, strength: 9, magic: 4, speed: 3 };

		expect(budgetOf({ kind: "army", army })).toEqual(army);
	});

	test("10 recrues moyennes : 10 fois la recrue moyenne", () => {
		const budget = budgetOf({
			kind: "recruits",
			recruits: 10,
			averageRecruit: AVERAGE_RECRUIT,
		});

		expectStatsCloseTo(budget, TEN_RECRUITS);
	});

	test("le plus grand de 10 recrues moyennes et de la formule, stat par stat", () => {
		// La formule : Vie 100 + 0,7 × 1 × 7,6 = 105,32 et Force 80 + 5,32 = 85,32 dépassent 10
		// recrues (76) ; Magie 0 + 5,25 et Vitesse 0 + 5,11 restent sous 75 et 73.
		const budget = budgetOf({
			kind: "larger",
			recruits: 10,
			army: { life: 100, strength: 80, magic: 0, speed: 0 },
			referenceRecruits: 1,
			averageRecruit: AVERAGE_RECRUIT,
			recruitShare: 0.7,
		});

		expectStatsCloseTo(budget, {
			life: 105.32,
			strength: 85.32,
			magic: 75,
			speed: 73,
		});
	});
});

describe("les recrues de référence", () => {
	test("la médiane des arrivées par date, quel que soit leur ordre", () => {
		expect(referenceRecruitsOf([30, 10, 20])).toBe(20);
	});

	test("une fenêtre paire : la moyenne des deux arrivées du milieu", () => {
		expect(referenceRecruitsOf([10, 40, 0, 30])).toBe(20);
	});

	test("une fenêtre vide : refusée, elle n'a pas de médiane", () => {
		expect(() => referenceRecruitsOf([])).toThrow(
			new RangeError("la fenêtre des recrues de référence est vide"),
		);
	});
});
