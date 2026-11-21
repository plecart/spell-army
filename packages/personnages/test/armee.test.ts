import { expect, test } from "vitest";
import { characterOf, drawSpell, simulationArmies } from "../src/index.ts";

// Une réserve numérotée : le sort n° 3, de poids 0, ne se tire jamais.
const POOL = [
	{ number: 1, weight: 1, name: "Éclair" },
	{ number: 2, weight: 3, name: "Boule de feu" },
	{ number: 3, weight: 0, name: "Météore" },
];

// La même réserve à d'autres poids : une fabrique qui garderait le tirage de la première réserve y
// rendrait d'autres sorts.
const REWEIGHTED = [
	{ number: 1, weight: 0, name: "Éclair" },
	{ number: 2, weight: 1, name: "Boule de feu" },
	{ number: 3, weight: 2, name: "Météore" },
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

test("chaque personnage lance le sort que drawSpell lui tire dans la réserve donnée, par son numéro en texte", () => {
	const armyOf = simulationArmies<(typeof POOL)[number]>();

	for (const pool of [POOL, REWEIGHTED]) {
		const entries = pool.map(({ number, weight }) => ({
			id: String(number),
			weight,
		}));
		const army = armyOf("2", pool);
		expect(army.map(({ id, spell }) => [id, spell])).toEqual(
			army.map(({ id }) => [
				id,
				pool.find(({ number }) => String(number) === drawSpell(id, entries)),
			]),
		);
	}
});

// Ce qu'une fabrique garde se voit à l'identité des stats d'un personnage, un objet qu'elle calcule :
// l'identifiant et la classe sont des textes, et le sort vient de la réserve.
test("une fabrique garde les personnages de la dernière graine seulement, ou de toutes avec Infinity", () => {
	const statsOf = (armyOf: ReturnType<typeof simulationArmies>, seed: string) =>
		armyOf(seed, POOL)[0]?.stats;
	const lastOnly = simulationArmies();
	const all = simulationArmies(Number.POSITIVE_INFINITY);
	const kept = [lastOnly, all].map((armyOf) => statsOf(armyOf, "2"));

	expect(lastOnly("2", REWEIGHTED)[0]?.stats).toBe(kept[0]);
	statsOf(lastOnly, "3");
	statsOf(all, "3");
	expect(statsOf(lastOnly, "2")).not.toBe(kept[0]);
	expect(statsOf(all, "2")).toBe(kept[1]);
});
