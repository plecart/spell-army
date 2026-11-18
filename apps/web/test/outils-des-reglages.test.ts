import type { CallToolResult, Client } from "@modelcontextprotocol/client";
import { describe, expect, test } from "vitest";
import { registry } from "../app/mcp/registry.ts";
import { createMcpEndpoint } from "../app/mcp/server.ts";
import { listTools } from "../app/mcp/tool.ts";
import {
	auditRows,
	connectClient,
	freshDatabase,
	rewritingBodies,
	TOKEN,
} from "./montage.ts";

// Posés par la migration `0002_reglages_de_depart` (game design § 6, issue #11).
const STARTING_SETTINGS = {
	p: 0.7,
	baisse_p: 0.1,
	fenetre_jours: 3,
	recrue_moyenne_vie: 7.6,
	recrue_moyenne_force: 7.6,
	recrue_moyenne_magie: 7.5,
	recrue_moyenne_vitesse: 7.3,
	budget_jour_2: 10,
};

// La plus grande valeur d'une colonne `integer` de Postgres.
const POSTGRES_INTEGER_MAX = 2_147_483_647;

// `JSON.stringify` écrit un nombre infini `null` : le corps brut porte `1e999` à la place de cette
// chaîne, que `JSON.parse` lit `Infinity`.
const INFINITE = "__infini__";

/** Le client officiel, branché sur le point d'entrée du registre réel et une base migrée neuve. */
async function connectToRegistry() {
	const db = await freshDatabase();
	const endpoint = createMcpEndpoint({
		token: () => TOKEN,
		database: () => db,
		tools: registry,
	});
	const client = await connectClient(
		rewritingBodies(endpoint, (body) =>
			body.replaceAll(`"${INFINITE}"`, "1e999"),
		),
	);
	return { db, client };
}

/** La sortie d'un appel réussi, lue dans son texte JSON. */
function outputOf({ content, isError }: CallToolResult): unknown {
	const [block] = content;
	if (isError || block?.type !== "text") {
		throw new Error(`Appel en échec : ${JSON.stringify(content)}`);
	}
	return JSON.parse(block.text);
}

async function readSettings(client: Client) {
	return outputOf(await client.callTool({ name: "lire_reglages" }));
}

