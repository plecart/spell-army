import { existsSync } from "node:fs";
import { refusedQuery } from "donnees/test/erreur-postgres";
import { describe, expect, test } from "vitest";
import { generateWiki } from "../scripts/wiki/generate.ts";
import { passagesOf, readDocuments } from "../scripts/wiki/passages.ts";
import {
	generated,
	IMAGE_BYTES,
	outputFolder,
	POOL,
	withImage,
} from "./wiki.ts";

const DOCUMENTS = await readDocuments();

describe("la génération du wiki", () => {
	test("deux générations sur les mêmes entrées sont identiques octet pour octet", async () => {
		const spells = withImage(6, {
			bytes: new Uint8Array(IMAGE_BYTES),
			type: "image/png",
		});
		const first = await generated(spells);
		const second = await generated(spells);
		const files = (await first.files()).sort();
		expect((await second.files()).sort()).toEqual(files);
		for (const file of files) {
			expect
				.soft(await second.bytes(file), file)
				.toEqual(await first.bytes(file));
		}
	});

	test("sans sort tirable, elle refuse de publier un wiki sans sorts, et n'écrit rien", async () => {
		const folder = await outputFolder();
		await expect(
			generateWiki(folder, async () =>
				POOL.map((spell) => ({ ...spell, weight: 0 })),
			),
		).rejects.toMatchObject({
			message:
				"Aucun sort tirable (poids > 0) : la génération refuse de publier un wiki sans sorts.",
		});
		expect(existsSync(folder)).toBe(false);
	});

	test("un sort tirable invalide l'arrête, nommé avec ses erreurs, et rien n'est écrit", async () => {
		const folder = await outputFolder();
		const spells = POOL.map((spell) =>
			spell.number === 2
				? {
						...spell,
						recipe: {
							kind: "shares" as const,
							shares: { strength: 60, life: 30 },
						},
					}
				: spell,
		);
		await expect(
			generateWiki(folder, async () => spells),
		).rejects.toMatchObject({
			message:
				"Le sort n° 2, « Lancer de rocher », est invalide : les parts de la recette doivent faire 100 %, reçu : 90 %.",
		});
		expect(existsSync(folder)).toBe(false);
	});

	test.each([
		[
			"42P01",
			"La table spells est absente : les migrations ne sont pas appliquées à cette base.",
		],
		["42501", "Lecture refusée : le rôle n'a pas SELECT sur spells."],
	])(
		"un refus de la base sous le code %s s'explique : « %s », et rien n'est écrit",
		async (code, message) => {
			const folder = await outputFolder();
			await expect(
				generateWiki(folder, async () => {
					throw refusedQuery(code);
				}),
			).rejects.toMatchObject({ message });
			expect(existsSync(folder)).toBe(false);
		},
	);

	// Le message de Postgres peut citer le rôle ou la base de `DATABASE_URL` : seul son code sort.
	test("un refus de la base sous un autre code se nomme par ce code, sans le message de Postgres", async () => {
		const refusal = refusedQuery("28P01");
		await expect(
			generateWiki(await outputFolder(), async () => {
				throw refusal;
			}),
		).rejects.toMatchObject({
			message: "La lecture des sorts a échoué : code 28P01.",
			cause: refusal,
		});
	});

	test.each([
		{
			form: "par le message de sa cause la plus profonde",
			cause: new Error("Connection terminated unexpectedly"),
			reason: "Connection terminated unexpectedly",
		},
		{
			form: "sans message, par son nom",
			cause: new AggregateError([]),
			reason: "AggregateError",
		},
	])("une erreur sans code se nomme $form", async ({ cause, reason }) => {
		await expect(
			generateWiki(await outputFolder(), async () => {
				throw new Error("enveloppe", { cause });
			}),
		).rejects.toMatchObject({
			message: `La lecture des sorts a échoué : ${reason}.`,
		});
	});

	// Les ancres des passages recopiés : chacune retirée de son document, la génération s'arrête en
	// la nommant, plutôt que de publier une page vide.
	test.each([
		[
			"## 1. Ce qui est ferme",
			"docs/etudes/00-cadrage.md : section « 1. Ce qui est ferme » introuvable.",
			"cadrage",
		],
		[
			"- **Le concept** :",
			"docs/etudes/00-cadrage.md : puce « Le concept » introuvable au § 1.",
			"cadrage",
		],
		[
			"## 2. Les sorts",
			"docs/game-design.md : section « 2. Les sorts » introuvable.",
			"gameDesign",
		],
		[
			"**Puissance d'un sort lancé par l'armée**",
			"docs/game-design.md : bloc « Puissance d'un sort lancé par l'armée » introuvable au § 2.",
			"gameDesign",
		],
		[
			"## 4. Le combat",
			"docs/game-design.md : section « 4. Le combat » introuvable.",
			"gameDesign",
		],
	] as const)(
		"sans l'ancre « %s », la génération s'arrête : « %s »",
		(anchor, message, document) => {
			expect(DOCUMENTS[document]).toContain(anchor);
			const altered = {
				...DOCUMENTS,
				[document]: DOCUMENTS[document].replace(anchor, "ancre retirée"),
			};
			expect(() => passagesOf(altered)).toThrow(message);
		},
	);

	// Le titre doit être suivi de la formule en citation, puis d'un paragraphe : un autre bloc à leur
	// place — le tableau du § 2 — serait recopié sans rien signaler.
	const TITLE = "**Puissance d'un sort lancé par l'armée** :";
	const FORMULA = "> valeur = coefficient du sort × stat de l'armée";
	const PARAGRAPH =
		"La stat de l'armée est la somme de celles de ses personnages.";
	// Un paragraphe qui s'ouvre sur du gras ou du gras italique reste un paragraphe.
	test.each([
		"**La stat** de l'armée est la somme.",
		"***La stat*** de l'armée est la somme.",
	])("un paragraphe qui s'ouvre sur « %s » suit la formule", (paragraph) => {
		const gameDesign = [
			"## 2. Les sorts",
			TITLE,
			FORMULA,
			paragraph,
			"## 4. Le combat",
		].join("\n\n");
		expect(passagesOf({ ...DOCUMENTS, gameDesign }).power).toContain(paragraph);
	});
	const TABLE = "| Sort | Effet |\n|---|---|\n| Boule de feu | dégâts |";
	// Un bloc de chaque forme qui n'est pas un paragraphe, à la place du paragraphe.
	const NOT_PARAGRAPHS = {
		"un tableau": TABLE,
		"une autre citation": FORMULA,
		"un titre": "### Exemple",
		"une liste à puces": "- un lanceur",
		"une liste numérotée": "1. un lanceur",
		"un bloc de code": "```\nvaleur\n```",
		"un code entre tildes": "~~~\nvaleur\n~~~",
		"un code indenté": "    valeur",
		"un bloc HTML": "<div>valeur</div>",
		"une ligne de séparation": "---",
	};
	test.each([
		{ form: "qui finit le § 2 sur sa formule", blocks: [TITLE, FORMULA] },
		{ form: "sans sa formule", blocks: [TITLE, PARAGRAPH, PARAGRAPH] },
		...Object.entries(NOT_PARAGRAPHS).map(([kind, block]) => ({
			// Vitest tronque `$form` à 40 caractères : chaque nom reste court, donc distinct.
			form: `formule puis ${kind}`,
			blocks: [TITLE, FORMULA, block],
		})),
	])(
		"un bloc « Puissance d'un sort lancé par l'armée » $form arrête la génération, qui le nomme",
		({ blocks }) => {
			const gameDesign = ["## 2. Les sorts", ...blocks, "## 4. Le combat"].join(
				"\n\n",
			);
			expect(() => passagesOf({ ...DOCUMENTS, gameDesign })).toThrow(
				"docs/game-design.md : bloc « Puissance d'un sort lancé par l'armée » incomplet au § 2 : sa formule ou le paragraphe qui la suit manque.",
			);
		},
	);
});
