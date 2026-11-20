import { createHash } from "node:crypto";
import type { Client } from "@modelcontextprotocol/client";
import {
	type CharacterClass,
	type Effect,
	type Form,
	type Linear,
	type Recipe,
	type Spell,
	STARTING_POOL,
} from "combat";
import { createClient, listSpells } from "donnees";
import { createMigratedDatabase } from "donnees/test/base-de-test";
import type { ClassKey } from "personnages";
import {
	afterAll,
	beforeAll,
	describe,
	expect,
	expectTypeOf,
	inject,
	test,
} from "vitest";
import { registry } from "../app/mcp/registry.ts";
import { callTool } from "../app/mcp/tool.ts";
import { gif, IMAGE_FORMATS, png } from "./images.ts";
import {
	auditRows,
	connectToRegistry,
	INFINITE,
	outputOf,
	publishedTools,
} from "./montage.ts";

// Le vocabulaire des outils, en littéraux : l'oracle de la traduction du modèle de `combat`, tenu à
// part des tables de `spell-vocabulary.ts`. Les noms viennent du game design (§ 1, « Classe » ;
// § 2, « Formes », « Effets ») et de l'issue #12 (« Décisions », « Modèle d'un sort »).
const STAT: Record<string, string> = {
	life: "vie",
	strength: "force",
	magic: "magie",
	speed: "vitesse",
};
const GAUGE = {
	monsterLifeLost: "vie_perdue_par_le_monstre",
	armyWounds: "blessures_de_l_armee",
	classShare: "part_d_une_classe",
	casterClassShare: "part_de_la_classe_du_lanceur",
};
const CLASS = {
	wizard: "magicien",
	golem: "golem",
	warrior: "guerrier",
	dwarf: "nain",
	vampire: "vampire",
	druid: "druide",
	peasant: "paysan",
	fairy: "fee",
};
const BASE = {
	armyStat: "stat_de_l_armee",
	armyMaxLife: "vie_maximale_de_l_armee",
	monsterLastHit: "dernier_coup_du_monstre",
};
// La catégorie de chaque sort de la réserve de départ (issue #12, critères d'acceptation).
const LIFESTEAL = [5, 9, 12];
const HEAL = [11, 13, 14, 17, 22, 24];

function categoryOf(number: number): string {
	if (LIFESTEAL.includes(number)) return "vol_de_vie";
	return HEAL.includes(number) ? "soin" : "degats";
}

const toolLinear = ({ constant, perGauge }: Linear) => ({
	constante: constant,
	par_jauge: perGauge,
});

function toolRecipe(recipe: Recipe) {
	if (recipe.kind === "bestStat") return { type: "meilleure_stat" };
	return {
		type: "parts",
		parts: Object.fromEntries(
			Object.entries(recipe.shares).map(([stat, share]) => [STAT[stat], share]),
		),
	};
}

function toolForm(form: Form) {
	switch (form.kind) {
		case "safe":
			return { type: "sur" };
		case "costly":
			return { type: "couteux", part_perdue: form.armyLossShare };
		case "conditional":
			return {
				type: "conditionnel",
				jauge: GAUGE[form.gauge],
				...(form.characterClass && { classe: CLASS[form.characterClass] }),
			};
		case "inverted":
			return { type: "inverse" };
	}
}

function toolEffect({ base, damage, heal }: Effect) {
	return {
		base: BASE[base],
		...(damage && { degats: toolLinear(damage) }),
		...(heal && { soin: toolLinear(heal) }),
	};
}

/** Ce qu'`ajouter_sort` reçoit pour ajouter `spell`. */
function toolInput(spell: Spell) {
	return {
		nom: spell.name,
		recette: toolRecipe(spell.recipe),
		forme: toolForm(spell.form),
		effet: toolEffect(spell.effect),
		poids: spell.weight,
		description: spell.description,
	};
}

