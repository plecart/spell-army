import { expect, test } from "vitest";
import {
	effectCategory,
	STARTING_POOL,
	spellKey,
	validateSpell,
} from "../src/index.ts";
import { ANNEX_B, type AnnexRow } from "./annexe-b.ts";

// Le vocabulaire de l'annexe B, dans celui du modèle d'un sort. Un mot absent de ce vocabulaire ne
// rencontre aucune valeur du sort : le test rougit.
const STATS: Record<string, string> = {
	Vie: "life",
	Force: "strength",
	Magie: "magic",
	Vitesse: "speed",
};
const FORMS: Record<string, object> = {
	sûr: { kind: "safe" },
	coûteux: { kind: "costly" },
	inversé: { kind: "inverted" },
	"selon la Vie du monstre": { kind: "conditional", gauge: "monsterLifeLost" },
	"selon les blessures de l'armée": {
		kind: "conditional",
		gauge: "armyWounds",
	},
	"selon la part de golems": {
		kind: "conditional",
		gauge: "classShare",
		characterClass: "golem",
	},
	"selon la part de la classe du lanceur": {
		kind: "conditional",
		gauge: "casterClassShare",
	},
};
const PARTS: Record<string, string> = { dégâts: "damage", soin: "heal" };
const BASES: Record<string, string> = {
	"de la Vie maximale": "armyMaxLife",
	"du dernier coup": "monsterLastHit",
};
// La pente de « ×a → ×b » est b − a, calculée en binaire : 0,4 − 1,4 y vaut -0,9999999999999999.
const DIGITS = 9;

/** Le sort qu'écrit une ligne de l'annexe B ; la description, phrase de la carte, n'y est pas. */
function annexSpell({ number, name, recipe, form, effect }: AnnexRow) {
	const [, parts = "", loss] = /^(.*?)(?: ; (.*))?$/.exec(effect) ?? [];
	return {
		number,
		name,
		recipe: annexRecipe(recipe),
		form: annexForm(form, loss),
		effect: { base: annexBase(effect), ...annexParts(parts) },
		weight: 1,
		description: expect.any(String),
	};
}

/**
 * « 60 % Force + 40 % Vie », « meilleure stat », ou « dernier coup reçu (efficacité sur la Vie) »,
 * dont l'efficacité, donc la recette (game design § 2, « Recette »), est 100 % Vie.
 */
function annexRecipe(recipe: string) {
	if (recipe === "meilleure stat") return { kind: "bestStat" };
	const shares = recipe.replace(
		/^dernier coup reçu \(efficacité sur la (\p{L}+)\)$/u,
		"100 % $1",
	);
	return {
		kind: "shares",
		shares: Object.fromEntries(
			[...shares.matchAll(/(\d+) % (\p{L}+)/gu)].map(([, share, stat = ""]) => [
				STATS[stat] ?? stat,
				Number(share),
			]),
		),
	};
}

/** Un mot de `FORMS` ; la part perdue d'un coûteux suit le « ; » de l'effet. */
function annexForm(form: string, loss: string | undefined) {
	return {
		...FORMS[form],
		...(loss !== undefined && { armyLossShare: annexNumbers(loss, 1)[0] }),
	};
}

/** La Vie maximale de l'armée, le dernier coup du monstre ou, sans mention, la stat de l'armée. */
function annexBase(effect: string) {
	const base = Object.entries(BASES).find(([words]) => effect.includes(words));
	return base?.[1] ?? "armyStat";
}

/** Les parts de l'effet, « dégâts » ou « soin », liées par « + ». */
function annexParts(parts: string) {
	return Object.fromEntries(
		[...parts.matchAll(/(dégâts|soin) (.+?)(?= \+ (?:dégâts|soin)|$)/g)].map(
			([, part = "", amount = ""]) => [
				PARTS[part] ?? part,
				annexLinear(amount),
			],
		),
	);
}

/**
 * Le coefficient d'une part, selon son écriture : « ×a » ou « N % … », a ou N / 100 partout ;
 * « ×a (…) → ×b (…) », a à jauge 0 et b à jauge 1 ; « ×(a + b × …) », a + b × jauge.
 */
function annexLinear(amount: string) {
	const ends = amount.includes("→");
	const slope = amount.includes("×(");
	const [a = Number.NaN, b = Number.NaN] = annexNumbers(
		amount,
		ends || slope ? 2 : 1,
	);
	const perGauge = ends ? b - a : slope ? b : 0;
	return {
		constant: expect.closeTo(a, DIGITS),
		perGauge: expect.closeTo(perGauge, DIGITS),
	};
}

/**
 * Les nombres d'un texte de l'annexe, « 1,15 » pour 1,15 et « 10 % » pour 0,1. Il en faut
 * `count` : un nombre de plus, sans valeur du sort à lui confronter, rougit le test.
 */
function annexNumbers(text: string, count: number): number[] {
	const numbers = [...text.matchAll(/(\d+(?:,\d+)?)( %)?/g)].map(
		([, digits = "", percent]) =>
			Number(digits.replace(",", ".")) / (percent ? 100 : 1),
	);
	if (numbers.length !== count) {
		throw new Error(
			`${count} nombre(s) attendu(s) dans « ${text} », lu(s) : ${numbers.join(", ")}`,
		);
	}
	return numbers;
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
	"le sort n° $number, « $name », a la recette, la forme et l'effet de l'annexe B, et pèse 1",
	(row) => {
		expect(STARTING_POOL[row.number - 1]).toEqual(annexSpell(row));
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
