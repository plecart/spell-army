import type { Client } from "@modelcontextprotocol/client";
import type { Executor } from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { confirmationKey } from "../app/mcp/confirmation.ts";
import { createMcpEndpoint } from "../app/mcp/server.ts";
import { callTool, listTools, type McpTool } from "../app/mcp/tool.ts";
import {
	auditRows,
	CODE_LIFETIME_MS,
	type Confirmation,
	codeFor,
	confirmationOf,
	connectClient,
	flipLowBit,
	freezeDate,
	outputOf,
	REFUSED_CODE,
	registry,
	type Serve,
	TOKEN,
} from "./montage.ts";

// L'instant où les tests qui mesurent la durée d'un code arrêtent l'horloge de `Date`.
const NOW = Date.UTC(2026, 10, 21, 10);

// Un autre jeton admis, de 32 octets comme `TOKEN`.
const OTHER_TOKEN = "u".repeat(32);

// Un code : `<expiration en ms depuis l'époque>.<HMAC-SHA256 en base64url>`.
const CODE = /^([0-9]+)\.([A-Za-z0-9_-]{43})$/;

const NO_KEY =
	"Confirmation impossible : aucune clé de confirmation, rien n'a été fait.";
const NOTICE =
	"Outil destructeur : un premier appel sans code ne change rien, et rend la description de ce que fera l'appel et un code valable 5 minutes. Montre cette description au mainteneur, et ne renvoie le code, avec les mêmes paramètres, qu'avec son accord explicite.";

// L'entrée des outils d'essai. `options` est un enregistrement : Zod le rend avec ses clés dans
// l'ordre reçu, quand il rend un objet strict dans l'ordre de sa forme (4.6.7, mesuré le
// 2026-11-21) ; c'est là qu'un autre ordre des clés atteint le code.
const erasure = z.strictObject({
	cible: z.string().max(10),
	options: z.record(z.string().max(10), z.int()),
});

const ARGS = { cible: "c", options: { a: 1, b: 2 } };
const DESCRIPTION = "Effacera c.";

/** Un outil d'essai confirmable, de nom `name` : sa `confirmation` et son `run` sont observés. */
function confirmableTool(name: string) {
	return {
		name,
		title: "Outil d'essai confirmable",
		description: "Efface une cible.",
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: false,
		},
		input: erasure,
		output: z.strictObject({ effacee: z.string() }),
		confirmation: vi.fn(
			async (_executor: Executor, { cible }: z.output<typeof erasure>) =>
				`Effacera ${cible}.`,
		),
		run: vi.fn(
			async (_executor: Executor, { cible }: z.output<typeof erasure>) => ({
				output: { effacee: cible },
				before: { cible },
				after: { effacee: cible },
			}),
		),
	} satisfies McpTool<typeof erasure>;
}

/**
 * Les outils d'essai confirmables `effacer` et `raser` sur une base migrée neuve, et un client
 * branché sous `TOKEN`, qui a listé les outils. `serve` rend le point d'entrée des mêmes outils sur
 * la même base sous un autre jeton.
 */
async function confirmableEndpoint() {
	const db = await freshDatabase();
	const tools = {
		erase: confirmableTool("effacer"),
		raze: confirmableTool("raser"),
	};
	const serve = (token: string) =>
		createMcpEndpoint({
			token: () => token,
			database: () => db,
			tools: Object.values(tools),
		});
	const client = await connectClient(serve(TOKEN));
	await client.listTools();
	return { db, tools, client, serve };
}

/** Appelle `effacer` avec `ARGS` et `code`. */
function erase(client: Client, code: string) {
	return client.callTool({ name: "effacer", arguments: { ...ARGS, code } });
}

