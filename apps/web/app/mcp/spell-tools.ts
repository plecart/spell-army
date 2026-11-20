import { spellKey, validateSpell } from "combat";
import {
	findSpellByKey,
	insertSpell,
	listSpells,
	readSpell,
	type SpellImage,
	updateSpell,
} from "donnees";
import { z } from "zod";
import { boundedBase64, grouped } from "./bounds.ts";
import { readImageInfo } from "./image.ts";
import {
	newSpellSchema,
	spellOf,
	toModelSpell,
	toolSpellSchema,
	toToolSpell,
} from "./spell-vocabulary.ts";
import type { McpTool } from "./tool.ts";

// Les bornes d'une image (issue #12, « Image »), en nombres, puis en mots qui en dérivent. Le texte
// en base64 se borne par `boundedBase64` (`test/outils-des-sorts.test.ts` en éprouve les deux
// côtés).
const MIN_WIDTH = 1200;
const MIN_HEIGHT = 900;
const MAX_IMAGE_BYTES = 3_000_000;

const MIN_SIZE_WORDS = `${grouped(MIN_WIDTH)} × ${grouped(MIN_HEIGHT)} px`;
const IMAGE_RULE = `un PNG, un JPEG ou un WebP d'au moins ${MIN_SIZE_WORDS} et d'au plus ${grouped(MAX_IMAGE_BYTES)} octets`;
const NOT_AN_IMAGE = "l'image doit être un fichier PNG, JPEG ou WebP complet";
const TOO_SMALL = `l'image doit faire au moins ${MIN_SIZE_WORDS}`;

const modification = z
	.strictObject({
		numero: z.int32().min(1).describe("Le numéro du sort à modifier."),
		poids: toolSpellSchema.shape.poids.optional(),
		description: toolSpellSchema.shape.description.optional(),
		image: boundedBase64("l'image", MAX_IMAGE_BYTES)
			.nullable()
			.optional()
			.describe(
				`L'image de la carte, ses octets en base64 : ${IMAGE_RULE} ; null la retire.`,
			),
	})
	.refine(
		({ poids, description, image }) =>
			[poids, description, image].some((value) => value !== undefined),
		"Rien à modifier : l'entrée doit donner le poids, la description ou l'image.",
	)
	// Le `refine` ne passe pas dans le schéma JSON : outre le numéro, un des trois champs au moins.
	.meta({ minProperties: 2 });

/** Refuse l'appel par les messages de `errors`, un par ligne, s'il y en a. */
function refuseIfAny(errors: string[]): void {
	if (errors.length > 0) {
		throw new Error(errors.join("\n"));
	}
}

/**
 * L'image donnée en base64, ses octets et son type ; une erreur qui dit la borne franchie (issue
 * #12, « Image »). Le schéma d'entrée a déjà borné sa taille.
 */
function spellImage(text: string): SpellImage {
	const bytes = Buffer.from(text, "base64");
	const info = readImageInfo(bytes);
	if (!info) {
		throw new Error(NOT_AN_IMAGE);
	}
	if (info.width < MIN_WIDTH || info.height < MIN_HEIGHT) {
		throw new Error(`${TOO_SMALL}, reçu : ${info.width} × ${info.height} px`);
	}
	return { bytes, type: info.type };
}

export const listSpellsTool: McpTool = {
	name: "lister_sorts",
	title: "Lister les sorts de la réserve",
	description:
		"Liste les sorts de la réserve par numéro : nom, recette, forme, effet, catégorie, poids de tirage, description, et le type, la taille et l'empreinte de l'image, jamais ses octets. Les champs portent les noms qu'attendent ajouter_sort et modifier_sort.",
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: z.strictObject({}),
	output: z.strictObject({ sorts: z.array(toolSpellSchema) }),
	run: async (executor) => ({
		output: { sorts: (await listSpells(executor)).map(toToolSpell) },
	}),
};

/**
 * Les indices suivent leurs définitions MCP. `idempotentHint` : un second appel identique est un
 * doublon (game design § 2, « Unicité »), refusé sans rien écrire ; le journal trace chaque appel,
 * par construction.
 */
export const addSpellTool: McpTool<typeof newSpellSchema> = {
	name: "ajouter_sort",
	title: "Ajouter un sort à la réserve",
	description:
		"Ajoute un sort à la réserve sous le numéro suivant, sans image (modifier_sort la pose), de poids 1 sans poids donné. Refuse un sort qui enfreint les règles de validité, ou dont la recette, la forme avec sa jauge, la catégorie d'effet et la base sont celles d'un sort existant, qu'il nomme. Rend le sort ajouté, sa catégorie déduite de l'effet.",
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: newSpellSchema,
	output: toolSpellSchema,
	run: async (executor, input) => {
		const candidate = toModelSpell(input);
		refuseIfAny(validateSpell(candidate));
		const key = spellKey(candidate);
		const existing = await findSpellByKey(executor, key);
		if (existing) {
			throw new Error(
				`la réserve a déjà ce sort : n° ${existing.number}, « ${existing.name} »`,
			);
		}
		const added = toToolSpell(
			await insertSpell(executor, { ...candidate, key }),
		);
		return { output: added, after: added };
	},
};

/**
 * `destructiveHint` : la modification écrase en place le poids, la description ou l'image. Comme
 * `modifier_reglages`, l'outil ne demande pas de confirmation : l'audit garde l'avant (ADR 0005,
 * « Conséquences »). `idempotentHint` : N appels identiques laissent le même état.
 */
export const updateSpellTool: McpTool<typeof modification> = {
	name: "modifier_sort",
	title: "Modifier un sort de la réserve",
	description: `Modifie le poids de tirage, la description ou l'image d'un sort, et rien d'autre : au moins l'un des trois est requis. L'image se donne en base64 : ${IMAGE_RULE} ; null la retire. Rend le sort après la modification ; le journal d'audit garde l'avant et l'après, l'image en taille et empreinte.`,
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: modification,
	output: toolSpellSchema,
	run: async (executor, { numero, poids, description, image }) => {
		const current = spellOf(await readSpell(executor, numero));
		refuseIfAny(
			validateSpell({
				...current,
				weight: poids ?? current.weight,
				description: description ?? current.description,
			}),
		);
		const { before, after } = await updateSpell(executor, numero, {
			weight: poids,
			description,
			image: typeof image === "string" ? spellImage(image) : image,
		});
		const spellAfter = toToolSpell(after);
		return {
			output: spellAfter,
			before: toToolSpell(before),
			after: spellAfter,
		};
	},
};
