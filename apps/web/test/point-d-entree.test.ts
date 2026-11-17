import {
	Client,
	type ClientOptions,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
	ProtocolErrorCode,
	Server,
	type ServerContext,
} from "@modelcontextprotocol/server";
import {
	auditLog,
	createClient,
	type Executor,
	readCalibrationSettings,
	updateCalibrationSettings,
} from "donnees";
import { createMigratedDatabase } from "donnees/test/base-de-test";
import { describe, expect, inject, onTestFinished, test, vi } from "vitest";
import { z } from "zod";
import { createMcpEndpoint } from "../app/mcp/server.ts";
import type { McpTool } from "../app/mcp/tool.ts";

// Jeton factice de 32 octets, le minimum admis.
const TOKEN = "t".repeat(32);
const AUTHORIZATION = `Bearer ${TOKEN}`;
const ENDPOINT_URL = "http://wizard-army.test/api/mcp";
// Posé par la migration `0002_reglages_de_depart`.
const STARTING_RECRUIT_SHARE = 0.7;
// Le client de Claude Code négocie la spécification 2026-07-28 (ADR 0005, « Conséquences »).
const NEGOTIATING: ClientOptions = { versionNegotiation: { mode: "auto" } };

const shareInput = z.strictObject({ part: z.number().min(0).max(1) });
const noInput = z.strictObject({});

/** Outils d'essai, neufs à chaque test : `run` de `regler_part` est observé. */
function trialTools() {
	return {
		setShare: {
			name: "regler_part",
			description: "Règle la part des recrues.",
			input: shareInput,
			run: vi.fn(
				async (executor: Executor, { part }: z.output<typeof shareInput>) => {
					const { before, after } = await updateCalibrationSettings(executor, {
						recruitShare: part,
					});
					return { output: after, before, after };
				},
			),
		},
		readShare: {
			name: "lire_part",
			description: "Lit la part des recrues.",
			input: noInput,
			run: async (executor: Executor) => ({
				output: {
					part: (await readCalibrationSettings(executor)).recruitShare,
				},
			}),
		},
		writeThenThrow: {
			name: "ecrire_puis_lever",
			description: "Écrit, puis lève.",
			input: noInput,
			run: async (executor: Executor) => {
				await updateCalibrationSettings(executor, { recruitShare: 0.5 });
				throw new Error("échec après écriture");
			},
		},
		refusedByDatabase: {
			name: "refuse_par_la_base",
			description: "Écrit une part hors bornes, que la base refuse.",
			input: noInput,
			run: async (executor: Executor) => ({
				output: await updateCalibrationSettings(executor, { recruitShare: 2 }),
			}),
		},
		throwWithoutMessage: {
			name: "lever_sans_message",
			description: "Lève une erreur au message vide.",
			input: noInput,
			run: async () => {
				throw new Error("");
			},
		},
		unauditableResult: {
			name: "resultat_inauditable",
			description: "Écrit, puis rend un après que `jsonb` refuse (U+0000).",
			input: noInput,
			run: async (executor: Executor) => {
				await updateCalibrationSettings(executor, { recruitShare: 0.5 });
				return { output: {}, after: { text: String.fromCharCode(0) } };
			},
		},
	} satisfies Record<string, McpTool>;
}

/**
 * Point d'entrée sur une base migrée neuve ; chaque demande de la base, chaque requête et sa
 * réponse sont relevées.
 */
async function freshEndpoint(token: () => string | undefined = () => TOKEN) {
	const db = createClient(
		await createMigratedDatabase(inject("testDatabaseUrl")),
	);
	onTestFinished(() => db.$client.end());
	const tools = trialTools();
	const database = vi.fn(() => db);
	const endpoint = createMcpEndpoint({
		token,
		database,
		tools: Object.values(tools),
	});
	const requestBodies: string[] = [];
	const responses: Response[] = [];
	const serve = async (request: Request) => {
		requestBodies.push(await request.clone().text());
		const response = await endpoint(request);
		responses.push(response);
		return response;
	};
	return { db, database, tools, serve, requestBodies, responses };
}

type Serve = (request: Request) => Promise<Response>;

/** Le `Client` officiel, branché sur `serve` par l'option `fetch` de son transport. */
async function connectClient(
	serve: Serve,
	headers: Record<string, string> = { authorization: AUTHORIZATION },
	options: ClientOptions = NEGOTIATING,
) {
	const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT_URL), {
		fetch: (url, init) => serve(new Request(url, init)),
		requestInit: { headers },
	});
	const client = new Client(
		{ name: "client-de-test", version: "0.0.0" },
		options,
	);
	onTestFinished(() => client.close());
	await client.connect(transport);
	return client;
}

function auditRows(db: Executor) {
	return db.select().from(auditLog);
}

