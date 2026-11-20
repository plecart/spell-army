import { createHash } from "node:crypto";
import type { Client } from "@modelcontextprotocol/client";
import { classDefaultModels, type Executor, modelFiles } from "donnees";
import { glb } from "personnages/test/glb";
import { describe, expect, test } from "vitest";
import {
	auditRows,
	connectToRegistry,
	outputOf,
	publishedTools,
} from "./montage.ts";

const MODEL_TOOLS = ["deposer_fichier_3d", "regler_modele_classe"];
const nonBlank = expect.stringMatching(/\S/);

// Le plus petit fichier conforme : les cinq ancres, vides, `chapeau` sous `tete`, `sol` à l'origine.
const CONFORMING = {
	asset: { version: "2.0" },
	nodes: [
		{ name: "tete", children: [1] },
		{ name: "chapeau" },
		{ name: "main_gauche" },
		{ name: "main_droite" },
		{ name: "sol" },
	],
};
// Deux écarts : l'ancre `main_droite` renommée, une texture.
const NON_CONFORMING = {
	...CONFORMING,
	nodes: CONFORMING.nodes.map((node) =>
		node.name === "main_droite" ? { name: "main" } : node,
	),
	textures: [{}],
};
const DEVIATIONS = [
	"Le fichier ne respecte pas le contrat du fichier 3D (direction artistique § 7) :",
	"- ancres (main_droite) : L'ancre « main_droite » manque : ajoutez un nœud nommé « main_droite », vide si rien n'y pend.",
	"- sans-texture : Le fichier porte 1 texture(s) et 0 image(s) : retirez-les, les couleurs sont unies.",
].join("\n");

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const sha256 = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");

/** Les fichiers rangés et les modèles par défaut, lus en base. */
async function stored(db: Executor) {
	return {
		files: await db.select({ id: modelFiles.id }).from(modelFiles),
		defaults: await db.select().from(classDefaultModels),
	};
}

/** Les lignes d'audit de l'outil `tool`. */
async function auditOf(db: Executor, tool: string) {
	return (await auditRows(db)).filter((row) => row.tool === tool);
}

async function deposit(client: Client, args: Record<string, unknown>) {
	return client.callTool({ name: "deposer_fichier_3d", arguments: args });
}

/** Dépose `json` en GLB pour `owner` et rend son identifiant. */
async function depositFor(
	client: Client,
	owner: Record<string, string>,
	json: unknown = CONFORMING,
): Promise<number> {
	const result = await deposit(client, {
		...owner,
		contenu: base64(glb(json)),
	});
	return (outputOf(result) as { identifiant: number }).identifiant;
}

async function setDefault(client: Client, classe: string, fichier: number) {
	return client.callTool({
		name: "regler_modele_classe",
		arguments: { classe, fichier },
	});
}

describe("outils des fichiers 3D : tools/list", () => {
	test("publie le titre, les annotations, un schéma de sortie strict et chaque champ décrit ; seul regler_modele_classe est destructeur", () => {
		const strict = expect.objectContaining({
			type: "object",
			additionalProperties: false,
		});
		expect(
			publishedTools(MODEL_TOOLS).map(
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
				name: "deposer_fichier_3d",
				title: "Déposer un fichier 3D",
				annotations: {
					readOnlyHint: false,
					destructiveHint: false,
					idempotentHint: false,
					openWorldHint: false,
				},
				fields: ["classe", "monstre", "contenu"].map((field) => [
					field,
					nonBlank,
				]),
				outputSchema: strict,
			},
			{
				name: "regler_modele_classe",
				title: "Régler le modèle par défaut d'une classe",
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
					idempotentHint: true,
					openWorldHint: false,
				},
				fields: ["classe", "fichier"].map((field) => [field, nonBlank]),
				outputSchema: strict,
			},
		]);
	});

	test("la description de deposer_fichier_3d donne la commande à lancer et dit de ne jamais passer le contenu dans l'appel", () => {
		const [tool] = publishedTools(["deposer_fichier_3d"]);
		expect(tool?.description).toContain(
			"pnpm --filter web deposer-3d <fichier.glb> --classe <classe>",
		);
		expect(tool?.description).toContain("--monstre <nom>");
		expect(tool?.description).toContain(
			"Ne passe jamais le contenu dans l'appel",
		);
	});

	test("deposer_fichier_3d publie le contenu requis, exactement une classe ou un monstre, et les huit classes", () => {
		const [tool] = publishedTools(["deposer_fichier_3d"]);
		expect(tool?.inputSchema).toMatchObject({
			required: ["contenu"],
			minProperties: 2,
			maxProperties: 2,
			properties: {
				classe: {
					enum: [
						"wizard",
						"golem",
						"warrior",
						"dwarf",
						"vampire",
						"druid",
						"peasant",
						"fairy",
					],
				},
				monstre: { maxLength: 64 },
				contenu: { maxLength: 4_000_000 },
			},
		});
	});
});

