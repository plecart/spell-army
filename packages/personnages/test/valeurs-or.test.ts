import { expect, test } from "vitest";
import {
	characterOf,
	drawSpell,
	type SpellEntry,
	verdictOf,
} from "../src/index.ts";

// Réserve de test fixe : un `id` en majuscule épingle le tri en unités de code (« T » avant « b »).
const GOLDEN_POOL: SpellEntry[] = [
	{ id: "eclair", weight: 3 },
	{ id: "Tempete", weight: 1 },
	{ id: "boule-de-feu", weight: 2 },
	{ id: "meteore", weight: 0 },
	{ id: "soin", weight: 1.5 },
	{ id: "gel", weight: 1 },
];

// Relevées une fois sur l'implémentation, le 2026-11-17 ; stats dans l'ordre vie, force, magie,
// vitesse. Le tirage des stats de « 30 » rejette un octet : sa ligne épingle le rejet.
const GOLDEN_VALUES: [string, string, number[], string, string][] = [
	["1", "wizard", [8, 6, 8, 8], "ill_born", "boule-de-feu"],
	["2", "warrior", [9, 10, 3, 8], "weak", "eclair"],
	["3", "druid", [7, 2, 10, 11], "gifted", "boule-de-feu"],
	["4", "vampire", [6, 8, 7, 9], "average", "gel"],
	["5", "peasant", [7, 8, 9, 6], "weak", "eclair"],
	["7", "golem", [12, 13, 3, 2], "average", "eclair"],
	["8", "peasant", [6, 9, 5, 10], "average", "Tempete"],
	["10", "warrior", [10, 10, 3, 7], "weak", "soin"],
	["12", "fairy", [3, 3, 11, 13], "average", "boule-de-feu"],
	["13", "dwarf", [13, 10, 3, 4], "excellent", "eclair"],
	["30", "fairy", [5, 1, 11, 13], "average", "eclair"],
	["18446744073709551615", "wizard", [7, 8, 10, 5], "weak", "gel"],
];

test.each(GOLDEN_VALUES)(
	"l'identifiant %s garde sa classe, ses stats, son niveau et son sort",
	(id, classKey, [life, strength, magic, speed], level, spell) => {
		const character = characterOf(id);

		expect({
			class: character.class,
			stats: character.stats,
			level: verdictOf(character),
			spell: drawSpell(id, GOLDEN_POOL),
		}).toEqual({
			class: classKey,
			stats: { life, strength, magic, speed },
			level,
			spell,
		});
	},
);