/**
 * Simule un gestionnaire qui émet un message avant son résultat, première voie vers le SSE
 * (ADR 0005, « Sans SSE ») : aucun outil n'a encore de quoi émettre.
 */
function emitBeforeEachResult() {
	type Handler = (request: unknown, ctx: ServerContext) => Promise<unknown>;
	const setRequestHandler = Server.prototype.setRequestHandler;
	vi.spyOn(Server.prototype, "setRequestHandler").mockImplementation(function (
		this: Server,
		method: string,
		handler: Handler,
	) {
		const emitting: Handler = async (request, ctx) => {
			await ctx.mcpReq.notify({
				method: "notifications/progress",
				params: { progressToken: "essai", progress: 1 },
			});
			return handler(request, ctx);
		};
		return Reflect.apply(setRequestHandler, this, [method, emitting]);
	} as never);
}

describe("point d'entrée du serveur MCP", () => {
	test.each<[string, Record<string, string>, string | undefined]>([
		["sans jeton", {}, TOKEN],
		[
			"mauvais jeton de même longueur",
			{ authorization: `Bearer ${"u".repeat(32)}` },
			TOKEN,
		],
		[
			"mauvais jeton d'une autre longueur",
			{ authorization: `Bearer ${"u".repeat(100)}` },
			TOKEN,
		],
		["jeton configuré absent", { authorization: AUTHORIZATION }, undefined],
		["jeton configuré vide", { authorization: "Bearer " }, ""],
		[
			"jeton configuré trop court",
			{ authorization: `Bearer ${"t".repeat(31)}` },
			"t".repeat(31),
		],
	])(
		"401, %s : l'outil n'est pas exécuté, rien n'est écrit",
		async (_, headers, configuredToken) => {
			const { db, database, tools, serve, responses } = await freshEndpoint(
				() => configuredToken,
			);
			const callTool = async () => {
				const client = await connectClient(serve, headers);
				await client.callTool({
					name: "regler_part",
					arguments: { part: 0.5 },
				});
			};
			await expect(callTool()).rejects.toThrow();
			const challenges = responses.map((response) => [
				response.status,
				response.headers.get("www-authenticate"),
			]);
			expect(challenges).not.toHaveLength(0);
			expect(challenges).toEqual(challenges.map(() => [401, "Bearer"]));
			expect(database).not.toHaveBeenCalled();
			expect(tools.setShare.run).not.toHaveBeenCalled();
			expect(await auditRows(db)).toEqual([]);
		},
	);

	test("la liste publie l'outil d'essai avec son schéma strict", async () => {
		const client = await connectClient((await freshEndpoint()).serve);
		const { tools } = await client.listTools();
		expect(tools.find((tool) => tool.name === "regler_part")).toEqual({
			name: "regler_part",
			description: "Règle la part des recrues.",
			inputSchema: {
				$schema: "https://json-schema.org/draft/2020-12/schema",
				type: "object",
				properties: { part: { type: "number", minimum: 0, maximum: 1 } },
				required: ["part"],
				additionalProperties: false,
			},
		});
	});

	test("un appel valide écrit une ligne d'audit en succès, avec l'entrée, la date, l'avant et l'après", async () => {
		const { db, serve } = await freshEndpoint();
		const client = await connectClient(serve);
		const result = await client.callTool({
			name: "regler_part",
			arguments: { part: 0.5 },
		});
		const after = await readCalibrationSettings(db);
		expect(after.recruitShare).toBe(0.5);
		expect(result).toMatchObject({
			content: [{ type: "text", text: JSON.stringify(after) }],
		});
		expect(result.isError).toBeFalsy();
		expect(await auditRows(db)).toEqual([
			{
				id: expect.any(Number),
				at: expect.any(Date),
				tool: "regler_part",
				input: { part: 0.5 },
				succeeded: true,
				error: null,
				before: { ...after, recruitShare: STARTING_RECRUIT_SHARE },
				after,
			},
		]);
	});

	test("un appel sans arguments est audité avec l'entrée {}", async () => {
		const { db, serve, requestBodies } = await freshEndpoint();
		const client = await connectClient(serve);
		const result = await client.callTool({ name: "lire_part" });
		const call = requestBodies
			.map((body) => JSON.parse(body))
			.find(({ method }) => method === "tools/call");
		expect(call.params).not.toHaveProperty("arguments");
		expect(result).toMatchObject({
			content: [{ type: "text", text: `{"part":${STARTING_RECRUIT_SHARE}}` }],
		});
		expect(await auditRows(db)).toEqual([
			expect.objectContaining({
				tool: "lire_part",
				input: {},
				succeeded: true,
				error: null,
				before: null,
				after: null,
			}),
		]);
	});

	test.each<[string, Record<string, unknown>, string]>([
		[
			"un champ inconnu",
			{ part: 0.5, inconnu: 1 },
			'Unrecognized key: "inconnu"',
		],
		["un type faux", { part: "0.5" }, "expected number, received string"],
		["une valeur hors bornes", { part: 2 }, "expected number to be <=1"],
		["un champ requis absent", {}, "expected number, received undefined"],
	])(
		"entrée invalide, %s : refusée et auditée en erreur, l'outil jamais appelé",
		async (_, args, message) => {
			const { db, tools, serve } = await freshEndpoint();
			const client = await connectClient(serve);
			const result = await client.callTool({
				name: "regler_part",
				arguments: args,
			});
			const rows = await auditRows(db);
			expect(rows).toEqual([
				expect.objectContaining({
					tool: "regler_part",
					input: args,
					succeeded: false,
				}),
			]);
			expect(rows[0]?.error).toContain(message);
			expect(result).toMatchObject({
				content: [{ type: "text", text: rows[0]?.error }],
				isError: true,
			});
			expect(tools.setShare.run).not.toHaveBeenCalled();
			expect((await readCalibrationSettings(db)).recruitShare).toBe(
				STARTING_RECRUIT_SHARE,
			);
		},
	);

	test("un outil inconnu rend une erreur de protocole et une ligne d'audit en erreur", async () => {
		const { db, serve } = await freshEndpoint();
		const client = await connectClient(serve);
		await expect(
			client.callTool({ name: "inconnu", arguments: { x: 1 } }),
		).rejects.toMatchObject({
			code: ProtocolErrorCode.InvalidParams,
			message: expect.stringContaining("Tool inconnu not found"),
		});
		expect(await auditRows(db)).toEqual([
			expect.objectContaining({
				tool: "inconnu",
				input: { x: 1 },
				succeeded: false,
				error: "Tool inconnu not found",
			}),
		]);
	});

	test.each<[string, string, RegExp]>([
		[
			"un outil qui écrit puis lève",
			"ecrire_puis_lever",
			/^échec après écriture$/,
		],
		[
			"un outil que la base refuse",
			"refuse_par_la_base",
			/^new row for relation "calibration_settings" violates check constraint "calibration_settings_recruit_share_check"$/,
		],
		["une erreur au message vide", "lever_sans_message", /^.+$/],
		[
			"un résultat que l'audit en succès ne peut pas écrire",
			"resultat_inauditable",
			/^unsupported Unicode escape sequence$/,
		],
	])(
		"%s : son écriture est annulée, une ligne d'audit en erreur porte le message",
		async (_, name, message) => {
			const { db, serve } = await freshEndpoint();
			const client = await connectClient(serve);
			const result = await client.callTool({ name });
			const rows = await auditRows(db);
			expect(rows).toEqual([
				expect.objectContaining({ tool: name, input: {}, succeeded: false }),
			]);
			expect(rows[0]?.error).toMatch(message);
			expect(result).toMatchObject({
				content: [{ type: "text", text: rows[0]?.error }],
				isError: true,
			});
			expect((await readCalibrationSettings(db)).recruitShare).toBe(
				STARTING_RECRUIT_SHARE,
			);
		},
	);

	// Les quatre voies vers le SSE de l'ADR 0005, « Sans SSE », et un échange nominal.
	test.each<[string, (serve: Serve) => Promise<unknown>]>([
		[
			"un échange nominal",
			async (serve) => {
				const client = await connectClient(serve);
				await client.listTools();
				await client.callTool({ name: "lire_part" });
			},
		],
		[
			"un échange qui émet un message avant son résultat",
			async (serve) => {
				emitBeforeEachResult();
				const client = await connectClient(serve);
				await client.callTool({ name: "lire_part" });
			},
		],
		[
			"le repli sans état de 2025",
			(serve) =>
				expect(
					connectClient(serve, { authorization: AUTHORIZATION }, {}),
				).rejects.toThrow("Unsupported protocol version"),
		],
		[
			"un flux subscriptions/listen",
			async (serve) => {
				const client = await connectClient(serve);
				await expect(client.listen({ toolsListChanged: true })).rejects.toThrow(
					"Subscription limit reached",
				);
			},
		],
		[
			"un GET",
			(serve) =>
				serve(
					new Request(ENDPOINT_URL, {
						headers: { authorization: AUTHORIZATION },
					}),
				),
		],
		[
			"un DELETE",
			(serve) =>
				serve(
					new Request(ENDPOINT_URL, {
						method: "DELETE",
						headers: { authorization: AUTHORIZATION },
					}),
				),
		],
	])(
		"sans SSE, %s : aucune réponse en text/event-stream",
		async (_, exchange) => {
			const { serve, responses } = await freshEndpoint();
			await exchange(serve);
			const contentTypes = responses.map((response) =>
				response.headers.get("content-type"),
			);
			expect(contentTypes).not.toHaveLength(0);
			expect(
				contentTypes.filter((type) => type?.includes("text/event-stream")),
			).toEqual([]);
		},
	);
});