describe("deposer_fichier_3d", () => {
	test("un fichier conforme d'une classe est rangé : il rend son identifiant, sa taille et son empreinte, que l'audit garde en après", async () => {
		const { db, client } = await connectToRegistry();
		const bytes = glb(CONFORMING);
		const args = { classe: "wizard", contenu: base64(bytes) };
		const output = {
			identifiant: 1,
			taille: bytes.length,
			empreinte: sha256(bytes),
		};
		expect(outputOf(await deposit(client, args))).toEqual(output);
		expect(await auditOf(db, "deposer_fichier_3d")).toEqual([
			expect.objectContaining({
				input: args,
				succeeded: true,
				before: null,
				after: {
					identifiant: 1,
					classe: "wizard",
					taille: bytes.length,
					empreinte: sha256(bytes),
				},
			}),
		]);
	});

	test("un fichier de monstre est rangé sous son nom sans les blancs qui l'entourent", async () => {
		const { db, client } = await connectToRegistry();
		const bytes = glb(CONFORMING);
		outputOf(
			await deposit(client, { monstre: " limace ", contenu: base64(bytes) }),
		);
		const [row] = await auditOf(db, "deposer_fichier_3d");
		expect(row?.after).toMatchObject({ identifiant: 1, monstre: "limace" });
	});

	test("un fichier non conforme est refusé avec ses écarts, un par ligne : seule la ligne d'audit en erreur s'écrit", async () => {
		const { db, client } = await connectToRegistry();
		const args = { classe: "wizard", contenu: base64(glb(NON_CONFORMING)) };
		const result = await deposit(client, args);
		expect(result).toMatchObject({
			content: [{ type: "text", text: DEVIATIONS }],
			isError: true,
		});
		expect(await auditOf(db, "deposer_fichier_3d")).toEqual([
			expect.objectContaining({
				input: args,
				succeeded: false,
				error: DEVIATIONS,
			}),
		]);
		expect(await stored(db)).toEqual({ files: [], defaults: [] });
	});

	test("3 000 001 octets sont refusés avant d'être lus, par la borne du texte en base64 ; l'audit en garde la taille et l'empreinte", async () => {
		const { db, client } = await connectToRegistry();
		const bytes = glb(CONFORMING, 3_000_001);
		const result = await deposit(client, {
			classe: "wizard",
			contenu: base64(bytes),
		});
		expect(result).toMatchObject({
			content: [
				{
					text: expect.stringContaining(
						"le fichier doit faire au plus 3 000 000 octets, soit 4 000 000 caractères en base64",
					),
				},
			],
			isError: true,
		});
		expect(await auditOf(db, "deposer_fichier_3d")).toEqual([
			expect.objectContaining({
				input: {
					classe: "wizard",
					contenu: { taille: 3_000_001, sha256: sha256(bytes) },
				},
				succeeded: false,
			}),
		]);
		expect(await stored(db)).toEqual({ files: [], defaults: [] });
	});

	test("3 000 000 octets, un GLB conforme complété d'un morceau BIN, sont lus, rangés et réglés par défaut ; l'audit garde leur taille et leur empreinte, jamais le contenu", async () => {
		const { db, client } = await connectToRegistry();
		const bytes = glb(CONFORMING, 3_000_000);
		const contenu = base64(bytes);
		expect(
			outputOf(await deposit(client, { classe: "wizard", contenu })),
		).toEqual({ identifiant: 1, taille: 3_000_000, empreinte: sha256(bytes) });
		outputOf(await setDefault(client, "wizard", 1));
		const rows = await auditRows(db);
		expect(JSON.stringify(rows)).not.toContain(contenu.slice(0, 100));
		expect(
			rows.find(({ tool }) => tool === "deposer_fichier_3d")?.input,
		).toEqual({
			classe: "wizard",
			contenu: { taille: 3_000_000, sha256: sha256(bytes) },
		});
	});

	// Le dénombrement des refus du schéma : le propriétaire (aucun, deux, une classe inconnue, un nom
	// de monstre blanc ou trop long), le contenu, un champ inconnu.
	const CONTENT = base64(glb(CONFORMING));
	test.each<[string, Record<string, unknown>, string]>([
		[
			"ni classe ni monstre",
			{ contenu: CONTENT },
			"L'entrée doit donner la classe ou le monstre, l'un des deux exactement.",
		],
		[
			"une classe et un monstre",
			{ classe: "wizard", monstre: "limace", contenu: CONTENT },
			"L'entrée doit donner la classe ou le monstre, l'un des deux exactement.",
		],
		[
			"une classe inconnue",
			{ classe: "dragon", contenu: CONTENT },
			"Invalid option",
		],
		[
			"un nom de monstre blanc",
			{ monstre: " \t", contenu: CONTENT },
			">=1 characters",
		],
		[
			"un nom de monstre de 65 caractères",
			{ monstre: "m".repeat(65), contenu: CONTENT },
			"<=64 characters",
		],
		[
			"un contenu qui n'est pas du base64",
			{ classe: "wizard", contenu: "pas du base64 !" },
			"base64",
		],
		[
			"un champ inconnu",
			{ classe: "wizard", contenu: CONTENT, nom: "x" },
			'Unrecognized key: "nom"',
		],
	])(
		"%s : refusé, une ligne d'audit en erreur avec l'entrée reçue, rien d'écrit",
		async (_, args, message) => {
			const { db, client } = await connectToRegistry();
			const result = await deposit(client, args);
			const rows = await auditOf(db, "deposer_fichier_3d");
			expect(rows).toEqual([
				expect.objectContaining({ input: args, succeeded: false }),
			]);
			expect(rows[0]?.error).toContain(message);
			expect(result).toMatchObject({
				content: [{ type: "text", text: rows[0]?.error }],
				isError: true,
			});
			expect(await stored(db)).toEqual({ files: [], defaults: [] });
		},
	);
});

