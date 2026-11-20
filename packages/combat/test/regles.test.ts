import { describe, expect, test } from "vitest";
import {
	type Effect,
	effectCategory,
	type Form,
	type Linear,
	type Recipe,
	type Shares,
	type Spell,
	spellKey,
	validateSpell,
} from "../src/index.ts";

function linear(constant: number, perGauge = 0): Linear {
	return { constant, perGauge };
}

function shares(parts: Shares): Recipe {
	return { kind: "shares", shares: parts };
}

// Un sort valide, écrit ici plutôt que pris dans la réserve : chaque cas n'en remplace que les champs
// qu'il éprouve.
const SWORD: Spell = {
	number: 1,
	name: "Coup d'épée",
	recipe: shares({ strength: 100 }),
	form: { kind: "safe" },
	effect: { base: "armyStat", damage: linear(1) },
	weight: 1,
	description: "Dégâts selon la Force.",
};
const WOUNDS: Form = { kind: "conditional", gauge: "armyWounds" };

describe("catégorie d'effet", () => {
	test.each([
		["dégâts seuls", "damage", { damage: linear(1) }],
		["soin seul", "heal", { heal: linear(1.2) }],
		["dégâts et soin", "lifesteal", { damage: linear(0.4), heal: linear(0.6) }],
	])("un effet de %s est de catégorie %s", (_, category, parts) => {
		expect(effectCategory({ base: "armyStat", ...parts })).toBe(category);
	});

	test("un effet sans dégâts ni soin n'a pas de catégorie", () => {
		expect(() => effectCategory({ base: "armyStat" })).toThrow(
			new RangeError("l'effet doit faire des dégâts, du soin ou les deux"),
		);
	});
});

describe("clé d'unicité", () => {
	test.each<[string, Partial<Spell>, Partial<Spell>]>([
		["les parts de la recette", {}, { recipe: shares({ magic: 100 }) }],
		["une recette à la meilleure stat", {}, { recipe: { kind: "bestStat" } }],
		["la forme", {}, { form: { kind: "inverted" } }],
		[
			"la jauge",
			{ form: { kind: "conditional", gauge: "monsterLifeLost" } },
			{ form: WOUNDS },
		],
		[
			"la classe nommée",
			{
				form: {
					kind: "conditional",
					gauge: "classShare",
					characterClass: "golem",
				},
			},
			{
				form: {
					kind: "conditional",
					gauge: "classShare",
					characterClass: "fairy",
				},
			},
		],
		[
			"la catégorie d'effet",
			{},
			{ effect: { base: "armyStat", damage: linear(0.5), heal: linear(0.5) } },
		],
		[
			"la base",
			{},
			{ effect: { base: "monsterLastHit", damage: linear(1.4) } },
		],
	])(
		"deux sorts qui ne diffèrent que par %s ont deux clés distinctes",
		(_, a, b) => {
			expect(spellKey({ ...SWORD, ...a })).not.toBe(
				spellKey({ ...SWORD, ...b }),
			);
		},
	);

	test.each<[string, Partial<Spell>, Partial<Spell>]>([
		[
			"l'ordre des parts de la recette",
			{ recipe: shares({ strength: 60, life: 40 }) },
			{ recipe: shares({ life: 40, strength: 60 }) },
		],
		[
			"leurs coefficients",
			{},
			{ effect: { base: "armyStat", damage: linear(1.2) } },
		],
		[
			"la part perdue d'un coûteux",
			{ form: { kind: "costly", armyLossShare: 0.1 } },
			{ form: { kind: "costly", armyLossShare: 0.15 } },
		],
	])("deux sorts qui ne diffèrent que par %s ont la même clé", (_, a, b) => {
		expect(spellKey({ ...SWORD, ...a })).toBe(spellKey({ ...SWORD, ...b }));
	});
});

