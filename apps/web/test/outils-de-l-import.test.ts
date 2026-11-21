import { setTimeout as sleep } from "node:timers/promises";
import type { Client } from "@modelcontextprotocol/client";
import { type Executor, importPasses } from "donnees";
import { acquireImportLock, listPasses, runTick, writePage } from "joueurs";
import { FakeFollowerProvider, followers } from "joueurs/test/faux-fournisseur";
import { describe, expect, test } from "vitest";
import {
	auditRows,
	connectToRegistry,
	outputOf,
	publishedTools,
} from "./montage.ts";

const IMPORT_TOOLS = ["lister_passes", "relancer_passe"];
// Les champs d'une passe, dans l'ordre où les outils les rendent.
const PASS_FIELDS = [
	"type",
	"declencheur",
	"etat",
	"debut",
	"fin",
	"pages",
	"ajouts",
	"ecartes",
	"erreur",
];
const EARLIER = new Date("2026-11-21T08:00:00Z");
const HOUR_MS = 3_600_000;
// L'attente au-delà de laquelle un tic concurrent est tenu pour bloqué par la relance.
const BLOCKED_AFTER_MS = 1_000;

/** L'instant `hours` heures après `EARLIER`. */
function hoursLater(hours: number): Date {
	return new Date(EARLIER.getTime() + hours * HOUR_MS);
}

/** Les lignes d'audit de l'outil `tool`. */
async function auditOf(db: Executor, tool: string) {
	return (await auditRows(db)).filter((row) => row.tool === tool);
}

async function listing(client: Client, args: Record<string, unknown> = {}) {
	return client.callTool({ name: "lister_passes", arguments: args });
}

async function relaunch(client: Client, type: string) {
	return client.callTool({ name: "relancer_passe", arguments: { type } });
}

/** Le texte d'un résultat d'outil. */
function textOf(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
	return (result.content as { text?: string }[])[0]?.text;
}

describe("outils de l'import : tools/list", () => {
	test("publie lister_passes en lecture seule et relancer_passe, qui peut réécrire la ligne de sa complète et joint le fournisseur ; des schémas de sortie stricts, chaque champ d'entrée décrit", () => {
		const strict = expect.objectContaining({
			type: "object",
			additionalProperties: false,
		});
		expect(
			publishedTools(IMPORT_TOOLS).map(
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
				name: "lister_passes",
				title: "Lister les passes de l'import",
				annotations: {
					readOnlyHint: true,
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false,
				},
				fields: [["nombre", expect.stringMatching(/\S/)]],
				outputSchema: strict,
			},
			{
				name: "relancer_passe",
				title: "Relancer une passe de l'import",
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
					idempotentHint: false,
					openWorldHint: true,
				},
				fields: [["type", expect.stringMatching(/\S/)]],
				outputSchema: strict,
			},
		]);
	});

	test("lister_passes publie nombre, un entier facultatif de 1 à 100 ; relancer_passe, le type requis, rapide ou complete", () => {
		const [list, relaunchTool] = publishedTools(IMPORT_TOOLS);
		expect(list?.inputSchema).toMatchObject({
			properties: { nombre: { type: "integer", minimum: 1, maximum: 100 } },
		});
		expect(list?.inputSchema.required).toBeUndefined();
		expect(relaunchTool?.inputSchema).toMatchObject({
			required: ["type"],
			properties: { type: { enum: ["rapide", "complete"] } },
		});
	});
});