/** Ce que les outils rendent d'un sort de la réserve de départ, sans image. */
function toolSpell(spell: Spell) {
	return {
		numero: spell.number,
		...toolInput(spell),
		categorie: categoryOf(spell.number),
		image: null,
	};
}

const STARTING_NUMBERS = Array.from({ length: 24 }, (_, index) => index + 1);
const [FIRST] = STARTING_POOL as [Spell];

// Un sort qui n'est pas dans la réserve de départ : dégâts selon 50 % de Vie et 50 % de Magie.
const NEW_SPELL = {
	nom: "Sort d'essai",
	recette: { type: "parts", parts: { vie: 50, magie: 50 } },
	forme: { type: "sur" },
	effet: { base: "stat_de_l_armee", degats: { constante: 0.9, par_jauge: 0 } },
	description: "Dégâts selon 50 % de la Vie et 50 % de la Magie.",
};

const SPELL_TOOLS = ["lister_sorts", "ajouter_sort", "modifier_sort"];
const nonBlank = expect.stringMatching(/\S/);

const sha256 = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
/** Ce que l'audit garde d'une image : sa taille et son empreinte, pas ses octets. */
const fingerprint = (bytes: Uint8Array) => ({
	taille: bytes.length,
	sha256: sha256(bytes),
});

async function listSpellsThroughTool(client: Client) {
	const { sorts } = outputOf(
		await client.callTool({ name: "lister_sorts" }),
	) as { sorts: { numero: number }[] };
	return sorts;
}

/** Le sort n° 1 tel que `lister_sorts` le rend. */
async function firstSpell(client: Client) {
	return (await listSpellsThroughTool(client))[0];
}

/**
 * Appelle `tool` avec `args` sur une base neuve : refusé, une seule ligne d'audit de l'outil, en
 * erreur, garde l'entrée reçue et le message rendu. Rend le client, pour vérifier que rien n'est écrit.
 */
async function expectRefusal(
	tool: string,
	args: Record<string, unknown>,
	message: string,
): Promise<Client> {
	const { db, client } = await connectToRegistry();
	const result = await client.callTool({ name: tool, arguments: args });
	const rows = (await auditRows(db)).filter((row) => row.tool === tool);
	expect(rows).toEqual([
		expect.objectContaining({ input: args, succeeded: false }),
	]);
	expect(rows[0]?.error).toContain(message);
	expect(result).toMatchObject({
		content: [{ type: "text", text: rows[0]?.error }],
		isError: true,
	});
	return client;
}

describe("outils des sorts : tools/list", () => {
	test("publie chaque outil et chacun de ses champs sous son nom français, avec une description", () => {
		const described = publishedTools(SPELL_TOOLS).flatMap(
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
		expect(described).toEqual([
			["lister_sorts", nonBlank],
			["ajouter_sort", nonBlank],
			...["nom", "recette", "forme", "effet", "poids", "description"].map(
				(field) => [`ajouter_sort.${field}`, nonBlank],
			),
			["modifier_sort", nonBlank],
			...["numero", "poids", "description", "image"].map((field) => [
				`modifier_sort.${field}`,
				nonBlank,
			]),
		]);
	});

	test("publie le titre, les annotations et un schéma de sortie strict ; modifier_sort est destructeur", () => {
		const strict = expect.objectContaining({
			type: "object",
			additionalProperties: false,
		});
		expect(
			publishedTools(SPELL_TOOLS).map(
				({ name, title, annotations, outputSchema }) => ({
					name,
					title,
					annotations,
					outputSchema,
				}),
			),
		).toEqual([
			{
				name: "lister_sorts",
				title: "Lister les sorts de la réserve",
				annotations: {
					readOnlyHint: true,
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false,
				},
				outputSchema: strict,
			},
			{
				name: "ajouter_sort",
				title: "Ajouter un sort à la réserve",
				annotations: {
					readOnlyHint: false,
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false,
				},
				outputSchema: strict,
			},
			{
				name: "modifier_sort",
				title: "Modifier un sort de la réserve",
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
					idempotentHint: true,
					openWorldHint: false,
				},
				outputSchema: strict,
			},
		]);
	});

	test("publie qu'au moins un champ, outre le numéro, est requis par modifier_sort", () => {
		const [update] = publishedTools(["modifier_sort"]);
		expect(update?.inputSchema).toMatchObject({
			required: ["numero"],
			minProperties: 2,
		});
	});
});