describe("validité d'un sort", () => {
	test.each<[string, Partial<Spell>, string[]]>([
		[
			"une recette à 90 %",
			{ recipe: shares({ strength: 90 }) },
			["les parts de la recette doivent faire 100 %, reçu : 90 %"],
		],
		[
			"une recette à parts non entières",
			{ recipe: shares({ strength: 50.5, magic: 49.5 }) },
			[
				"la part « strength » de la recette doit être un entier de 1 à 100, reçu : 50.5",
				"la part « magic » de la recette doit être un entier de 1 à 100, reçu : 49.5",
			],
		],
		[
			"une recette à part nulle",
			{ recipe: shares({ strength: 100, magic: 0 }) },
			[
				"la part « magic » de la recette doit être un entier de 1 à 100, reçu : 0",
			],
		],
		[
			"un poids de -1",
			{ weight: -1 },
			["le poids doit être un nombre fini ≥ 0, reçu : -1"],
		],
		[
			"un poids NaN",
			{ weight: Number.NaN },
			["le poids doit être un nombre fini ≥ 0, reçu : NaN"],
		],
		[
			"un poids infini",
			{ weight: Number.POSITIVE_INFINITY },
			["le poids doit être un nombre fini ≥ 0, reçu : Infinity"],
		],
		[
			"une description vide",
			{ description: "" },
			["la description ne doit pas être vide"],
		],
		[
			"une description blanche",
			{ description: " \t\n" },
			["la description ne doit pas être vide"],
		],
		["un nom blanc", { name: "  " }, ["le nom ne doit pas être vide"]],
		[
			"un effet sans dégâts ni soin",
			{ effect: { base: "armyStat" } },
			["l'effet doit faire des dégâts, du soin ou les deux"],
		],
		[
			"des dégâts négatifs",
			{ effect: { base: "armyStat", damage: linear(-0.1) } },
			[
				"le coefficient de dégâts doit être un nombre fini ≥ 0 aux deux bouts de la jauge, reçu : constant -0.1, perGauge 0",
			],
		],
		[
			"un soin négatif à jauge 1",
			{ form: WOUNDS, effect: { base: "armyStat", heal: linear(0.5, -0.6) } },
			[
				"le coefficient de soin doit être un nombre fini ≥ 0 aux deux bouts de la jauge, reçu : constant 0.5, perGauge -0.6",
			],
		],
		[
			"des dégâts infinis",
			{
				effect: { base: "armyStat", damage: linear(Number.POSITIVE_INFINITY) },
			},
			[
				"le coefficient de dégâts doit être un nombre fini ≥ 0 aux deux bouts de la jauge, reçu : constant Infinity, perGauge 0",
			],
		],
		[
			"un sort mixte aux dégâts NaN, sans second refus pour le mixte",
			{
				effect: {
					base: "armyStat",
					damage: linear(Number.NaN),
					heal: linear(0.5),
				},
			},
			[
				"le coefficient de dégâts doit être un nombre fini ≥ 0 aux deux bouts de la jauge, reçu : constant NaN, perGauge 0",
			],
		],
		[
			"des dégâts qui suivent une jauge hors forme conditionnelle",
			{ effect: { base: "armyStat", damage: linear(1, 0.2) } },
			[
				"le coefficient de dégâts ne suit une jauge que dans une forme conditionnelle, reçu : perGauge 0.2",
			],
		],
		[
			"la jauge classShare sans classe",
			{ form: { kind: "conditional", gauge: "classShare" } },
			["la jauge « classShare » doit nommer une classe"],
		],
		[
			"une classe nommée sur une autre jauge",
			{ form: { ...WOUNDS, characterClass: "golem" } },
			[
				"seule la jauge « classShare » nomme une classe, reçu : « golem » sur la jauge « armyWounds »",
			],
		],
		[
			"un coûteux qui ne coûte rien",
			{ form: { kind: "costly", armyLossShare: 0 } },
			[
				"la part des dégâts que perd l'armée doit être strictement entre 0 et 1, reçu : 0",
			],
		],
		[
			"un coûteux qui coûte tous les dégâts",
			{ form: { kind: "costly", armyLossShare: 1 } },
			[
				"la part des dégâts que perd l'armée doit être strictement entre 0 et 1, reçu : 1",
			],
		],
		[
			"un coûteux à part perdue NaN",
			{ form: { kind: "costly", armyLossShare: Number.NaN } },
			[
				"la part des dégâts que perd l'armée doit être strictement entre 0 et 1, reçu : NaN",
			],
		],
		[
			"dégâts 0,6 + soin 0,5",
			{ effect: { base: "armyStat", damage: linear(0.6), heal: linear(0.5) } },
			[
				"dégâts + soin d'un sort mixte doivent rester au plus 1 aux deux bouts de la jauge, reçu : 1.1 à jauge 0, 1.1 à jauge 1",
			],
		],
		[
			"dégâts 0,5 + 0,2 × jauge + soin 0,5",
			{
				form: WOUNDS,
				effect: {
					base: "armyStat",
					damage: linear(0.5, 0.2),
					heal: linear(0.5),
				},
			},
			[
				"dégâts + soin d'un sort mixte doivent rester au plus 1 aux deux bouts de la jauge, reçu : 1 à jauge 0, 1.2 à jauge 1",
			],
		],
	])("%s : refusé", (_, change, errors) => {
		expect(validateSpell({ ...SWORD, ...change })).toEqual(errors);
	});

	test.each<[string, Partial<Spell>]>([
		["un poids 0, sort donné à la main", { weight: 0 }],
		[
			"Prière, soin 0,6 + dégâts 0,4",
			{
				recipe: shares({ strength: 20, magic: 80 }),
				effect: { base: "armyStat", heal: linear(0.6), damage: linear(0.4) },
			},
		],
		[
			// En binaire, 0,34 + 0,56 + 0,1 vaut 1,0000000000000002.
			"dégâts 0,34 + 0,56 × jauge + soin 0,1, à ×1,0 tout juste à jauge 1",
			{
				form: WOUNDS,
				effect: {
					base: "armyStat",
					damage: linear(0.34, 0.56),
					heal: linear(0.1),
				},
			},
		],
	])("%s : accepté", (_, change) => {
		expect(validateSpell({ ...SWORD, ...change })).toEqual([]);
	});
});

