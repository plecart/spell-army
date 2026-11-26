import { existsSync } from "node:fs";
import { refusedQuery } from "donnees/test/erreur-postgres";
import { describe, expect, test } from "vitest";
import { generateWiki } from "../scripts/wiki/generate.ts";
import {
	generated,
	IMAGE_BYTES,
	outputFolder,
	POOL,
	withImage,
} from "./wiki.ts";

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
			form: "par le message de sa cause",
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
});