describe("lister_sorts sur la réserve de départ", () => {
	// Une base migrée neuve, que l'outil ne fait que lire.
	let db: ReturnType<typeof createClient>;
	let listed: { numero: number; categorie: string }[];
	beforeAll(async () => {
		db = createClient(await createMigratedDatabase(inject("testDatabaseUrl")));
		const { structuredContent } = await callTool(
			registry,
			db,
			"lister_sorts",
			{},
		);
		listed = (structuredContent as { sorts: typeof listed }).sorts;
	});
	afterAll(() => db.$client.end());

	test("rend 24 sorts, numérotés de 1 à 24", () => {
		expect(listed.map(({ numero }) => numero)).toEqual(STARTING_NUMBERS);
	});

	test.each(
		STARTING_POOL.map((spell) => [spell.number, spell.name, spell] as const),
	)(
		"rend le sort n° %i, %s, tel que la réserve de départ le décrit",
		(number, _, spell) => {
			expect(listed.find(({ numero }) => numero === number)).toEqual(
				toolSpell(spell),
			);
		},
	);

	test("rend Vol de vie pour les n° 5, 9 et 12, Soin pour les n° 11, 13, 14, 17, 22 et 24, Dégâts pour les 15 autres", () => {
		const numbersOf = (category: string) =>
			listed
				.filter(({ categorie }) => categorie === category)
				.map(({ numero }) => numero);
		expect(numbersOf("vol_de_vie")).toEqual([5, 9, 12]);
		expect(numbersOf("soin")).toEqual([11, 13, 14, 17, 22, 24]);
		expect(numbersOf("degats")).toHaveLength(15);
	});
});

