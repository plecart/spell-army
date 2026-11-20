import { createHash } from "node:crypto";
import { freshDatabase } from "donnees/test/base-neuve";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { registry } from "../app/mcp/registry.ts";
import { callTool, type McpTool } from "../app/mcp/tool.ts";
import { png } from "./images.ts";
import { auditRows } from "./montage.ts";

// Le dénombrement de `writeAuditEntry` (`app/mcp/audit.ts`) : chaque voie par laquelle des octets
// reçus entrent dans une ligne d'audit — une valeur sous chaque forme, un texte en base64 — et
// chaque colonne qu'ils atteignent. Aucune ligne ne garde les octets ; chaque colonne atteinte garde
// leur empreinte (issue #12, « Image »). Les cas sont écrits en littéraux, sans rien lire
// d'`audit.ts`.

// Un PNG de 57 octets, que la réserve admet : une image plus courte que toute borne de longueur.
const SMALL_IMAGE = png(1200, 900);
// Un PNG privé de son dernier octet : pas une image, mais 3 999 octets.
const LONG_BYTES = png(1200, 900, 4000).subarray(0, 3999);

const BYTES: [string, Uint8Array][] = [
	["une image de 57 octets", SMALL_IMAGE],
	["3 999 octets qui ne sont pas une image", LONG_BYTES],
];

const sha256 = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
/** Ce que l'audit garde d'octets : leur taille et leur empreinte. */
const fingerprint = (bytes: Uint8Array) => ({
	taille: bytes.length,
	sha256: sha256(bytes),
});

/** `value` et chacune des valeurs qu'il contient, à toute profondeur. */
function nested(value: unknown): unknown[] {
	return value !== null && typeof value === "object"
		? [value, ...Object.values(value).flatMap(nested)]
		: [value];
}

// Les formes d'octets dans une entrée JSON.
const FORMS: [string, (bytes: Uint8Array) => unknown][] = [
	["en base64", base64],
	["en tableau d'octets", (bytes) => Array.from(bytes)],
	[
		"en objet indexé, comme JSON.stringify écrit un Uint8Array",
		(bytes) => ({ ...bytes }),
	],
];

/** Les octets tels qu'une ligne les garderait, sous chacune des formes, une fois relue en JSON. */
function storedForms(bytes: Uint8Array): string[] {
	return [
		base64(bytes),
		Array.from(bytes).join(","),
		Array.from(bytes, (byte, index) => `"${index}":${byte}`).join(","),
	];
}

const echoInput = z.strictObject({
	valeur: z.unknown(),
	echec: z.boolean().optional(),
});

// Un outil de test, la voie d'un outil à venir : il rend `valeur` dans l'avant et l'après de sa
// ligne, ou, avec `echec`, lève un message qui la recopie.
const echoTool: McpTool<typeof echoInput> = {
	name: "renvoyer",
	title: "Renvoyer une valeur",
	description:
		"Rend la valeur reçue dans l'avant et l'après de sa ligne d'audit.",
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: echoInput,
	output: z.strictObject({}),
	run: async (_, { valeur, echec }) => {
		if (echec) throw new Error(`refusé : ${String(valeur)}`);
		return { output: {}, before: { valeur }, after: { valeur } };
	},
};

const TOOLS: readonly McpTool[] = [...registry, echoTool];

type Column = "tool" | "input" | "error" | "before" | "after";

// Les voies d'une valeur reçue : l'outil appelé, l'entrée qui la porte et les colonnes qu'elle
// atteint. Le champ image de modifier_sort couvre le succès, le refus de l'outil (3 999 octets qui
// ne sont pas une image) et celui du schéma (les formes autres que le base64).
const VALUE_PATHS: [
	string,
	string,
	(value: unknown) => Record<string, unknown>,
	Column[],
][] = [
	[
		"le champ image de modifier_sort",
		"modifier_sort",
		(value) => ({ numero: 1, image: value }),
		["input"],
	],
	[
		"un champ image donné à ajouter_sort",
		"ajouter_sort",
		(value) => ({ image: value }),
		["input"],
	],
	[
		"une clé mal orthographiée de modifier_sort",
		"modifier_sort",
		(value) => ({ numero: 1, imagee: value }),
		["input"],
	],
	[
		"une clé imbriquée d'ajouter_sort",
		"ajouter_sort",
		(value) => ({ forme: { type: "sur", fond: value } }),
		["input"],
	],
	[
		"une clé inconnue de modifier_reglages",
		"modifier_reglages",
		(value) => ({ fond: value }),
		["input"],
	],
	[
		"le champ image d'un outil inconnu",
		"dessiner",
		(value) => ({ image: value }),
		["input"],
	],
	[
		"un outil qui la rend dans son avant et son après",
		"renvoyer",
		(value) => ({ valeur: value }),
		["input", "before", "after"],
	],
];

// Les voies d'un texte reçu, ici des octets en base64 : l'outil et l'entrée qui le portent, et les
// colonnes qu'il atteint.
const TEXT_PATHS: [
	string,
	(text: string) => [string, Record<string, unknown>],
	Column[],
][] = [
	["le nom d'un outil inconnu", (text) => [text, {}], ["tool", "error"]],
	[
		"une clé que le schéma refuse et que son message cite",
		(text) => ["modifier_sort", { numero: 1, [text]: 1 }],
		["input", "error"],
	],
	[
		"un message d'erreur d'outil qui la recopie",
		(text) => ["renvoyer", { valeur: text, echec: true }],
		["input", "error"],
	],
];