describe("outils des réglages du calibrage", () => {
	test("tools/list publie chaque outil et chaque réglage sous son nom français, avec une description", () => {
		const described = listTools(registry).flatMap(
			({ name, description, inputSchema }) => [
				[name, description],
				...Object.entries(inputSchema.properties ?? {}).map(
					([property, schema]) => [
						`${name}.${property}`,
						(schema as { description?: string }).description,
					],
				),
			],
		);
		const nonBlank = expect.stringMatching(/\S/);
		expect(described).toEqual([
			["lire_reglages", nonBlank],
			["modifier_reglages", nonBlank],
			...Object.keys(STARTING_SETTINGS).map((setting) => [
				`modifier_reglages.${setting}`,
				nonBlank,
			]),
		]);
	});

	test("tools/list publie qu'au moins un réglage est requis par modifier_reglages", () => {
		const update = listTools(registry).find(
			({ name }) => name === "modifier_reglages",
		);
		expect(update?.inputSchema).toMatchObject({ minProperties: 1 });
	});

	test("lire_reglages rend les valeurs de départ d'une base migrée neuve", async () => {
		const { client } = await connectToRegistry();
		expect(await readSettings(client)).toEqual(STARTING_SETTINGS);
	});

	test.each<[string, number]>([
		["p", 0.6],
		["baisse_p", 0.2],
	])(
		"modifier_reglages avec %s = %s : lire_reglages le rend, les autres réglages inchangés, l'audit garde l'avant et l'après",
		async (name, value) => {
			const { db, client } = await connectToRegistry();
			const changed = { ...STARTING_SETTINGS, [name]: value };
			const result = await client.callTool({
				name: "modifier_reglages",
				arguments: { [name]: value },
			});
			expect(outputOf(result)).toEqual(changed);
			expect(await readSettings(client)).toEqual(changed);
			const modifications = (await auditRows(db)).filter(
				({ tool }) => tool === "modifier_reglages",
			);
			expect(modifications).toEqual([
				expect.objectContaining({
					input: { [name]: value },
					succeeded: true,
					before: STARTING_SETTINGS,
					after: changed,
				}),
			]);
		},
	);

	test.each([
		[
			"les plus petites",
			{
				p: 0,
				baisse_p: 0,
				fenetre_jours: 1,
				recrue_moyenne_vie: Number.MIN_VALUE,
				recrue_moyenne_force: Number.MIN_VALUE,
				recrue_moyenne_magie: Number.MIN_VALUE,
				recrue_moyenne_vitesse: Number.MIN_VALUE,
				budget_jour_2: 1,
			},
		],
		[
			"les plus grandes",
			{
				p: 1,
				baisse_p: 1,
				fenetre_jours: POSTGRES_INTEGER_MAX,
				recrue_moyenne_vie: Number.MAX_VALUE,
				recrue_moyenne_force: Number.MAX_VALUE,
				recrue_moyenne_magie: Number.MAX_VALUE,
				recrue_moyenne_vitesse: Number.MAX_VALUE,
				budget_jour_2: POSTGRES_INTEGER_MAX,
			},
		],
	])(
		"modifier_reglages admet %s valeurs de chaque réglage, que lire_reglages rend",
		async (_, settings) => {
			const { client } = await connectToRegistry();
			const result = await client.callTool({
				name: "modifier_reglages",
				arguments: settings,
			});
			expect(outputOf(result)).toEqual(settings);
			expect(await readSettings(client)).toEqual(settings);
		},
	);

	// Le dénombrement des entrées invalides, écrit avant le code des outils : chaque borne de chaque
	// réglage (issue #11, « Décisions »), les types faux, le champ inconnu, l'entrée vide.
	test.each<[string, string, Record<string, unknown>, string]>([
		[
			"un champ inconnu",
			"modifier_reglages",
			{ p: 0.6, inconnu: 1 },
			'Unrecognized key: "inconnu"',
		],
		[
			"p en chaîne",
			"modifier_reglages",
			{ p: "0.6" },
			"expected number, received string",
		],
		[
			"p null",
			"modifier_reglages",
			{ p: null },
			"expected number, received null",
		],
		["une entrée vide", "modifier_reglages", {}, "au moins un réglage"],
		["p = -0,1", "modifier_reglages", { p: -0.1 }, ">=0"],
		["p = 1,1", "modifier_reglages", { p: 1.1 }, "<=1"],
		["p = 70", "modifier_reglages", { p: 70 }, "<=1"],
		["baisse_p = -0,1", "modifier_reglages", { baisse_p: -0.1 }, ">=0"],
		["baisse_p = 1,1", "modifier_reglages", { baisse_p: 1.1 }, "<=1"],
		["fenetre_jours = 0", "modifier_reglages", { fenetre_jours: 0 }, ">=1"],
		[
			"fenetre_jours = 2,5",
			"modifier_reglages",
			{ fenetre_jours: 2.5 },
			"expected int",
		],
		[
			"fenetre_jours au-delà d'un integer de Postgres",
			"modifier_reglages",
			{ fenetre_jours: POSTGRES_INTEGER_MAX + 1 },
			`<=${POSTGRES_INTEGER_MAX}`,
		],
		["budget_jour_2 = 0", "modifier_reglages", { budget_jour_2: 0 }, ">=1"],
		[
			"budget_jour_2 = 1,5",
			"modifier_reglages",
			{ budget_jour_2: 1.5 },
			"expected int",
		],
		[
			"budget_jour_2 au-delà d'un integer de Postgres",
			"modifier_reglages",
			{ budget_jour_2: POSTGRES_INTEGER_MAX + 1 },
			`<=${POSTGRES_INTEGER_MAX}`,
		],
		[
			"recrue_moyenne_vie = 0",
			"modifier_reglages",
			{ recrue_moyenne_vie: 0 },
			">0",
		],
		[
			"recrue_moyenne_force = 0",
			"modifier_reglages",
			{ recrue_moyenne_force: 0 },
			">0",
		],
		[
			"recrue_moyenne_magie = 0",
			"modifier_reglages",
			{ recrue_moyenne_magie: 0 },
			">0",
		],
		[
			"recrue_moyenne_vitesse = 0",
			"modifier_reglages",
			{ recrue_moyenne_vitesse: 0 },
			">0",
		],
		[
			"un réglage valide et un hors bornes",
			"modifier_reglages",
			{ p: 0.6, baisse_p: 2 },
			"<=1",
		],
		[
			"lire_reglages avec un argument",
			"lire_reglages",
			{ p: 0.6 },
			'Unrecognized key: "p"',
		],
	])(
		"%s : refusé, une ligne d'audit en erreur avec l'entrée reçue, rien d'écrit",
		async (_, tool, args, message) => {
			const { db, client } = await connectToRegistry();
			const result = await client.callTool({ name: tool, arguments: args });
			const rows = await auditRows(db);
			expect(rows).toEqual([
				expect.objectContaining({
					tool,
					input: args,
					succeeded: false,
					before: null,
					after: null,
				}),
			]);
			expect(rows[0]?.error).toContain(message);
			expect(result).toMatchObject({
				content: [{ type: "text", text: rows[0]?.error }],
				isError: true,
			});
			expect(await readSettings(client)).toEqual(STARTING_SETTINGS);
		},
	);

	test.each([
		"recrue_moyenne_vie",
		"recrue_moyenne_force",
		"recrue_moyenne_magie",
		"recrue_moyenne_vitesse",
	])(
		"%s infinie : refusée, une ligne d'audit en erreur, rien d'écrit",
		async (name) => {
			const { db, client } = await connectToRegistry();
			const result = await client.callTool({
				name: "modifier_reglages",
				arguments: { [name]: INFINITE },
			});
			expect(result.isError).toBe(true);
			// L'entrée auditée passe par `JSON.stringify`, qui écrit `Infinity` en `null`.
			expect(await auditRows(db)).toEqual([
				expect.objectContaining({
					tool: "modifier_reglages",
					input: { [name]: null },
					succeeded: false,
					error: expect.stringContaining("expected number, received Infinity"),
				}),
			]);
			expect(await readSettings(client)).toEqual(STARTING_SETTINGS);
		},
	);
});