describe("ajouter_sort", () => {
	test("un sort neuf prend le n° 25 et le poids 1 sans poids donné ; lister_sorts le rend ; l'audit garde le sort créé", async () => {
		const { db, client } = await connectToRegistry();
		const created = {
			numero: 25,
			...NEW_SPELL,
			categorie: "degats",
			poids: 1,
			image: null,
		};
		const result = await client.callTool({
			name: "ajouter_sort",
			arguments: NEW_SPELL,
		});
		expect(outputOf(result)).toEqual(created);
		expect(await listSpellsThroughTool(client)).toContainEqual(created);
		expect(
			(await auditRows(db)).filter(({ tool }) => tool === "ajouter_sort"),
		).toEqual([
			expect.objectContaining({
				input: NEW_SPELL,
				succeeded: true,
				before: null,
				after: created,
			}),
		]);
	});

	test("un nom de 100 caractères et une description de 500 sont acceptés", async () => {
		const { client } = await connectToRegistry();
		const longest = {
			...NEW_SPELL,
			nom: "n".repeat(100),
			description: "d".repeat(500),
		};
		const result = await client.callTool({
			name: "ajouter_sort",
			arguments: longest,
		});
		expect(outputOf(result)).toMatchObject(longest);
	});

	test("un sort de poids 0 est accepté", async () => {
		const { client } = await connectToRegistry();
		const result = await client.callTool({
			name: "ajouter_sort",
			arguments: { ...NEW_SPELL, poids: 0 },
		});
		expect(outputOf(result)).toMatchObject({ numero: 25, poids: 0 });
	});

	// Le dénombrement des refus d'un ajout : chaque règle de validité de l'issue #12 (« Règles de
	// validité », « Sort mixte au plus ×1,0 »), puis le schéma strict.
	test.each<[string, Record<string, unknown>, string]>([
		[
			"une part de recette non entière",
			{
				...NEW_SPELL,
				recette: { type: "parts", parts: { vie: 50.5, magie: 49.5 } },
			},
			"doit être un entier de 1 à 100, reçu : 50.5",
		],
		[
			"une recette qui ne fait pas 100 %",
			{
				...NEW_SPELL,
				recette: { type: "parts", parts: { vie: 50, magie: 40 } },
			},
			"les parts de la recette doivent faire 100 %, reçu : 90 %",
		],
		[
			"un poids négatif",
			{ ...NEW_SPELL, poids: -1 },
			"le poids doit être un nombre fini ≥ 0, reçu : -1",
		],
		[
			"une description vide",
			{ ...NEW_SPELL, description: "" },
			"la description ne doit pas être vide",
		],
		[
			"un sort mixte à dégâts ×0,6 + soin ×0,5",
			{
				...NEW_SPELL,
				effet: {
					base: "stat_de_l_armee",
					degats: { constante: 0.6, par_jauge: 0 },
					soin: { constante: 0.5, par_jauge: 0 },
				},
			},
			"dégâts + soin d'un sort mixte doivent rester au plus 1",
		],
		[
			"un nom de plus de 100 caractères",
			{ ...NEW_SPELL, nom: "n".repeat(101) },
			"<=100 characters",
		],
		[
			"une description de plus de 500 caractères",
			{ ...NEW_SPELL, description: "d".repeat(501) },
			"<=500 characters",
		],
		[
			"une stat inconnue dans la recette",
			{
				...NEW_SPELL,
				recette: { type: "parts", parts: { vie: 50, chance: 50 } },
			},
			'Unrecognized key: "chance"',
		],
		[
			"un champ inconnu",
			{ ...NEW_SPELL, numero: 3 },
			'Unrecognized key: "numero"',
		],
		[
			"une classe inconnue",
			{
				...NEW_SPELL,
				forme: {
					type: "conditionnel",
					jauge: "part_d_une_classe",
					classe: "dragon",
				},
			},
			"Invalid option",
		],
	])(
		"%s : refusé, une ligne d'audit en erreur avec l'entrée reçue, rien d'écrit",
		async (_, args, message) => {
			const client = await expectRefusal("ajouter_sort", args, message);
			expect(await listSpellsThroughTool(client)).toHaveLength(24);
		},
	);

	test("chaque classe nommée s'écrit en français et se garde sous la classe du modèle", async () => {
		const { db, client } = await connectToRegistry();
		for (const name of Object.values(CLASS)) {
			outputOf(
				await client.callTool({
					name: "ajouter_sort",
					arguments: {
						...NEW_SPELL,
						nom: name,
						forme: {
							type: "conditionnel",
							jauge: "part_d_une_classe",
							classe: name,
						},
					},
				}),
			);
		}
		const added = (await listSpells(db))
			.slice(STARTING_NUMBERS.length)
			.map(({ name, form }) => [
				name,
				(form as Form & { characterClass?: string }).characterClass,
			]);
		expect(added).toEqual(
			Object.entries(CLASS).map(([model, name]) => [name, model]),
		);
	});

	// L'unicité ne tient qu'à la clé que l'outil calcule : chaque sort de la réserve, rendu dans le
	// vocabulaire des outils sous un autre nom, est un doublon.
	test.each(
		STARTING_POOL.map((spell) => [spell.number, spell.name, spell] as const),
	)(
		"le doublon du sort n° %i, %s : refusé, le message nomme le sort existant, rien d'écrit",
		async (number, name, spell) => {
			const { client } = await connectToRegistry();
			const result = await client.callTool({
				name: "ajouter_sort",
				arguments: {
					...toolInput(spell),
					nom: "Copie",
					description: "Une copie.",
				},
			});
			expect(result).toMatchObject({
				content: [
					{ text: expect.stringContaining(`n° ${number}, « ${name} »`) },
				],
				isError: true,
			});
			expect(await listSpellsThroughTool(client)).toHaveLength(24);
		},
	);
});