describe("confirmation par code d'un outil destructeur", () => {
	test("sans code : rien n'est exécuté ; la sortie rend la description, un code et son expiration, 5 minutes plus tard ; une ligne d'audit en succès, sans avant ni après", async () => {
		freezeDate(NOW);
		const { db, tools, client } = await confirmableEndpoint();
		const output = outputOf(
			await client.callTool({ name: "effacer", arguments: ARGS }),
		);
		expect(output).toEqual({
			confirmation: {
				description: DESCRIPTION,
				code: expect.stringMatching(CODE),
				expiration: new Date(NOW + CODE_LIFETIME_MS).toISOString(),
			},
		});
		const { code } = (output as { confirmation: Confirmation }).confirmation;
		expect(CODE.exec(code)?.[1]).toBe(String(NOW + CODE_LIFETIME_MS));
		expect(tools.erase.run).not.toHaveBeenCalled();
		expect(await auditRows(db)).toEqual([
			expect.objectContaining({
				tool: "effacer",
				input: ARGS,
				succeeded: true,
				error: null,
				before: null,
				after: null,
			}),
		]);
	});

	test("avec le code rendu, mêmes paramètres : exécuté une fois, sans le code ; la sortie rend son résultat, l'audit son avant et son après", async () => {
		const { db, tools, client } = await confirmableEndpoint();
		const code = await codeFor(client, "effacer", ARGS);
		expect(outputOf(await erase(client, code))).toEqual({
			resultat: { effacee: "c" },
		});
		expect(tools.erase.run).toHaveBeenCalledExactlyOnceWith(
			expect.anything(),
			ARGS,
		);
		expect((await auditRows(db)).at(-1)).toMatchObject({
			tool: "effacer",
			input: { ...ARGS, code },
			succeeded: true,
			before: { cible: "c" },
			after: { effacee: "c" },
		});
	});

	// Chaque code refusé, et de quoi l'obtenir : le client sous `TOKEN` et le point d'entrée sous un
	// autre jeton.
	test.each<
		[
			string,
			(context: {
				client: Client;
				serve: (token: string) => Serve;
			}) => Promise<string>,
		]
	>([
		[
			"obtenu pour d'autres paramètres",
			({ client }) => codeFor(client, "effacer", { ...ARGS, cible: "d" }),
		],
		[
			"obtenu pour un autre outil confirmable, aux mêmes paramètres",
			({ client }) => codeFor(client, "raser", ARGS),
		],
		[
			"au premier caractère de l'HMAC changé",
			async ({ client }) =>
				flipLowBit(await codeFor(client, "effacer", ARGS), -43),
		],
		[
			// Ses deux bits de poids faible ne portent rien : il se décode en les mêmes 32 octets
			// (Node 24.3, mesuré le 2026-11-21).
			"au dernier caractère de l'HMAC changé pour un voisin qui se décode en les mêmes octets",
			async ({ client }) =>
				flipLowBit(await codeFor(client, "effacer", ARGS), -1),
		],
		[
			"à l'expiration repoussée d'une milliseconde",
			async ({ client }) => {
				const [expiration, mac] = (
					await codeFor(client, "effacer", ARGS)
				).split(".");
				return `${Number(expiration) + 1}.${mac}`;
			},
		],
		[
			// `Number` lit la même expiration : le message signé serait le même.
			"à l'expiration écrite avec un zéro de tête",
			async ({ client }) => `0${await codeFor(client, "effacer", ARGS)}`,
		],
		["mal formé", async () => "abc"],
		[
			"émis sous un autre jeton",
			async ({ serve }) =>
				codeFor(
					await connectClient(serve(OTHER_TOKEN), {
						authorization: `Bearer ${OTHER_TOKEN}`,
					}),
					"effacer",
					ARGS,
				),
		],
	])(
		"un code %s : refusé, rien n'est exécuté ; la sortie dit le refus avant la description, avec un code neuf ; une ligne d'audit en succès, sans avant ni après",
		async (_, refusedCode) => {
			const { db, tools, client, serve } = await confirmableEndpoint();
			const code = await refusedCode({ client, serve });
			expect(confirmationOf(await erase(client, code))).toEqual({
				description: `${REFUSED_CODE} ${DESCRIPTION}`,
				code: expect.stringMatching(CODE),
				expiration: expect.any(String),
			});
			expect(tools.erase.run).not.toHaveBeenCalled();
			expect((await auditRows(db)).at(-1)).toMatchObject({
				tool: "effacer",
				input: { ...ARGS, code },
				succeeded: true,
				before: null,
				after: null,
			});
		},
	);

	test.each<[string, number, number, object]>([
		[
			"à son expiration exacte, le code exécute",
			0,
			1,
			{ resultat: { effacee: "c" } },
		],
		[
			"une milliseconde après, il est refusé",
			1,
			0,
			{
				confirmation: expect.objectContaining({
					description: `${REFUSED_CODE} ${DESCRIPTION}`,
				}),
			},
		],
	])("%s", async (_, lateMs, runs, output) => {
		freezeDate(NOW);
		const { tools, client } = await confirmableEndpoint();
		const code = await codeFor(client, "effacer", ARGS);
		vi.setSystemTime(NOW + CODE_LIFETIME_MS + lateMs);
		expect(outputOf(await erase(client, code))).toEqual(output);
		expect(tools.erase.run).toHaveBeenCalledTimes(runs);
	});

	test("les mêmes paramètres, aux clés dans un autre ordre jusque dans l'objet imbriqué : le code exécute", async () => {
		const { tools, client } = await confirmableEndpoint();
		const code = await codeFor(client, "effacer", {
			cible: "c",
			options: { a: 1, b: 2 },
		});
		const result = await client.callTool({
			name: "effacer",
			arguments: { code, options: { b: 2, a: 1 }, cible: "c" },
		});
		expect(outputOf(result)).toEqual({ resultat: { effacee: "c" } });
		expect(tools.erase.run).toHaveBeenCalledOnce();
	});

	test("limite assumée, rien n'étant stocké : un code rejoué avant son expiration exécute de nouveau l'appel", async () => {
		const { tools, client } = await confirmableEndpoint();
		const code = await codeFor(client, "effacer", ARGS);
		for (const _ of [1, 2]) {
			expect(outputOf(await erase(client, code))).toEqual({
				resultat: { effacee: "c" },
			});
		}
		expect(tools.erase.run).toHaveBeenCalledTimes(2);
	});

	test.each<[string, boolean]>([
		["sans code", false],
		["avec un code valide sous la clé du jeton", true],
	])(
		"callTool sans clé, %s : refusé, une ligne d'audit en erreur, ni la description ni l'outil appelés",
		async (_, withCode) => {
			const db = await freshDatabase();
			const tool = confirmableTool("effacer");
			const issued = await callTool(
				[tool],
				db,
				"effacer",
				ARGS,
				confirmationKey(TOKEN),
			);
			const { code } = (
				issued.structuredContent as { confirmation: Confirmation }
			).confirmation;
			const args = withCode ? { ...ARGS, code } : ARGS;
			tool.confirmation.mockClear();
			expect(await callTool([tool], db, "effacer", args)).toEqual({
				content: [{ type: "text", text: NO_KEY }],
				isError: true,
			});
			expect(tool.confirmation).not.toHaveBeenCalled();
			expect(tool.run).not.toHaveBeenCalled();
			expect((await auditRows(db)).at(-1)).toMatchObject({
				tool: "effacer",
				input: args,
				succeeded: false,
				error: NO_KEY,
			});
		},
	);
});

