import type { Client } from "@modelcontextprotocol/client";
import {
	type Executor,
	excludedPlayers,
	INSTAGRAM_ID_PATTERN,
	INSTAGRAM_USERNAME_PATTERN,
	players,
	readDrawablePool,
	readSpell,
	updateSpell,
} from "donnees";
import { type FollowerProvider, removePlayer, writePage } from "joueurs";
import { entry, FakeFollowerProvider } from "joueurs/test/faux-fournisseur";
import { characterOf, drawSpell } from "personnages";
import { describe, expect, test, vi } from "vitest";
import { CLASS } from "./classes.ts";
import {
	auditOf,
	CODE_LIFETIME_MS,
	codeFor,
	confirmationOf,
	connectToRegistry,
	expectRefusal,
	flipLowBit,
	freezeDate,
	nonBlank,
	outputOf,
	publishedTools,
	REFUSED_CODE,
} from "./montage.ts";

const PLAYER_TOOLS = ["chercher_joueur", "donner_sort", "retirer_joueur"];

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
	test("publie chercher_joueur en lecture seule, donner_sort, qui écrase le sort du joueur, et retirer_joueur, qui supprime sa ligne, avec le code de la confirmation ; des schémas de sortie stricts, chaque champ d'entrée décrit", () => {
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
			{
				name: "retirer_joueur",
				title: "Retirer un joueur",
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
					idempotentHint: true,
					openWorldHint: false,
				},
				fields: ["identifiant", "code"].map((field) => [field, nonBlank]),
				outputSchema: strict,
			},
		]);
	});

	// Chaque motif publié, à toute profondeur : celui d'un champ qui le perdrait manquerait. L'enveloppe
	// de confirmation de retirer_joueur en ajoute un, celui de l'ISO 8601 de `z.iso.datetime()`.
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
			[
				"retirer_joueur",
				"#/properties/confirmation/properties/expiration",
				expect.any(String),
			],
			[
				"retirer_joueur",
				"#/properties/resultat/properties/identifiant",
				INSTAGRAM_ID_PATTERN.source,
			],
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

	test("un joueur retiré : refusé comme un joueur absent, la base inchangée", async () => {
		const { db, client } = await connectToRegistry();
		await writePage(db, [entry(TARGET), entry(WITNESS)]);
		await removePlayer(db, TARGET);
		const before = await readPlayers(db);
		expect(await give(client, { identifiant: TARGET, sort: 1 })).toMatchObject({
			content: [
				{
					type: "text",
					text: "Aucun joueur d'identifiant 10 : rien n'a changé.",
				},
			],
			isError: true,
		});
		expect(await readPlayers(db)).toEqual(before);
	});
});