/**
 * Appelle `tool` avec `args` sur une base neuve : une seule ligne d'audit, qui ne garde `bytes`
 * sous aucune forme. Rend la ligne.
 */
async function auditedWithoutBytes(
	tool: string,
	args: Record<string, unknown>,
	bytes: Uint8Array,
) {
	const db = await freshDatabase();
	// Un outil inconnu lève une erreur de protocole, après sa ligne d'audit.
	await callTool(TOOLS, db, tool, args).catch(() => undefined);
	const rows = await auditRows(db);
	expect(rows).toHaveLength(1);
	const stored = JSON.stringify(rows);
	for (const form of storedForms(bytes)) {
		expect(stored).not.toContain(form);
	}
	return rows[0] as Record<Column, unknown>;
}

/** Chaque colonne de `columns` de `row` cite l'empreinte de `bytes`, en objet ou en texte. */
function expectCited(
	row: Record<Column, unknown>,
	columns: Column[],
	bytes: Uint8Array,
) {
	for (const column of columns) {
		expect(JSON.stringify(row[column])).toContain(sha256(bytes));
	}
}

describe("l'audit ne garde jamais des octets reçus, seulement leur taille et leur empreinte", () => {
	test.each(
		VALUE_PATHS.flatMap(([path, tool, args, columns]) =>
			FORMS.flatMap(([form, encode]) =>
				BYTES.map(
					([what, bytes]) =>
						[
							what,
							form,
							path,
							tool,
							args(encode(bytes)),
							bytes,
							columns,
						] as const,
				),
			),
		),
	)("%s %s par %s", async (_, __, ___, tool, args, bytes, columns) => {
		const row = await auditedWithoutBytes(tool, args, bytes);
		for (const column of columns) {
			expect(nested(row[column])).toContainEqual(fingerprint(bytes));
		}
	});

	test.each(
		TEXT_PATHS.flatMap(([path, call, columns]) =>
			BYTES.map(
				([what, bytes]) =>
					[what, path, ...call(base64(bytes)), bytes, columns] as const,
			),
		),
	)("%s en base64 par %s", async (_, __, tool, args, bytes, columns) => {
		expectCited(await auditedWithoutBytes(tool, args, bytes), columns, bytes);
	});

	// Les deux seuls chemins dont la clé est `image` : une image de 57 octets coupée en deux chaînes
	// base64 courtes, rangées dans un tableau, garde la marque du champ : chaque morceau est remplacé
	// par sa propre taille et sa propre empreinte.
	test.each([
		["le champ image de modifier_sort", "modifier_sort", { numero: 1 }],
		["un champ image donné à ajouter_sort", "ajouter_sort", {}],
	])(
		"une image de 57 octets en deux morceaux base64 sous %s : chaque morceau est remplacé par son empreinte",
		async (_, tool, args) => {
			const half = SMALL_IMAGE.length >> 1;
			const chunks = [
				SMALL_IMAGE.subarray(0, half),
				SMALL_IMAGE.subarray(half),
			];
			const row = await auditedWithoutBytes(
				tool,
				{ ...args, image: chunks.map(base64) },
				SMALL_IMAGE,
			);
			for (const chunk of chunks) {
				expect(JSON.stringify(row)).not.toContain(base64(chunk));
				expect(nested(row.input)).toContainEqual(fingerprint(chunk));
			}
		},
	);

	// `JSON.stringify` écrit un `Date` en texte ISO ; l'objet lui-même n'a aucune clé et serait `{}`.
	test("un après qui contient une date est audité en texte ISO", async () => {
		const db = await freshDatabase();
		await callTool(TOOLS, db, "renvoyer", {
			valeur: new Date("2026-11-20T00:00:00.000Z"),
		});
		expect(await auditRows(db)).toEqual([
			expect.objectContaining({
				after: { valeur: "2026-11-20T00:00:00.000Z" },
			}),
		]);
	});

	test("3 999 octets écrits en nombres, sans blanc, dans le nom d'un outil inconnu : l'empreinte de ce texte", async () => {
		const text = Array.from(LONG_BYTES).join(",");
		expectCited(
			await auditedWithoutBytes(text, {}, LONG_BYTES),
			["tool", "error"],
			new TextEncoder().encode(text),
		);
	});

	// La borne de longueur, au-dessus de la plus longue valeur légitime d'une entrée, la description
	// d'un sort (500 caractères) ; un texte qui n'est pas du base64 compte pour ses octets UTF-8.
	test("un texte de 1 000 caractères sous une clé quelconque est gardé tel quel", async () => {
		const text = "é".repeat(1000);
		const db = await freshDatabase();
		await callTool(TOOLS, db, "renvoyer", { valeur: text });
		expect(await auditRows(db)).toEqual([
			expect.objectContaining({ input: { valeur: text } }),
		]);
	});

	test("un texte de 1 001 caractères est remplacé par la taille et l'empreinte de ses octets UTF-8", async () => {
		const utf8 = new TextEncoder().encode("é".repeat(1001));
		const row = await auditedWithoutBytes(
			"renvoyer",
			{ valeur: "é".repeat(1001) },
			utf8,
		);
		expect(row.input).toEqual({
			valeur: { taille: 2002, sha256: sha256(utf8) },
		});
	});
});
