import { describe, expect, test } from "vitest";
import { z } from "zod";
import { registry } from "../app/mcp/registry.ts";
import { listTools } from "../app/mcp/tool.ts";

type JsonSchema = Record<string, unknown>;

// Un nom de propriété qui annonce une requête libre (issue #11 : aucun outil n'exécute de SQL libre).
const FREE_QUERY_NAME = /sql|query|requ[eê]te|filtre|where/i;

// Les mots-clés qui portent un sous-schéma, ou une liste ou une table de sous-schémas : ceux qu'émet
// `z.toJSONSchema`, d'où vient tout schéma de `tools/list` (`zod/v4/core`, 4.6.7, lu le 2026-11-17).
const SUBSCHEMA = [
	"items",
	"additionalItems",
	"additionalProperties",
	"not",
	"propertyNames",
];
const SUBSCHEMA_CONTAINER = [
	"properties",
	"patternProperties",
	"$defs",
	"prefixItems",
	"anyOf",
	"oneOf",
	"allOf",
];

function isSchema(value: unknown): value is JsonSchema {
	return typeof value === "object" && value !== null;
}

/** Les sous-schémas d'un nœud, chacun avec son pointeur JSON. */
function subschemas(node: JsonSchema, pointer: string): [string, JsonSchema][] {
	return Object.entries(node).flatMap(([keyword, value]) => {
		if (!isSchema(value)) {
			return [];
		}
		if (SUBSCHEMA.includes(keyword)) {
			return [[`${pointer}/${keyword}`, value]];
		}
		if (SUBSCHEMA_CONTAINER.includes(keyword)) {
			return Object.entries(value)
				.filter((entry): entry is [string, JsonSchema] => isSchema(entry[1]))
				.map(([key, child]) => [`${pointer}/${keyword}/${key}`, child]);
		}
		return [];
	});
}

/**
 * Ce qui, à toute profondeur d'un schéma JSON, laisserait passer une requête libre : un objet ouvert,
 * une feuille sans type, une chaîne sans `enum`, `pattern` ni `maxLength`, un nom de requête.
 */
function freeQueryFlaws(node: JsonSchema, pointer = "#"): string[] {
	const types = [node.type].flat();
	const children = subschemas(node, pointer);
	const flaws = [
		types.includes("object") &&
			node.additionalProperties !== false &&
			`${pointer} : objet ouvert`,
		children.length === 0 &&
			node.type === undefined &&
			`${pointer} : feuille sans type`,
		types.includes("string") &&
			!["enum", "pattern", "maxLength"].some((keyword) => keyword in node) &&
			`${pointer} : chaîne libre`,
		...Object.keys(isSchema(node.properties) ? node.properties : {})
			.filter((name) => FREE_QUERY_NAME.test(name))
			.map((name) => `${pointer}/properties/${name} : nom de requête`),
	].filter((flaw) => typeof flaw === "string");
	return [
		...flaws,
		...children.flatMap(([childPointer, child]) =>
			freeQueryFlaws(child, childPointer),
		),
	];
}

/** Les défauts du schéma d'entrée publié pour `input`, comme `tools/list` le publie. */
function publishedFlaws(input: z.ZodObject): string[] {
	const [tool] = listTools([
		{
			name: "temoin",
			title: "Témoin",
			description: "Témoin.",
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
			input,
			output: z.strictObject({}),
			run: async () => ({ output: {} }),
		},
	]);
	return freeQueryFlaws(tool?.inputSchema ?? {});
}

describe("aucun paramètre de requête libre", () => {
	test("aucun outil du registre n'expose de paramètre de requête libre, à toute profondeur", () => {
		const tools = listTools(registry);
		expect(tools.map(({ name }) => name)).toEqual([
			"lire_reglages",
			"modifier_reglages",
			"lister_sorts",
			"ajouter_sort",
			"modifier_sort",
			"deposer_fichier_3d",
			"regler_modele_classe",
		]);
		expect(
			tools.flatMap(({ name, inputSchema }) =>
				freeQueryFlaws(inputSchema).map((flaw) => `${name} ${flaw}`),
			),
		).toEqual([]);
	});

	// Un témoin par règle, pour voir chacune mordre seule, à profondeur.
	test.each<[string, z.ZodObject, string[]]>([
		[
			"une requête en chaîne libre",
			z.strictObject({ query: z.string() }),
			[
				"#/properties/query : nom de requête",
				"#/properties/query : chaîne libre",
			],
		],
		[
			"une chaîne libre sous un tableau",
			z.strictObject({ noms: z.array(z.string()) }),
			["#/properties/noms/items : chaîne libre"],
		],
		[
			"un nom de requête sur une chaîne bornée",
			z.strictObject({ filtre: z.string().max(10) }),
			["#/properties/filtre : nom de requête"],
		],
		[
			"un objet ouvert imbriqué",
			z.strictObject({ options: z.record(z.enum(["a"]), z.number()) }),
			["#/properties/options : objet ouvert"],
		],
		[
			"une feuille sans type dans une union",
			z.strictObject({ valeur: z.union([z.number(), z.unknown()]) }),
			["#/properties/valeur/anyOf/1 : feuille sans type"],
		],
	])("le parcours voit %s", (_, input, flaws) => {
		expect(publishedFlaws(input)).toEqual(flaws);
	});
});