describe("retirer_joueur", () => {
	// Le joueur retiré, au pseudo qu'aucune sortie ni ligne d'audit ne garde, un témoin qui reste,
	// un identifiant sans joueur et un identifiant déjà exclu.
	const TARGET = "10";
	const PSEUDO = "pseudo_a_effacer";
	const WITNESS = "11";
	const NON_PLAYER = "12";
	const EXCLUDED = "13";
	const LIST = [entry(TARGET, PSEUDO), entry(WITNESS)];

	const nothing = async () => {};
	const excludeOne = (db: Executor) =>
		db.insert(excludedPlayers).values({ instagramId: EXCLUDED });

	function remove(client: Client, args: Record<string, unknown>) {
		return client.callTool({ name: "retirer_joueur", arguments: args });
	}

	/** Le retrait de `identifiant`, confirmé par le code de l'appel sans code. */
	async function confirmedRemoval(client: Client, identifiant: string) {
		const code = await codeFor(client, "retirer_joueur", { identifiant });
		return remove(client, { identifiant, code });
	}

	/** Les joueurs, toutes colonnes, et les identifiants exclus. */
	async function stateOf(db: Executor) {
		const exclusions = await db
			.select()
			.from(excludedPlayers)
			.orderBy(excludedPlayers.instagramId);
		return {
			joueurs: await readPlayers(db),
			exclus: exclusions.map(({ instagramId }) => instagramId),
		};
	}

	/** Les identifiants des joueurs et des exclus. */
	async function idsOf(db: Executor) {
		const { joueurs, exclus } = await stateOf(db);
		return { joueurs: joueurs.map(({ instagramId }) => instagramId), exclus };
	}

	/**
	 * Le registre réel, sur une base neuve où `TARGET` et le témoin sont inscrits, l'identifiant
	 * dans l'état de `setup`, et sur le fournisseur `provider`.
	 */
	async function registryWithPlayers(
		setup: (db: Executor) => Promise<unknown> = nothing,
		provider?: FollowerProvider,
	) {
		const { db, client } = await connectToRegistry(provider);
		await writePage(db, LIST);
		await setup(db);
		return { db, client };
	}

	test.each<[string, (db: Executor) => Promise<unknown>, string, string]>([
		[
			"d'un joueur : la suppression de sa ligne et l'exclusion de son identifiant",
			nothing,
			TARGET,
			"Supprimera le joueur @pseudo_a_effacer (identifiant 10) : sa ligne entière, avec sa date d'arrivée, son sort et son modèle ; et exclura définitivement son identifiant de l'import, qui ne le recréera jamais. Sans annulation.",
		],
		[
			"d'un identifiant sans joueur : son exclusion seule",
			nothing,
			NON_PLAYER,
			"Aucun joueur d'identifiant 12 : exclura seulement cet identifiant, définitivement, de l'import, qui n'en créera jamais le joueur. Sans annulation.",
		],
		[
			"d'un identifiant déjà exclu : rien à faire",
			excludeOne,
			EXCLUDED,
			"L'identifiant 13 est déjà exclu, sans joueur : rien à faire.",
		],
	])(
		"sans code, le retrait %s : décrit, avec un code ; joueurs et exclus inchangés",
		async (_, setup, identifiant, description) => {
			const { db, client } = await registryWithPlayers(setup);
			const before = await stateOf(db);
			expect(confirmationOf(await remove(client, { identifiant }))).toEqual({
				description,
				code: expect.any(String),
				expiration: expect.any(String),
			});
			expect(await stateOf(db)).toEqual(before);
		},
	);

	test.each<[string, (client: Client) => Promise<string>]>([
		[
			"obtenu pour un autre identifiant",
			(client) => codeFor(client, "retirer_joueur", { identifiant: WITNESS }),
		],
		[
			"modifié",
			async (client) =>
				flipLowBit(
					await codeFor(client, "retirer_joueur", { identifiant: TARGET }),
					-43,
				),
		],
		[
			"de plus de 5 minutes",
			async (client) => {
				const issuedAt = Date.now();
				freezeDate(issuedAt);
				const code = await codeFor(client, "retirer_joueur", {
					identifiant: TARGET,
				});
				vi.setSystemTime(issuedAt + CODE_LIFETIME_MS + 1);
				return code;
			},
		],
	])("un code %s : refusé, rien ne change", async (_, refusedCode) => {
		const { db, client } = await registryWithPlayers();
		const before = await stateOf(db);
		const code = await refusedCode(client);
		const { description } = confirmationOf(
			await remove(client, { identifiant: TARGET, code }),
		);
		expect(description.startsWith(`${REFUSED_CODE} Supprimera`)).toBe(true);
		expect(await stateOf(db)).toEqual(before);
	});

	test.each<
		[
			string,
			(db: Executor) => Promise<unknown>,
			string,
			string,
			Awaited<ReturnType<typeof idsOf>>,
		]
	>([
		[
			"d'un joueur : sa ligne supprimée, son identifiant exclu",
			nothing,
			TARGET,
			"joueur_retire",
			{ joueurs: [WITNESS], exclus: [TARGET] },
		],
		[
			"d'un identifiant sans joueur : il est seulement exclu",
			nothing,
			NON_PLAYER,
			"identifiant_exclu",
			{ joueurs: [TARGET, WITNESS], exclus: [NON_PLAYER] },
		],
		[
			"d'un identifiant déjà exclu : rien à faire, sans erreur",
			excludeOne,
			EXCLUDED,
			"deja_exclu",
			{ joueurs: [TARGET, WITNESS], exclus: [EXCLUDED] },
		],
	])(
		"confirmé, le retrait %s",
		async (_, setup, identifiant, effet, expected) => {
			const { db, client } = await registryWithPlayers(setup);
			expect(outputOf(await confirmedRemoval(client, identifiant))).toEqual({
				resultat: { identifiant, effet },
			});
			expect(await idsOf(db)).toEqual(expected);
		},
	);

	test("une ligne d'audit par appel, sans code, au code refusé ou confirmé : aucune ne garde le pseudo, que seule la description rendue nomme", async () => {
		const { db, client } = await registryWithPlayers();
		const { description } = confirmationOf(
			await remove(client, { identifiant: TARGET }),
		);
		const refused = await codeFor(client, "retirer_joueur", {
			identifiant: WITNESS,
		});
		await remove(client, { identifiant: TARGET, code: refused });
		await confirmedRemoval(client, TARGET);
		expect(description).toContain(`@${PSEUDO}`);
		const rows = await auditOf(db, "retirer_joueur");
		expect(
			rows.map(({ input, succeeded, after }) => [input, succeeded, after]),
		).toEqual([
			[{ identifiant: TARGET }, true, null],
			[{ identifiant: WITNESS }, true, null],
			[{ identifiant: TARGET, code: refused }, true, null],
			[{ identifiant: TARGET }, true, null],
			[
				{ identifiant: TARGET, code: expect.any(String) },
				true,
				{ identifiant: TARGET, effet: "joueur_retire" },
			],
		]);
		expect(JSON.stringify(rows)).not.toContain(PSEUDO);
	});

	test("retiré puis toujours abonné : relancer_passe sur un fournisseur qui le liste encore ne le recrée pas", async () => {
		const { db, client } = await registryWithPlayers(
			nothing,
			new FakeFollowerProvider(LIST),
		);
		outputOf(await confirmedRemoval(client, TARGET));
		const pass = await client.callTool({
			name: "relancer_passe",
			arguments: { type: "rapide" },
		});
		expect(outputOf(pass)).toMatchObject({ etat: "terminee", ajouts: 0 });
		expect(await idsOf(db)).toEqual({ joueurs: [WITNESS], exclus: [TARGET] });
	});

	test.each<[string, Record<string, unknown>, string]>([
		[
			"un champ inconnu",
			{ identifiant: TARGET, pseudo: "a" },
			'Unrecognized key: "pseudo"',
		],
		["un identifiant à zéro de tête", { identifiant: "007" }, "Invalid string"],
	])(
		"%s : refusé, une ligne d'audit en erreur avec l'entrée reçue",
		async (_, args, message) => {
			await expectRefusal("retirer_joueur", args, message);
		},
	);
});
