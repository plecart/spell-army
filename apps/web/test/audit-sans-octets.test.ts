import { createHash } from "node:crypto";
import { auditLog } from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { registry } from "../app/mcp/registry.ts";
import { callTool, type McpTool } from "../app/mcp/tool.ts";
import { png } from "./images.ts";
import { auditRows } from "./montage.ts";

// Le dénombrement de `writeAuditEntry` (`app/mcp/audit.ts`) : chaque voie par laquelle des octets
// reçus entrent dans une ligne d'audit — une valeur sous chaque forme, un texte en base64 — et
// chaque colonne qu'ils atteignent, puis chaque voie d'un texte reçu. Aucune ligne ne garde les
// octets : chaque colonne atteinte garde leur empreinte (issue #12, « Image »), sauf un message de
// plus de 65 536 caractères, remplacé en entier par la sienne comme tout texte de cette longueur
// (issue #15, « Ligne d'audit »). Les cas sont écrits en littéraux, sans rien lire d'`audit.ts`.

// Un PNG de 57 octets, que la réserve admet : une image plus courte que toute borne de longueur.
const SMALL_IMAGE = png(1200, 900);
// Un PNG privé de son dernier octet : pas une image, mais 65 537 octets, un de plus que la borne de
// longueur.
const LONG_BYTES = png(1200, 900, 65_538).subarray(0, 65_537);

const BYTES: [string, Uint8Array][] = [
	["une image de 57 octets", SMALL_IMAGE],
	["65 537 octets qui ne sont pas une image", LONG_BYTES],
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
// ligne, ou, avec `echec`, lève `valeur` pour message.
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
		if (echec) throw new Error(String(valeur));
		return { output: {}, before: { valeur }, after: { valeur } };
	},
};

const TOOLS: readonly McpTool[] = [...registry, echoTool];

type Column = "tool" | "input" | "error" | "before" | "after";
type Row = Record<Column, unknown>;

// Les voies d'une valeur reçue : l'outil appelé, l'entrée qui la porte et les colonnes qu'elle
// atteint. Le champ image de modifier_sort couvre le succès, le refus de l'outil (65 537 octets qui
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

// Les voies d'un texte reçu, ici des octets en base64 : l'outil et l'entrée qui le portent, les
// colonnes qui le reçoivent entier, et celles dont le message le cite.
const TEXT_PATHS: [
	string,
	(text: string) => [string, Record<string, unknown>],
	Column[],
	Column[],
][] = [
	["le nom d'un outil inconnu", (text) => [text, {}], ["tool"], ["error"]],
	[
		"une clé que le schéma refuse et que son message cite",
		(text) => ["modifier_sort", { numero: 1, [text]: 1 }],
		["input"],
		["error"],
	],
	[
		"un message d'erreur d'outil qui la recopie",
		(text) => ["renvoyer", { valeur: text, echec: true }],
		["input", "error"],
		[],
	],
];

/** Un texte de `length` caractères en mots courts, ni base64 ni image : seule sa longueur compte. */
const shortWords = (length: number) => "mot ".repeat(length).slice(0, length);

/** La `valeur` que l'outil `renvoyer` range dans la colonne JSON `column` de `row`. */
const valeurOf = (row: Row, column: Column) =>
	(row[column] as { valeur: unknown }).valeur;

// Les voies par lesquelles un texte reçu entre dans une ligne d'audit, le dénombrement de
// `writeAuditEntry` : la colonne, l'appel qui l'y porte, ce que la ligne en garde, et la forme de
// son empreinte une fois remplacé — en JSON dans une colonne texte ou une clé, en objet pour une
// chaîne d'une colonne JSON.
type TextSlot = [
	string,
	Column,
	(text: string) => [string, Record<string, unknown>],
	(row: Row) => unknown,
	(stored: ReturnType<typeof fingerprint>) => unknown,
];
const TEXT_SLOTS: TextSlot[] = [
	[
		"le nom d'un outil inconnu",
		"tool",
		(text) => [text, {}],
		(row) => row.tool,
		JSON.stringify,
	],
	[
		"un message d'erreur",
		"error",
		(text) => ["renvoyer", { valeur: text, echec: true }],
		(row) => row.error,
		JSON.stringify,
	],
	...(["input", "before", "after"] as const).flatMap((column): TextSlot[] => [
		[
			`une clé de ${column}`,
			column,
			(text) => ["renvoyer", { valeur: { [text]: 1 } }],
			(row) => Object.keys(valeurOf(row, column) as object)[0],
			JSON.stringify,
		],
		[
			`une chaîne de ${column}`,
			column,
			(text) => ["renvoyer", { valeur: text }],
			(row) => valeurOf(row, column),
			(stored) => stored,
		],
	]),
];