describe("modifier_sort", () => {
	test("change le poids et la description, rend le sort après, et l'audit garde l'avant et l'après", async () => {
		const { db, client } = await connectToRegistry();
		const before = toolSpell(FIRST);
		const after = { ...before, poids: 2.5, description: "Nouvelle phrase." };
		const args = { numero: 1, poids: 2.5, description: "Nouvelle phrase." };
		const result = await client.callTool({
			name: "modifier_sort",
			arguments: args,
		});
		expect(outputOf(result)).toEqual(after);
		expect(await firstSpell(client)).toEqual(after);
		expect(
			(await auditRows(db)).filter(({ tool }) => tool === "modifier_sort"),
		).toEqual([
			expect.objectContaining({ input: args, succeeded: true, before, after }),
		]);
	});

	test.each(IMAGE_FORMATS)(
		"%s de 1 200 × 900 est accepté : lister_sorts rend son type, sa taille et son empreinte, jamais ses octets",
		async (_, type, build) => {
			const { client } = await connectToRegistry();
			const bytes = build(1200, 900);
			const image = { type, ...fingerprint(bytes) };
			const result = await client.callTool({
				name: "modifier_sort",
				arguments: { numero: 1, image: base64(bytes) },
			});
			expect(outputOf(result)).toMatchObject({ numero: 1, image });
			const listing = await client.callTool({ name: "lister_sorts" });
			expect((outputOf(listing) as { sorts: unknown[] }).sorts[0]).toEqual({
				...toolSpell(FIRST),
				image,
			});
			expect(JSON.stringify(listing)).not.toContain(base64(bytes));
		},
	);

	test("une image de 3 000 000 octets est acceptée", async () => {
		const { client } = await connectToRegistry();
		const bytes = png(1200, 900, 3_000_000);
		const result = await client.callTool({
			name: "modifier_sort",
			arguments: { numero: 1, image: base64(bytes) },
		});
		expect(outputOf(result)).toMatchObject({
			image: { type: "image/png", taille: 3_000_000, sha256: sha256(bytes) },
		});
	});

	test("image null retire l'image, sans toucher au reste", async () => {
		const { client } = await connectToRegistry();
		await client.callTool({
			name: "modifier_sort",
			arguments: { numero: 1, image: base64(png(1200, 900)) },
		});
		const result = await client.callTool({
			name: "modifier_sort",
			arguments: { numero: 1, image: null },
		});
		expect(outputOf(result)).toEqual(toolSpell(FIRST));
	});

	// Le dénombrement des refus d'une modification sans image : le schéma strict (un champ du sort
	// que l'outil ne change pas, un numéro seul), le numéro inconnu, puis les règles de validité
	// qu'une modification peut enfreindre.
	test.each<[string, Record<string, unknown>, string]>([
		["le nom", { numero: 1, nom: "Autre nom" }, 'Unrecognized key: "nom"'],
		[
			"la recette",
			{ numero: 1, recette: { type: "meilleure_stat" } },
			'Unrecognized key: "recette"',
		],
		["le numéro seul", { numero: 1 }, "Rien à modifier"],
		[
			"un numéro inconnu",
			{ numero: 999, poids: 2 },
			"Aucun sort de numéro 999.",
		],
		[
			"un poids négatif",
			{ numero: 1, poids: -1 },
			"le poids doit être un nombre fini ≥ 0, reçu : -1",
		],
		[
			"une description blanche",
			{ numero: 1, description: " \t" },
			"la description ne doit pas être vide",
		],
	])(
		"%s : refusé, une ligne d'audit en erreur avec l'entrée reçue, rien d'écrit",
		async (_, args, message) => {
			const client = await expectRefusal("modifier_sort", args, message);
			expect(await firstSpell(client)).toEqual(toolSpell(FIRST));
		},
	);

	// Le dénombrement des refus d'une image (issue #12, « Image ») : type, fin, dimensions, taille et
	// encodage, puis le schéma strict, qui refuse l'entrée avant que l'outil ne la lise.
	const NOT_AN_IMAGE = "l'image doit être un fichier PNG, JPEG ou WebP complet";
	const TOO_SMALL = "l'image doit faire au moins 1 200 × 900 px";
	test.each<[string, string, Record<string, unknown>, string]>([
		["un GIF", base64(gif(1200, 900)), {}, NOT_AN_IMAGE],
		[
			"des octets quelconques",
			base64(new TextEncoder().encode("Ceci n'est pas une image.")),
			{},
			NOT_AN_IMAGE,
		],
		[
			"un PNG tronqué",
			base64(png(1200, 900).subarray(0, 56)),
			{},
			NOT_AN_IMAGE,
		],
		["un PNG de 1 199 × 900", base64(png(1199, 900)), {}, TOO_SMALL],
		["un PNG de 1 200 × 899", base64(png(1200, 899)), {}, TOO_SMALL],
		[
			"un PNG de 3 000 001 octets",
			base64(png(1200, 900, 3_000_001)),
			{},
			"l'image doit faire au plus 3 000 000 octets",
		],
		["un texte qui n'est pas du base64", "pas du base64 !", {}, "base64"],
		[
			"un PNG valide avec un champ inconnu",
			base64(png(1200, 900)),
			{ inconnu: 1 },
			'Unrecognized key: "inconnu"',
		],
	])(
		"%s : refusé, rien d'écrit, l'audit garde la taille et l'empreinte de l'image, jamais son texte",
		async (_, image, extra, message) => {
			const { db, client } = await connectToRegistry();
			const args = { numero: 1, image, ...extra };
			const result = await client.callTool({
				name: "modifier_sort",
				arguments: args,
			});
			expect(result).toMatchObject({
				content: [{ text: expect.stringContaining(message) }],
				isError: true,
			});
			expect(await firstSpell(client)).toEqual(toolSpell(FIRST));
			const rows = await auditRows(db);
			expect(JSON.stringify(rows)).not.toContain(image);
			expect(rows.filter(({ tool }) => tool === "modifier_sort")).toEqual([
				expect.objectContaining({
					input: {
						...args,
						image: fingerprint(Buffer.from(image, "base64")),
					},
					succeeded: false,
				}),
			]);
		},
	);

	test("une image acceptée : l'audit garde sa taille et son empreinte, jamais son texte", async () => {
		const { db, client } = await connectToRegistry();
		const bytes = png(1200, 900);
		await client.callTool({
			name: "modifier_sort",
			arguments: { numero: 1, image: base64(bytes) },
		});
		const rows = await auditRows(db);
		expect(JSON.stringify(rows)).not.toContain(base64(bytes));
		expect(rows.filter(({ tool }) => tool === "modifier_sort")).toEqual([
			expect.objectContaining({
				input: { numero: 1, image: fingerprint(bytes) },
				succeeded: true,
				after: expect.objectContaining({
					image: { type: "image/png", ...fingerprint(bytes) },
				}),
			}),
		]);
	});
});

// Le poids fini, que l'entrée JSON ne sait pas enfreindre : le corps brut porte `1e999`.
test.each<[string, Record<string, unknown>]>([
	["ajouter_sort", NEW_SPELL],
	["modifier_sort", { numero: 1 }],
])("%s avec un poids infini : refusé, rien d'écrit", async (tool, args) => {
	const { client } = await connectToRegistry();
	const result = await client.callTool({
		name: tool,
		arguments: { ...args, poids: INFINITE },
	});
	expect(result).toMatchObject({
		content: [
			{ text: expect.stringContaining("expected number, received Infinity") },
		],
		isError: true,
	});
	expect(await listSpellsThroughTool(client)).toEqual(
		STARTING_POOL.map(toolSpell),
	);
});

test("les classes du modèle de combat sont celles de personnages (épinglé par pnpm -r typecheck)", () => {
	expectTypeOf<CharacterClass>().toEqualTypeOf<ClassKey>();
});
