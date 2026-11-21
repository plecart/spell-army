import type { Client } from "@modelcontextprotocol/client";
import {
	type Executor,
	INSTAGRAM_ID_PATTERN,
	INSTAGRAM_USERNAME_PATTERN,
	players,
	readDrawablePool,
	readSpell,
	updateSpell,
} from "donnees";
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

const PLAYER_TOOLS = ["chercher_joueur", "donner_sort"];
const nonBlank = expect.stringMatching(/\S/);

async function search(client: Client, args: Record<string, unknown>) {
	return client.callTool({ name: "chercher_joueur", arguments: args });
}

async function give(client: Client, args: Record<string, unknown>) {
	return client.callTool({ name: "donner_sort", arguments: args });
}

/** Les joueurs, toutes colonnes, par identifiant croissant. */
function readPlayers(db: Executor) {
	return db.select().from(players).orderBy(players.instagramId);
}

/** Le numéro du sort du joueur `id`. */
async function spellOf(db: Executor, id: string) {
	return (await readPlayers(db)).find(({ instagramId }) => instagramId === id)
		?.spellNumber;
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

/** Chaque motif d'un schéma JSON, avec le pointeur de son nœud, à toute profondeur. */
function patternsOf(schema: unknown, pointer = "#"): [string, string][] {
	if (typeof schema !== "object" || schema === null) {
		return [];
	}
	return Object.entries(schema).flatMap(([key, value]) =>
		key === "pattern" && typeof value === "string"
			? [[pointer, value] as [string, string]]
			: patternsOf(value, `${pointer}/${key}`),
	);
}

describe("outils des joueurs : tools/list", () => {
	test("publie chercher_joueur en lecture seule et donner_sort, qui écrase le sort du joueur ; des schémas de sortie stricts, chaque champ d'entrée décrit", () => {
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
			{
				name: "donner_sort",
				title: "Donner un sort à un joueur",
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
					idempotentHint: true,
					openWorldHint: false,
				},
				fields: ["identifiant", "sort"].map((field) => [field, nonBlank]),
				outputSchema: strict,
			},
		]);
	});

	test("les schémas de sortie gardent la forme Instagram de chaque identifiant et de chaque pseudo", () => {
		expect(
			publishedTools(PLAYER_TOOLS).flatMap(({ name, outputSchema }) =>
				patternsOf(outputSchema).map(([pointer, pattern]) => [
					name,
					pointer,
					pattern,
				]),
			),
		).toEqual([
			[
				"chercher_joueur",
				"#/properties/joueurs/items/properties/identifiant",
				INSTAGRAM_ID_PATTERN.source,
			],
			[
				"chercher_joueur",
				"#/properties/joueurs/items/properties/pseudo",
				INSTAGRAM_USERNAME_PATTERN.source,
			],
			["donner_sort", "#/properties/identifiant", INSTAGRAM_ID_PATTERN.source],
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

describe("donner_sort", () => {
	// Le joueur qui reçoit, et un témoin qui garde son sort.
	const TARGET = "10";
	const WITNESS = "11";

	test.each<[string, number | undefined]>([
		["un sort tirable", undefined],
		["un sort de poids 0", 0],
	])(
		"%s remplace celui du joueur et se rend avec son identifiant ; une ligne d'audit garde l'ancien et le nouveau numéro",
		async (_, weight) => {
			const { db, client } = await connectToRegistry();
			await writePage(db, [entry(TARGET), entry(WITNESS)]);
			const previous = await spellOf(db, TARGET);
			const witness = await spellOf(db, WITNESS);
			const sort = previous === 1 ? 2 : 1;
			if (weight !== undefined) {
				await updateSpell(db, sort, { weight });
			}
			const args = { identifiant: TARGET, sort };
			expect(outputOf(await give(client, args))).toEqual(args);
			expect(await auditOf(db, "donner_sort")).toEqual([
				expect.objectContaining({
					input: args,
					succeeded: true,
					before: { identifiant: TARGET, sort: previous },
					after: args,
				}),
			]);
			expect([await spellOf(db, TARGET), await spellOf(db, WITNESS)]).toEqual([
				sort,
				witness,
			]);
		},
	);

	test.each<[string, string, number, string]>([
		[
			"un joueur absent",
			"99",
			1,
			"Aucun joueur d'identifiant 99 : rien n'a changé.",
		],
		[
			"un sort inexistant",
			TARGET,
			999,
			"Aucun sort de numéro 999 : rien n'a changé.",
		],
	])(
		"%s : refusé, une ligne d'audit en erreur, la base inchangée",
		async (_, identifiant, sort, message) => {
			const { db, client } = await connectToRegistry();
			await writePage(db, [entry(TARGET), entry(WITNESS)]);
			const before = await readPlayers(db);
			expect(await give(client, { identifiant, sort })).toMatchObject({
				content: [{ type: "text", text: message }],
				isError: true,
			});
			expect(await auditOf(db, "donner_sort")).toEqual([
				expect.objectContaining({
					input: { identifiant, sort },
					succeeded: false,
					error: message,
				}),
			]);
			expect(await readPlayers(db)).toEqual(before);
		},
	);

	test.each<[string, Record<string, unknown>, string]>([
		[
			"un identifiant à zéro de tête",
			{ identifiant: "007", sort: 1 },
			"Invalid string",
		],
		["un sort nul", { identifiant: TARGET, sort: 0 }, "Too small"],
		["un sort non entier", { identifiant: TARGET, sort: 1.5 }, "expected int"],
		[
			"un champ inconnu",
			{ identifiant: TARGET, sort: 1, pseudo: "a" },
			'Unrecognized key: "pseudo"',
		],
	])(
		"%s : refusé, une ligne d'audit en erreur avec l'entrée reçue",
		async (_, args, message) => {
			await expectRefusal("donner_sort", args, message);
		},
	);
});