/** Appelle `tool` avec `args` sur une base neuve, et rend sa ligne d'audit, la seule. */
async function auditedRow(
	tool: string,
	args: Record<string, unknown>,
): Promise<Row> {
	const db = await freshDatabase();
	// Un outil inconnu lève une erreur de protocole, après sa ligne d'audit.
	await callTool(TOOLS, db, tool, args).catch(() => undefined);
	const rows = await auditRows(db);
	expect(rows).toHaveLength(1);
	return rows[0] as Row;
}

/** `auditedRow`, dont la ligne ne garde `bytes` sous aucune forme. */
async function auditedWithoutBytes(
	tool: string,
	args: Record<string, unknown>,
	bytes: Uint8Array,
): Promise<Row> {
	const row = await auditedRow(tool, args);
	const stored = JSON.stringify(row);
	for (const form of storedForms(bytes)) {
		expect(stored).not.toContain(form);
	}
	return row;
}

/** Chaque colonne de `columns` de `row` cite l'empreinte de `bytes`, en objet ou en texte. */
function expectCited(row: Row, columns: readonly Column[], bytes: Uint8Array) {
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
		TEXT_PATHS.map(
			([path, call, entire, quoting]) =>
				[path, ...call(base64(SMALL_IMAGE)), [...entire, ...quoting]] as const,
		),
	)(
		"une image de 57 octets en base64 par %s : chaque colonne atteinte cite son empreinte",
		async (_, tool, args, columns) => {
			expectCited(
				await auditedWithoutBytes(tool, args, SMALL_IMAGE),
				columns,
				SMALL_IMAGE,
			);
		},
	);

	test.each(
		TEXT_PATHS.map(
			([path, call, entire, quoting]) =>
				[path, ...call(base64(LONG_BYTES)), entire, quoting] as const,
		),
	)(
		"65 537 octets en base64 par %s : la colonne qui les reçoit entiers cite leur empreinte, un message qui les cite est remplacé en entier",
		async (_, tool, args, entire, quoting) => {
			const row = await auditedWithoutBytes(tool, args, LONG_BYTES);
			expectCited(row, entire, LONG_BYTES);
			for (const column of quoting) {
				expect(JSON.parse(row[column] as string)).toEqual({
					taille: expect.any(Number),
					sha256: expect.any(String),
				});
			}
		},
	);

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

	// La borne de l'issue #15 (« Ligne d'audit ») sur chaque voie d'un texte : des mots courts, sans
	// base64 ni image, que seule leur longueur fait remplacer.
	test.each(TEXT_SLOTS)(
		"%s : un texte de 65 536 caractères reste entier",
		async (_, __, call, stored) => {
			const text = shortWords(65_536);
			expect(stored(await auditedRow(...call(text)))).toBe(text);
		},
	);

	test.each(TEXT_SLOTS)(
		"%s : un texte de 65 537 caractères est remplacé en entier par sa longueur et son empreinte SHA-256",
		async (_, __, call, stored, replaced) => {
			const text = shortWords(65_537);
			expect(stored(await auditedRow(...call(text)))).toEqual(
				replaced({
					taille: 65_537,
					sha256: sha256(new TextEncoder().encode(text)),
				}),
			);
		},
	);

	// Un texte entre dans une colonne `text` (`dataType` « string » pour Drizzle) par une voie, dans
	// une colonne `jsonb` (« json ») par deux : une clé et une chaîne, à toute profondeur.
	test("les voies d'un texte couvrent chaque colonne texte ou JSON d'audit_log", () => {
		const slotsPerType: Record<string, number> = { string: 1, json: 2 };
		const columns = Object.values(auditLog).flatMap(
			({ name, dataType }: { name: string; dataType?: string }) =>
				Array<string>(slotsPerType[dataType ?? ""] ?? 0).fill(name),
		);
		expect(TEXT_SLOTS.map(([, column]) => column).sort()).toEqual(
			columns.sort(),
		);
	});

	// La borne compte des caractères, non des octets ; un texte qui n'est pas du base64 est remplacé
	// par la taille et l'empreinte de ses octets UTF-8.
	test("un texte de 65 536 « é », 131 072 octets UTF-8, sous une clé quelconque est gardé tel quel", async () => {
		const text = "é".repeat(65_536);
		expect((await auditedRow("renvoyer", { valeur: text })).input).toEqual({
			valeur: text,
		});
	});

	test("un texte de 65 537 « é » est remplacé par la taille et l'empreinte de ses octets UTF-8", async () => {
		const utf8 = new TextEncoder().encode("é".repeat(65_537));
		const row = await auditedWithoutBytes(
			"renvoyer",
			{ valeur: "é".repeat(65_537) },
			utf8,
		);
		expect(row.input).toEqual({
			valeur: { taille: 131_074, sha256: sha256(utf8) },
		});
	});
});
