import { expect, test } from "vitest";
import { characterOf, drawSpell, simulationArmies } from "../src/index.ts";

// Une réserve numérotée : le sort n° 3, de poids 0, ne se tire jamais.
const POOL = [
	{ number: 1, weight: 1, name: "Éclair" },
	{ number: 2, weight: 3, name: "Boule de feu" },
	{ number: 3, weight: 0, name: "Météore" },
];

test("l'armée de la graine 2 : 1 000 personnages, des identifiants 2000 à 2999, classe et stats par characterOf", () => {
	const army = simulationArmies<(typeof POOL)[number]>()("2", POOL);

	expect(
		army.map(({ id, characterClass, stats }) => ({
			id,
			characterClass,
			stats,
		})),
	).toEqual(
		Array.from({ length: 1000 }, (_, index) => {
			const id = String(2000 + index);
			const { class: characterClass, stats } = characterOf(id);
			return { id, characterClass, stats };
		}),
	);
});

test("chaque personnage lance le sort de la réserve que drawSpell lui tire, par son numéro en texte", () => {
	const armyOf = simulationArmies<(typeof POOL)[number]>();
	const entries = POOL.map(({ number, weight }) => ({
		id: String(number),
		weight,
	}));
	// Deux réserves sur une même fabrique : les sorts se tirent dans chacune.
	const reversed = POOL.toReversed();

	for (const pool of [POOL, reversed]) {
		const army = armyOf("2", pool);
		expect(army.map(({ id, spell }) => [id, spell])).toEqual(
			army.map(({ id }) => [
				id,
				pool.find(({ number }) => String(number) === drawSpell(id, entries)),
			]),
		);
	}
});
