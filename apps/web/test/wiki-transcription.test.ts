import { STARTING_POOL, type Spell } from "combat";
import { ANNEX_B } from "combat/test/annexe-b";
import { expect, test } from "vitest";
import { spellText } from "../scripts/wiki/spell-text.ts";

// La transcription d'un sort, confrontée à sa ligne de l'annexe B lue à la source : trois cellules
// par sort, recette, forme et effet.
const COLUMNS = {
	recipe: "la recette",
	form: "la forme",
	effect: "l'effet",
} as const;
type Column = keyof typeof COLUMNS;

/**
 * Les cellules que l'annexe écrit autrement qu'une transcription régulière : ce que la page du sort
 * écrit à la place, et pourquoi. Une cellule irrégulière absente de cette table rougit le test de sa
 * cellule ; une exception devenue conforme rougit le sien.
 */
const EXCEPTIONS: {
	number: number;
	column: Column;
	transcription: string;
	reason: string;
}[] = [
	{
		number: 2,
		column: "recipe",
		transcription: "40 % Vie + 60 % Force",
		reason:
			"l'annexe écrit la Force avant la Vie ; la page suit l'ordre des stats du game design § 1",
	},
	{
		number: 12,
		column: "effect",
		transcription: "vol de vie : dégâts ×0,4 + soin ×0,6",
		reason:
			"l'annexe écrit le soin avant les dégâts, sans le « vol de vie : » des n° 5 et 9",
	},
	{
		number: 14,
		column: "effect",
		transcription: "soin ×0,2 de la Vie maximale de l'armée",
		reason: "l'annexe écrit le coefficient en pourcentage de sa base",
	},
	{
		number: 15,
		column: "effect",
		transcription: "dégâts ×0,5 (armée intacte) → ×1,5 (armée presque morte)",
		reason:
			"l'annexe ne nomme pas les bornes de la jauge, que le n° 13 nomme pour la même",
	},
	{
		number: 20,
		column: "recipe",
		transcription: "100 % Vie",
		reason:
			"l'annexe nomme la base de l'effet et l'efficacité sur la Vie, qui est la recette (game design § 2, « Recette »)",
	},
	{
		number: 20,
		column: "effect",
		transcription: "dégâts ×1,4 du dernier coup du monstre",
		reason: "l'annexe écrit le coefficient en pourcentage de sa base",
	},
];

const CELLS = ANNEX_B.flatMap((row) =>
	(Object.keys(COLUMNS) as Column[]).map((column) => ({
		number: row.number,
		name: row.name,
		column,
		label: COLUMNS[column],
		annex: row[column],
	})),
);

const isException = (number: number, column: Column) =>
	EXCEPTIONS.some(
		(exception) => exception.number === number && exception.column === column,
	);

function poolSpell(number: number): Spell {
	const spell = STARTING_POOL.find((candidate) => candidate.number === number);
	if (!spell) {
		throw new Error(`aucun sort n° ${number} dans la réserve de départ`);
	}
	return spell;
}

test("l'annexe B porte 72 cellules de recette, forme et effet, dont 6 en exception", () => {
	expect([CELLS.length, EXCEPTIONS.length]).toEqual([72, 6]);
});

test.each(CELLS.filter(({ number, column }) => !isException(number, column)))(
	"le sort n° $number, « $name » : sa page écrit $label de l'annexe B",
	({ number, column, annex }) => {
		expect(spellText(poolSpell(number))[column]).toBe(annex);
	},
);

test("un sort ajouté selon la part de fées, de pente négative : « selon la part de fées », « − » dans la formule", () => {
	expect(
		spellText({
			recipe: { kind: "shares", shares: { magic: 100 } },
			form: {
				kind: "conditional",
				gauge: "classShare",
				characterClass: "fairy",
			},
			effect: { base: "armyStat", damage: { constant: 1.2, perGauge: -0.8 } },
		}),
	).toEqual({
		recipe: "100 % Magie",
		form: "selon la part de fées",
		effect: "dégâts ×(1,2 − 0,8 × part de fées)",
	});
});

test.each(
	EXCEPTIONS.map((exception) => ({
		...exception,
		label: COLUMNS[exception.column],
	})),
)(
	"le sort n° $number, en exception sur $label : sa page écrit « $transcription », l'annexe autrement",
	({ number, column, transcription }) => {
		const annex = CELLS.find(
			(cell) => cell.number === number && cell.column === column,
		)?.annex;
		expect({
			page: spellText(poolSpell(number))[column],
			annex,
		}).toEqual({ page: transcription, annex: expect.any(String) });
		expect(annex).not.toBe(transcription);
	},
);