describe("lister_passes", () => {
	test("rend les passes, la plus récente d'abord, chacune champ par champ dans l'ordre et sous le vocabulaire des outils, sans curseur ni identifiant", async () => {
		const { db, client } = await connectToRegistry();
		await db.insert(importPasses).values([
			{
				kind: "quick",
				trigger: "tick",
				status: "done",
				startedAt: hoursLater(0),
				finishedAt: hoursLater(0.5),
				pages: 2,
				added: 10,
			},
			{
				kind: "full",
				trigger: "weekly",
				status: "done",
				startedAt: hoursLater(1),
				finishedAt: hoursLater(1.5),
				pages: 5,
				added: 1,
				invalidIds: 2,
				invalidUsernames: 1,
				cursor: "curseur-opaque-5",
			},
			{
				kind: "full",
				trigger: "self_check",
				status: "failed",
				startedAt: hoursLater(2),
				finishedAt: hoursLater(2.5),
				pages: 3,
				error: "panne du fournisseur",
				cursor: "curseur-opaque-4",
			},
			{
				kind: "quick",
				trigger: "mcp",
				status: "interrupted",
				startedAt: hoursLater(3),
				finishedAt: hoursLater(3.5),
			},
			{
				kind: "quick",
				trigger: "tick",
				status: "running",
				startedAt: hoursLater(4),
			},
		]);
		const result = await listing(client);
		const { passes } = outputOf(result) as { passes: object[] };
		expect(passes).toEqual([
			{
				type: "rapide",
				declencheur: "tic",
				etat: "en_cours",
				debut: "2026-11-21T12:00:00.000Z",
				fin: null,
				pages: 0,
				ajouts: 0,
				ecartes: { identifiant_invalide: 0, pseudo_invalide: 0 },
				erreur: null,
			},
			{
				type: "rapide",
				declencheur: "mcp",
				etat: "interrompue",
				debut: "2026-11-21T11:00:00.000Z",
				fin: "2026-11-21T11:30:00.000Z",
				pages: 0,
				ajouts: 0,
				ecartes: { identifiant_invalide: 0, pseudo_invalide: 0 },
				erreur: null,
			},
			{
				type: "complete",
				declencheur: "auto_controle",
				etat: "en_erreur",
				debut: "2026-11-21T10:00:00.000Z",
				fin: "2026-11-21T10:30:00.000Z",
				pages: 3,
				ajouts: 0,
				ecartes: { identifiant_invalide: 0, pseudo_invalide: 0 },
				erreur: "panne du fournisseur",
			},
			{
				type: "complete",
				declencheur: "hebdomadaire",
				etat: "terminee",
				debut: "2026-11-21T09:00:00.000Z",
				fin: "2026-11-21T09:30:00.000Z",
				pages: 5,
				ajouts: 1,
				ecartes: { identifiant_invalide: 2, pseudo_invalide: 1 },
				erreur: null,
			},
			{
				type: "rapide",
				declencheur: "tic",
				etat: "terminee",
				debut: "2026-11-21T08:00:00.000Z",
				fin: "2026-11-21T08:30:00.000Z",
				pages: 2,
				ajouts: 10,
				ecartes: { identifiant_invalide: 0, pseudo_invalide: 0 },
				erreur: null,
			},
		]);
		expect(passes.map((pass) => Object.keys(pass))).toEqual(
			passes.map(() => PASS_FIELDS),
		);
		expect(JSON.stringify(result)).not.toContain("curseur-opaque");
	});

	test("rend les 10 dernières par défaut, et jusqu'à nombre : 1 rend la dernière, 100 les rend toutes", async () => {
		const { db, client } = await connectToRegistry();
		await db.insert(importPasses).values(
			Array.from({ length: 12 }, (_, hour) => ({
				kind: "quick" as const,
				trigger: "tick" as const,
				status: "done" as const,
				startedAt: hoursLater(hour),
				finishedAt: hoursLater(hour),
			})),
		);
		const starts = async (args?: Record<string, unknown>) =>
			(
				outputOf(await listing(client, args)) as {
					passes: { debut: string }[];
				}
			).passes.map(({ debut }) => debut);
		const newestFirst = Array.from({ length: 12 }, (_, index) =>
			hoursLater(11 - index).toISOString(),
		);
		expect(await starts()).toEqual(newestFirst.slice(0, 10));
		expect(await starts({ nombre: 1 })).toEqual(newestFirst.slice(0, 1));
		expect(await starts({ nombre: 100 })).toEqual(newestFirst);
	});

	test.each<[string, Record<string, unknown>, string]>([
		["0 passe", { nombre: 0 }, ">=1"],
		["101 passes", { nombre: 101 }, "<=100"],
		["un nombre non entier", { nombre: 2.5 }, "expected int"],
		["un nombre en texte", { nombre: "10" }, "expected number"],
		[
			"un champ inconnu",
			{ nombre: 10, type: "rapide" },
			'Unrecognized key: "type"',
		],
	])(
		"%s : refusé, une ligne d'audit en erreur avec l'entrée reçue",
		async (_, args, message) => {
			const { db, client } = await connectToRegistry();
			const result = await listing(client, args);
			const rows = await auditOf(db, "lister_passes");
			expect(rows).toEqual([
				expect.objectContaining({ input: args, succeeded: false }),
			]);
			expect(rows[0]?.error).toContain(message);
			expect(result).toMatchObject({
				content: [{ type: "text", text: rows[0]?.error }],
				isError: true,
			});
		},
	);
});

