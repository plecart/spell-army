import type { Client } from "@modelcontextprotocol/client";
import { type Executor, readDrawablePool, readSpell } from "donnees";
import { writePage } from "joueurs";
import { entry } from "joueurs/test/faux-fournisseur";
import { characterOf, drawSpell } from "personnages";
import { describe, expect, test } from "vitest";
import { CLASS } from "./classes.ts";
import {
	auditOf,
	connectToRegistry,
	expectRefusal,
	outputOf,
	publishedTools,
} from "./montage.ts";

const PLAYER_TOOLS = ["chercher_joueur"];
const nonBlank = expect.stringMatching(/\S/);

async function search(client: Client, args: Record<string, unknown>) {
	return client.callTool({ name: "chercher_joueur", arguments: args });
}

/**
 * Le joueur `id`, de pseudo `pseudo`, tel que les outils le rendent : sa classe sous son nom
 * d'outil, son sort celui que l'inscription lui a tiré dans la réserve.
 */
async function expectedPlayer(db: Executor, id: string, pseudo: string) {
	const numero = Number(drawSpell(id, await readDrawablePool(db)));
	return {
		identifiant: id,
		pseudo,
		classe: CLASS[characterOf(id).class],
		sort: { numero, nom: (await readSpell(db, numero)).name },
	};
}

describe("outils des joueurs : tools/list", () => {
	test("publie chercher_joueur en lecture seule ; un schéma de sortie strict, chaque champ d'entrée décrit", () => {
		const strict = expect.objectContaining({
			type: "object",
			additionalProperties: false,
		});
		expect(
			publishedTools(PLAYER_TOOLS).map(
				({ name, title, annotations, inputSchema, outputSchema }) => ({
					name,
					title,
					annotations,
					fields: Object.entries(inputSchema.properties ?? {}).map(
						([field, schema]) => [
							field,
							(schema as { description?: string }).description,
						],
					),
					outputSchema,
				}),
			),
		).toEqual([
			{
				name: "chercher_joueur",
				title: "Chercher un joueur",
				annotations: {
					readOnlyHint: true,
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false,
				},
				fields: [["pseudo", nonBlank]],
				outputSchema: strict,
			},
		]);
	});
});

describe("chercher_joueur", () => {
	test("ARM rend armure.x puis wizard_army sous les noms des outils, sans aucun autre champ ; une ligne d'audit", async () => {
		const { db, client } = await connectToRegistry();
		await writePage(db, [
			entry("10", "wizard_army"),
			entry("11", "armure.x"),
			entry("12", "zzz"),
		]);
		expect(outputOf(await search(client, { pseudo: "ARM" }))).toEqual({
			joueurs: [
				await expectedPlayer(db, "11", "armure.x"),
				await expectedPlayer(db, "10", "wizard_army"),
			],
			tronque: false,
		});
		expect(await auditOf(db, "chercher_joueur")).toEqual([
			expect.objectContaining({
				input: { pseudo: "ARM" },
				succeeded: true,
				before: null,
				after: null,
			}),
		]);
	});

	test("rend la liste tronquée au-delà de 20 joueurs", async () => {
		const { db, client } = await connectToRegistry();
		await writePage(
			db,
			Array.from({ length: 21 }, (_, rank) => entry(String(rank + 1))),
		);
		const { joueurs, tronque } = outputOf(
			await search(client, { pseudo: "joueur" }),
		) as { joueurs: unknown[]; tronque: boolean };
		expect({ joueurs: joueurs.length, tronque }).toEqual({
			joueurs: 20,
			tronque: true,
		});
	});

	// L'alphabet des pseudos Instagram (`INSTAGRAM_USERNAME_PATTERN`) : 1 à 30 caractères de
	// `[A-Za-z0-9._]`.
	test.each<[string, Record<string, unknown>, string]>([
		["un pseudo vide", { pseudo: "" }, "Invalid string"],
		["31 caractères", { pseudo: "a".repeat(31) }, "Invalid string"],
		["une espace", { pseudo: "a b" }, "Invalid string"],
		["une lettre accentuée", { pseudo: "é" }, "Invalid string"],
		["un %", { pseudo: "%" }, "Invalid string"],
		["sans pseudo", {}, "expected string"],
		[
			"un champ inconnu",
			{ pseudo: "a", nombre: 1 },
			'Unrecognized key: "nombre"',
		],
	])(
		"%s : refusé, une ligne d'audit en erreur avec l'entrée reçue",
		async (_, args, message) => {
			await expectRefusal("chercher_joueur", args, message);
		},
	);
});
