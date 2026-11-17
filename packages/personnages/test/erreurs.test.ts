import { expect, test } from "vitest";
import { characterOf } from "../src/index.ts";

const INVALID_ID = new RangeError(
	"l'identifiant Instagram doit être un texte non vide de chiffres décimaux (0 à 9)",
);

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

test.each(INVALID_IDENTIFIERS)(
	"characterOf refuse un identifiant %s",
	(_, instagramId) => {
		expect(() => characterOf(instagramId as string)).toThrow(INVALID_ID);
	},
);