describe("relancer_passe", () => {
	test("rapide : une passe rapide part sous le déclencheur mcp ; l'outil la rend close, telle que lister_passes la rend, et l'audit la garde", async () => {
		const { db, client } = await connectToRegistry(
			new FakeFollowerProvider(followers(3)),
		);
		const output = outputOf(await relaunch(client, "rapide"));
		expect(output).toMatchObject({
			type: "rapide",
			declencheur: "mcp",
			etat: "terminee",
			pages: 1,
			ajouts: 3,
			erreur: null,
		});
		expect(Object.keys(output as object)).toEqual(PASS_FIELDS);
		expect(outputOf(await listing(client))).toEqual({ passes: [output] });
		expect(await auditOf(db, "relancer_passe")).toEqual([
			expect.objectContaining({
				input: { type: "rapide" },
				succeeded: true,
				after: output,
			}),
		]);
	});

	test("complète : une complète interrompue après sa page 2 sur 5 reprend à la page 3, sur sa ligne du journal et sous son déclencheur d'origine", async () => {
		const list = followers(10);
		const provider = new FakeFollowerProvider(list, { pageSize: 2 });
		const { db, client } = await connectToRegistry(provider);
		await writePage(db, list.slice(0, 4));
		await db.insert(importPasses).values({
			kind: "full",
			trigger: "weekly",
			status: "interrupted",
			startedAt: EARLIER,
			finishedAt: EARLIER,
			pages: 2,
			added: 4,
			cursor: provider.cursorOf(3),
		});
		expect(outputOf(await relaunch(client, "complete"))).toMatchObject({
			type: "complete",
			declencheur: "hebdomadaire",
			etat: "terminee",
			debut: EARLIER.toISOString(),
			pages: 5,
			ajouts: 10,
		});
		expect(provider.cursors).toEqual(
			[3, 4, 5].map((page) => provider.cursorOf(page)),
		);
		expect(await db.$count(importPasses)).toBe(1);
	});

	test.each([["rapide"], ["complete"]])(
		"verrou pris : la relance %s répond « passe en cours » sans rien lire ni rien ajouter au journal ; sa ligne d'audit en erreur le dit",
		async (type) => {
			const provider = new FakeFollowerProvider(followers(3));
			const { db, client } = await connectToRegistry(provider);
			await acquireImportLock(db, new Date());
			const result = await relaunch(client, type);
			expect(result.isError).toBe(true);
			expect(textOf(result)).toMatch(/^Passe en cours/);
			expect(provider.cursors).toEqual([]);
			expect(await db.$count(importPasses)).toBe(0);
			expect(await auditOf(db, "relancer_passe")).toEqual([
				expect.objectContaining({
					input: { type },
					succeeded: false,
					error: textOf(result),
				}),
			]);
		},
	);

	test("hors de la transaction de l'enrobage : pendant qu'une relance lit sa page, sa passe se lit en cours au journal et un tic concurrent trouve le verrou pris sans attendre ; la ligne d'audit s'écrit après l'appel", async () => {
		const reading = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const held = new FakeFollowerProvider(followers(3), {
			onPageRead: () => {
				reading.resolve();
				return release.promise;
			},
		});
		const { db, client } = await connectToRegistry(held);
		const call = relaunch(client, "rapide");
		await reading.promise;
		try {
			const tick = runTick({
				db,
				provider: new FakeFollowerProvider(followers(3)),
			});
			expect(
				await Promise.race([tick, sleep(BLOCKED_AFTER_MS, "bloqué")]),
			).toBeNull();
			expect(await listPasses(db, 10)).toMatchObject([
				{ kind: "quick", trigger: "mcp", status: "running" },
			]);
			expect(await auditOf(db, "relancer_passe")).toEqual([]);
		} finally {
			release.resolve();
		}
		const output = outputOf(await call);
		expect(await auditOf(db, "relancer_passe")).toEqual([
			expect.objectContaining({ succeeded: true, after: output }),
		]);
	});

	test.each<[string, Record<string, unknown>, string]>([
		["un type inconnu", { type: "totale" }, "Invalid option"],
		["le type sous son nom du code", { type: "quick" }, "Invalid option"],
		["sans type", {}, "expected one of"],
		[
			"un champ inconnu",
			{ type: "rapide", nombre: 1 },
			'Unrecognized key: "nombre"',
		],
	])(
		"%s : refusé, une ligne d'audit en erreur avec l'entrée reçue, rien de lancé",
		async (_, args, message) => {
			const provider = new FakeFollowerProvider(followers(3));
			const { db, client } = await connectToRegistry(provider);
			const result = await client.callTool({
				name: "relancer_passe",
				arguments: args,
			});
			const rows = await auditOf(db, "relancer_passe");
			expect(rows).toEqual([
				expect.objectContaining({ input: args, succeeded: false }),
			]);
			expect(rows[0]?.error).toContain(message);
			expect(result).toMatchObject({
				content: [{ type: "text", text: rows[0]?.error }],
				isError: true,
			});
			expect(provider.cursors).toEqual([]);
			expect(await db.$count(importPasses)).toBe(0);
		},
	);
});