// Une part nulle aux deux bouts de la jauge ne fait rien. Comptée présente, elle ferait d'un soin un
// vol de vie, et un jumeau de Soin (n° 11) passerait l'unicité (game design § 2, « Unicité »).
describe("une part d'effet nulle", () => {
	const ZERO_DAMAGE =
		"le coefficient de dégâts vaut 0 aux deux bouts de la jauge : omettre la part de dégâts";
	const ZERO_HEAL =
		"le coefficient de soin vaut 0 aux deux bouts de la jauge : omettre la part de soin";

	test.each<[string, Partial<Effect>, string[]]>([
		[
			"dégâts nuls et soin 1",
			{ damage: linear(0), heal: linear(1) },
			[ZERO_DAMAGE],
		],
		[
			"soin nul et dégâts 1",
			{ damage: linear(1), heal: linear(0) },
			[ZERO_HEAL],
		],
		["dégâts nuls seuls", { damage: linear(0) }, [ZERO_DAMAGE]],
		["soin nul seul", { heal: linear(0) }, [ZERO_HEAL]],
		[
			"dégâts nuls et soin 1,2, sans second refus pour le mixte",
			{ damage: linear(0), heal: linear(1.2) },
			[ZERO_DAMAGE],
		],
	])("aux deux bouts de la jauge, %s : refusé", (_, parts, errors) => {
		const effect: Effect = { base: "armyStat", ...parts };
		expect(validateSpell({ ...SWORD, form: WOUNDS, effect })).toEqual(errors);
	});

	test.each<[string, Linear]>([
		["dégâts 0 + 1 × jauge", linear(0, 1)],
		["dégâts 1 − 1 × jauge", linear(1, -1)],
	])("à un seul bout de la jauge, %s : accepté", (_, damage) => {
		const effect: Effect = { base: "armyStat", damage };
		expect(validateSpell({ ...SWORD, form: WOUNDS, effect })).toEqual([]);
	});
});
