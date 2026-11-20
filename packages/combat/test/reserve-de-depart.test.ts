import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
	effectCategory,
	STARTING_POOL,
	spellKey,
	validateSpell,
} from "../src/index.ts";

// L'annexe B du game design, lue à la source : le test confronte la réserve au document, jamais
// la réserve à elle-même. Une ligne du tableau commence par `| <numéro> | <nom> |`.
const ANNEX_B = annexBRows(
	readFileSync(
		new URL("../../../docs/game-design.md", import.meta.url),
		"utf8",
	),
);

function annexBRows(gameDesign: string): [number, string][] {
	const annex = gameDesign
		.split(/^## /m)
		.find((section) => section.startsWith("Annexe B"));
	return [...(annex ?? "").matchAll(/^\| (\d+) \| ([^|]+) \|/gm)].map(
		([, number, name]) => [Number(number), (name as string).trim()],
	);
}

test("l'annexe B et la réserve de départ comptent chacune 24 sorts", () => {
	expect([ANNEX_B.length, STARTING_POOL.length]).toEqual([24, 24]);
});

test("les numéros vont de 1 à 24 dans l'ordre", () => {
	expect(STARTING_POOL.map(({ number }) => number)).toEqual(
		Array.from({ length: 24 }, (_, index) => index + 1),
	);
});

test.each(ANNEX_B)(
	"le sort n° %i s'appelle « %s », comme à l'annexe B, et pèse 1",
	(number, name) => {
		expect(STARTING_POOL[number - 1]).toMatchObject({
			number,
			name,
			weight: 1,
		});
	},
);

test.each(STARTING_POOL)(
	"le sort n° $number, « $name », est valide",
	(spell) => {
		expect(validateSpell(spell)).toEqual([]);
	},
);

test("les 24 sorts ont 24 clés d'unicité distinctes", () => {
	expect(new Set(STARTING_POOL.map(spellKey)).size).toBe(24);
});

test("Coup de marteau (n° 4) et Rage du désespoir (n° 15) ont deux clés distinctes", () => {
	const keys = STARTING_POOL.filter(
		({ number }) => number === 4 || number === 15,
	).map(spellKey);

	expect(new Set(keys).size).toBe(2);
});

test("vol de vie pour les n° 5, 9 et 12, soin pour les n° 11, 13, 14, 17, 22 et 24, dégâts pour les 15 autres", () => {
	const lifesteal = [5, 9, 12];
	const heal = [11, 13, 14, 17, 22, 24];
	const expected = Array.from({ length: 24 }, (_, index) => {
		const number = index + 1;
		if (lifesteal.includes(number)) return [number, "lifesteal"];
		return [number, heal.includes(number) ? "heal" : "damage"];
	});

	expect(
		STARTING_POOL.map((spell) => [spell.number, effectCategory(spell.effect)]),
	).toEqual(expected);
});