describe("regler_modele_classe", () => {
	test("règle le modèle par défaut d'une classe, puis le remplace ; l'audit garde l'avant et l'après", async () => {
		const { db, client } = await connectToRegistry();
		const first = await depositFor(client, { classe: "wizard" });
		const second = await depositFor(client, { classe: "wizard" });
		expect(outputOf(await setDefault(client, "wizard", first))).toEqual({
			classe: "wizard",
			fichier: first,
		});
		expect(outputOf(await setDefault(client, "wizard", second))).toEqual({
			classe: "wizard",
			fichier: second,
		});
		expect(await auditOf(db, "regler_modele_classe")).toEqual([
			expect.objectContaining({
				input: { classe: "wizard", fichier: first },
				succeeded: true,
				before: { classe: "wizard", fichier: null },
				after: { classe: "wizard", fichier: first },
			}),
			expect.objectContaining({
				input: { classe: "wizard", fichier: second },
				succeeded: true,
				before: { classe: "wizard", fichier: first },
				after: { classe: "wizard", fichier: second },
			}),
		]);
		expect((await stored(db)).defaults).toEqual([
			{ class: "wizard", modelFileId: second },
		]);
	});

	// Les fichiers qu'une classe refuse, sur une base qui porte le fichier 1 du magicien, réglé par
	// défaut, le 2 de la limace et le 3 du golem.
	test.each<[string, number, string]>([
		["un fichier inexistant", 99, "Aucun fichier 3D d'identifiant 99."],
		[
			"un fichier de monstre",
			2,
			"Le fichier 3D 2 est celui du monstre « limace », pas celui d'une classe.",
		],
		[
			"un fichier d'une autre classe",
			3,
			"Le fichier 3D 3 est celui de la classe golem, pas de la classe wizard.",
		],
	])(
		"%s : refusé, une ligne d'audit en erreur, le modèle par défaut inchangé",
		async (_, fichier, message) => {
			const { db, client } = await connectToRegistry();
			await depositFor(client, { classe: "wizard" });
			await depositFor(client, { monstre: "limace" });
			await depositFor(client, { classe: "golem" });
			outputOf(await setDefault(client, "wizard", 1));
			const result = await setDefault(client, "wizard", fichier);
			expect(result).toMatchObject({
				content: [{ type: "text", text: message }],
				isError: true,
			});
			expect((await auditOf(db, "regler_modele_classe")).at(-1)).toMatchObject({
				input: { classe: "wizard", fichier },
				succeeded: false,
				error: message,
			});
			expect((await stored(db)).defaults).toEqual([
				{ class: "wizard", modelFileId: 1 },
			]);
		},
	);
});