describe("confirmation : tools/list", () => {
	test("l'outil confirmable publie la phrase commune après sa description, un code facultatif en entrée et, en sortie, l'enveloppe à une clé exactement", async () => {
		const { client } = await confirmableEndpoint();
		const { tools } = await client.listTools();
		expect(tools.find(({ name }) => name === "effacer")).toMatchObject({
			description: `Efface une cible. ${NOTICE}`,
			inputSchema: {
				type: "object",
				properties: {
					code: {
						type: "string",
						maxLength: expect.any(Number),
						description:
							"Le code rendu par l'appel sans code, pour ces mêmes paramètres.",
					},
				},
				required: ["cible", "options"],
				additionalProperties: false,
			},
			outputSchema: {
				type: "object",
				properties: {
					confirmation: {
						type: "object",
						properties: {
							description: { type: "string" },
							code: { type: "string" },
							expiration: { type: "string", format: "date-time" },
						},
						required: ["description", "code", "expiration"],
						additionalProperties: false,
					},
					resultat: {
						type: "object",
						properties: { effacee: { type: "string" } },
						required: ["effacee"],
						additionalProperties: false,
					},
				},
				additionalProperties: false,
				minProperties: 1,
				maxProperties: 1,
			},
		});
	});

	test("les outils non confirmables du registre se publient tels que déclarés, sans code", () => {
		const plain = registry.filter((tool) => tool.confirmation === undefined);
		expect(plain).not.toHaveLength(0);
		expect(listTools(plain)).toEqual(
			plain.map(({ name, title, description, annotations, input, output }) => ({
				name,
				title,
				description,
				annotations,
				inputSchema: z.toJSONSchema(input),
				outputSchema: z.toJSONSchema(output),
			})),
		);
	});
});
