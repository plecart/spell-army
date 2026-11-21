import type { CallToolResult, Client } from "@modelcontextprotocol/client";
import type { Executor } from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { z } from "zod";
import { confirmationKey } from "../app/mcp/confirmation.ts";
import { createMcpEndpoint } from "../app/mcp/server.ts";
import { callTool, listTools, type McpTool } from "../app/mcp/tool.ts";
import {
	auditRows,
	connectClient,
	outputOf,
	registry,
	type Serve,
	TOKEN,
} from "./montage.ts";

// La durée de validité d'un code, 5 minutes (issue #14), et l'instant où les tests qui la mesurent
// arrêtent l'horloge de `Date`.
const LIFETIME_MS = 5 * 60_000;
const NOW = Date.UTC(2026, 10, 21, 10);

// Un autre jeton admis, de 32 octets comme `TOKEN`.
const OTHER_TOKEN = "u".repeat(32);

// Un code : `<expiration en ms depuis l'époque>.<HMAC-SHA256 en base64url>`.
const CODE = /^([0-9]+)\.([A-Za-z0-9_-]{43})$/;
const BASE64URL =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const REFUSED =
	"Code refusé (périmé, modifié ou obtenu pour d'autres paramètres) : rien n'a été fait.";
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

interface Confirmation {
	description: string;
	code: string;
	expiration: string;
}

/** La confirmation que rend un appel sans exécution. */
function confirmationOf(result: CallToolResult): Confirmation {
	return (outputOf(result) as { confirmation: Confirmation }).confirmation;
}

/** Le code que rend l'appel sans code de `name` avec `args`. */
async function codeFor(client: Client, name: string, args: object = ARGS) {
	return confirmationOf(await client.callTool({ name, arguments: { ...args } }))
		.code;
}

/** Appelle `effacer` avec `ARGS` et `code`. */
function erase(client: Client, code: string) {
	return client.callTool({ name: "effacer", arguments: { ...ARGS, code } });
}

/**
 * `code`, le caractère d'index `index` — négatif, depuis la fin — remplacé par son voisin de
 * base64url, qui n'en diffère que par le bit de poids faible.
 */
function flipLowBit(code: string, index: number): string {
	const at = index < 0 ? code.length + index : index;
	const digit = BASE64URL.indexOf(code.charAt(at));
	return code.slice(0, at) + BASE64URL.charAt(digit ^ 1) + code.slice(at + 1);
}

/** Arrête l'horloge de `Date` seule à `at` : `pg` et testcontainers gardent les vraies minuteries. */
function freezeDate(at: number) {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(at);
	onTestFinished(() => {
		vi.useRealTimers();
	});
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
				expiration: new Date(NOW + LIFETIME_MS).toISOString(),
			},
		});
		const { code } = (output as { confirmation: Confirmation }).confirmation;
		expect(CODE.exec(code)?.[1]).toBe(String(NOW + LIFETIME_MS));
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
		const code = await codeFor(client, "effacer");
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
			({ client }) => codeFor(client, "raser"),
		],
		[
			"au premier caractère de l'HMAC changé",
			async ({ client }) => flipLowBit(await codeFor(client, "effacer"), -43),
		],
		[
			// Ses deux bits de poids faible ne portent rien : il se décode en les mêmes 32 octets
			// (Node 24.3, mesuré le 2026-11-21).
			"au dernier caractère de l'HMAC changé pour un voisin qui se décode en les mêmes octets",
			async ({ client }) => flipLowBit(await codeFor(client, "effacer"), -1),
		],
		[
			"à l'expiration repoussée d'une milliseconde",
			async ({ client }) => {
				const [expiration, mac] = (await codeFor(client, "effacer")).split(".");
				return `${Number(expiration) + 1}.${mac}`;
			},
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
				),
		],
	])(
		"un code %s : refusé, rien n'est exécuté ; la sortie dit le refus avant la description, avec un code neuf ; une ligne d'audit en succès, sans avant ni après",
		async (_, refusedCode) => {
			const { db, tools, client, serve } = await confirmableEndpoint();
			const code = await refusedCode({ client, serve });
			expect(confirmationOf(await erase(client, code))).toEqual({
				description: `${REFUSED} ${DESCRIPTION}`,
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
					description: `${REFUSED} ${DESCRIPTION}`,
				}),
			},
		],
	])("%s", async (_, lateMs, runs, output) => {
		freezeDate(NOW);
		const { tools, client } = await confirmableEndpoint();
		const code = await codeFor(client, "effacer");
		vi.setSystemTime(NOW + LIFETIME_MS + lateMs);
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
		const code = await codeFor(client, "effacer");
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
