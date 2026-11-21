import { expect, test } from "vitest";
import { victoryShare } from "../src/index.ts";
import { armyOf, SEEDS, SIMULATION_TIMEOUT } from "./armees.ts";

test(
	"un monstre égal à une armée de 1 000 personnages gagne de 45 à 55 % des combats, sur les graines 1 à 2 000",
	() => {
		const trials = SEEDS.map((seed) => ({ seed, army: armyOf(seed) }));
		const monsterShare = 1 - victoryShare(trials);

		expect(monsterShare).toBeGreaterThanOrEqual(0.45);
		expect(monsterShare).toBeLessThanOrEqual(0.55);
	},
	SIMULATION_TIMEOUT,
);
