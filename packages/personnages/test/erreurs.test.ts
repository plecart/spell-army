import { expect, test } from "vitest";
import { characterOf, drawSpell, type SpellEntry } from "../src/index.ts";

const INVALID_ID = new RangeError(
	"l'identifiant Instagram doit être un texte non vide de chiffres décimaux (0 à 9)",
);
const NO_POSITIVE_WEIGHT = new RangeError(
	"la réserve tirable doit contenir au moins un sort de poids positif",
);
const invalidWeight = (id: string, weight: number) =>
	new RangeError(
		`le poids du sort « ${id} » doit être un nombre fini ≥ 0, reçu : ${weight}`,
	);
const VALID_POOL: SpellEntry[] = [{ id: "eclair", weight: 1 }];

// Une ligne par forme d'identifiant fautive. Le nombre JS passerait l'expression régulière par
// conversion en texte : seul le contrôle de type l'arrête.
const INVALID_IDENTIFIERS: [string, unknown][] = [
	["vide", ""],
	["avec une lettre", "12a"],
	["signé", "-12"],
	["à virgule", "1.5"],
	["précédé d'une espace", " 12"],
	["suivi d'une espace", "12 "],
	["en chiffres arabes-indiens", "١٢"],
	["qui est un nombre JS", 12],
];

// Une ligne par forme de réserve fautive ; le poids fautif suit un poids valide.
const INVALID_POOLS: [string, SpellEntry[], RangeError][] = [
	["vide", [], NO_POSITIVE_WEIGHT],
	[
		"toute à 0",
		[
			{ id: "eclair", weight: 0 },
			{ id: "gel", weight: 0 },
		],
		NO_POSITIVE_WEIGHT,
	],
	[
		"avec un poids négatif",
		[
			{ id: "eclair", weight: 1 },
			{ id: "gel", weight: -1 },
		],
		invalidWeight("gel", -1),
	],
	[
		"avec un poids NaN",
		[
			{ id: "eclair", weight: 1 },
			{ id: "gel", weight: Number.NaN },
		],
		invalidWeight("gel", Number.NaN),
	],
	[
		"avec un poids infini",
		[
			{ id: "eclair", weight: 1 },
			{ id: "gel", weight: Number.POSITIVE_INFINITY },
		],
		invalidWeight("gel", Number.POSITIVE_INFINITY),
	],
	[
		"avec un poids infini négatif",
		[
			{ id: "eclair", weight: 1 },
			{ id: "gel", weight: Number.NEGATIVE_INFINITY },
		],
		invalidWeight("gel", Number.NEGATIVE_INFINITY),
	],
	[
		"dont la somme des poids n'est plus un nombre fini",
		[
			{ id: "eclair", weight: Number.MAX_VALUE },
			{ id: "gel", weight: Number.MAX_VALUE },
		],
		new RangeError(
			"la somme des poids de la réserve tirable doit rester un nombre fini",
		),
	],
];

test.each(INVALID_IDENTIFIERS)(
	"characterOf refuse un identifiant %s",
	(_, instagramId) => {
		expect(() => characterOf(instagramId as string)).toThrow(INVALID_ID);
	},
);

test.each(INVALID_IDENTIFIERS)(
	"drawSpell refuse un identifiant %s",
	(_, instagramId) => {
		expect(() => drawSpell(instagramId as string, VALID_POOL)).toThrow(
			INVALID_ID,
		);
	},
);

test.each(INVALID_POOLS)(
	"drawSpell refuse une réserve %s",
	(_, pool, error) => {
		expect(() => drawSpell("1", pool)).toThrow(error);
	},
);
