import type { Client } from "@modelcontextprotocol/client";
import {
	type MonsterDesign,
	STARTING_POOL,
	type Spell,
	scaleFactor,
} from "combat";
import {
	type Executor,
	listMonsters,
	modelFiles,
	type NewMonster,
	updateSpell,
} from "donnees";
import { freshDatabase, injectFailure } from "donnees/test/base-neuve";
import { simulationArmies } from "personnages";
import { glb } from "personnages/test/glb";
import { describe, expect, test } from "vitest";
import { createMonsterTool } from "../app/mcp/monster-tools.ts";
import { createMcpEndpoint } from "../app/mcp/server.ts";
import { CONFORMING } from "./fichiers-3d.ts";
import {
	auditOf,
	codeFor,
	confirmationOf,
	connectClient,
	connectToRegistry,
	expectRefusal,
	INFINITE,
	nonBlank,
	outputOf,
	publishedTools,
	registry,
	TOKEN,
} from "./montage.ts";
import { storeMonster } from "./monstres.ts";
import { base64 } from "./octets.ts";

const MONSTER_TOOLS = ["lister_monstres", "creer_monstre", "retirer_monstre"];

// L'échantillon réduit des tests : les graines 1 à 20, contre 2 000 dans le registre.
const LAST_SEED = 20;

/** Une attaque de Force, au coefficient moyen ×0,78 sans autre coefficient donné. */
const strike = (nom: string, coefficient = 0.78) => ({
	nom,
	recette: { force: 100 },
	coefficient,
});

// Le golem de lave du game design (§ 3, « Profil »), aux attaques de référence, dans le vocabulaire
// des outils.
const GOLEM = {
	saison: 1,
	chapitre: 1,
	nom: "Golem de lave",
	profil: { vie: 1.5, force: 1, magie: 1, vitesse: 0.5 },
	attaques: [
		{ nom: "Griffes", recette: { force: 100 }, coefficient: 0.78 },
		{ nom: "Sortilège", recette: { magie: 100 }, coefficient: 0.78 },
	],
	particularite: "Sa peau de lave brûle qui la frappe.",
};

// Le profil à Magie ×0,5 et les deux attaques de Force de l'issue #20 (Décisions, 1), dans les deux
// vocabulaires : simulé aux attaques de référence, il recevrait un autre facteur.
const SPECTER = {
	...GOLEM,
	nom: "Spectre",
	profil: { vie: 1, force: 1, magie: 0.5, vitesse: 1 },
	attaques: [strike("Poing"), strike("Écrasement")],
};
const SPECTER_DESIGN: MonsterDesign = {
	profile: { life: 1, strength: 1, magic: 0.5, speed: 1 },
	attacks: [
		{ name: "Poing", recipe: { strength: 100 }, coefficient: 0.78 },
		{ name: "Écrasement", recipe: { strength: 100 }, coefficient: 0.78 },
	],
};

// La limace de `storeMonster`, dans le vocabulaire des outils.
const SLUG = {
	saison: 1,
	chapitre: 1,
	nom: "limace",
	profil: { vie: 1.5, force: 0.8, magie: 1.2, vitesse: 0.5 },
	attaques: [
		{ nom: "Griffes", recette: { force: 100 }, coefficient: 0.78 },
		{ nom: "Sortilège", recette: { magie: 100 }, coefficient: 0.78 },
	],
	facteur_echelle: 1.1,
	particularite: "Laisse une traînée qui ralentit.",
};

/**
 * Le client officiel sur le registre réel, creer_monstre simulant sur les graines 1 à `LAST_SEED`,
 * et une base migrée neuve. Il liste les outils d'abord : chaque sortie se valide alors contre son
 * schéma publié.
 */
async function connect() {
	const db = await freshDatabase();
	const tools = registry.map((tool) =>
		tool.name === "creer_monstre" ? createMonsterTool(LAST_SEED) : tool,
	);
	const client = await connectClient(
		createMcpEndpoint({ token: () => TOKEN, database: () => db, tools }),
	);
	await client.listTools();
	return { db, client };
}

function call(client: Client, name: string, args: Record<string, unknown>) {
	return client.callTool({ name, arguments: args });
}

/** Le retrait de `nom`, confirmé par le code de l'appel sans code. */
async function confirmedRemoval(client: Client, nom: string) {
	const code = await codeFor(client, "retirer_monstre", { nom });
	return call(client, "retirer_monstre", { nom, code });
}

/** Les fichiers 3D rangés, chacun avec le nom de son monstre. */
function filesOf(db: Executor) {
	return db
		.select({ id: modelFiles.id, monster: modelFiles.monster })
		.from(modelFiles);
}

describe("outils des monstres : tools/list", () => {
	test("publie lister_monstres en lecture seule, creer_monstre, qui ajoute, et retirer_monstre, qui supprime, avec le code de la confirmation ; des schémas de sortie stricts, chaque champ d'entrée décrit", () => {
		const strict = expect.objectContaining({
			type: "object",
			additionalProperties: false,
		});
		expect(
			publishedTools(MONSTER_TOOLS).map(
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
				name: "lister_monstres",
				title: "Lister les monstres du bestiaire",
				annotations: {
					readOnlyHint: true,
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false,
				},
				fields: [],
				outputSchema: strict,
			},
			{
				name: "creer_monstre",
				title: "Créer un monstre",
				annotations: {
					readOnlyHint: false,
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false,
				},
				fields: [
					"saison",
					"chapitre",
					"nom",
					"profil",
					"attaques",
					"particularite",
				].map((field) => [field, nonBlank]),
				outputSchema: strict,
			},
			{
				name: "retirer_monstre",
				title: "Retirer un monstre",
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
					idempotentHint: true,
					openWorldHint: false,
				},
				fields: ["nom", "code"].map((field) => [field, nonBlank]),
				outputSchema: strict,
			},
		]);
	});

	test("creer_monstre simule, dans le registre, sur les graines 1 à 2 000", () => {
		const [create] = publishedTools(["creer_monstre"]);
		expect(create?.description).toContain("sur les graines 1 à 2 000");
	});

	test("creer_monstre et son champ attaques disent les règles du game design § 3 : de 2 à 4 attaques, de coefficient moyen ×0,78", () => {
		const [create] = publishedTools(["creer_monstre"]);
		const attacks = create?.inputSchema.properties?.attaques as {
			description?: string;
		};
		for (const text of [create?.description, attacks.description]) {
			expect(text).toMatch(/de 2 à 4 attaques/i);
			expect(text).toContain("×0,78 au centième");
		}
	});
});

// Le format saisi de creer_monstre, balayé en une passe sur son schéma d'entrée : chaque champ, à
// toute profondeur, absent puis d'un autre type ; un champ inconnu dans chaque objet ; chaque texte
// aux deux bords de sa borne. L'enrobage fait de chaque refus du schéma un refus audité (`tool.ts`).
type Path = readonly (string | number)[];
type Node = Record<string | number, unknown>;
type JsonSchema = {
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
};

/** Le golem copié en profondeur, le parent du bout de `path` passé à `edit` avec sa clé. */
function edited(
	path: Path,
	edit: (parent: Node, key: string | number) => void,
): Node {
	const input: Node = structuredClone(GOLEM);
	const parent = path
		.slice(0, -1)
		.reduce<Node>((node, key) => node[key] as Node, input);
	edit(parent, path.at(-1) as string | number);
	return input;
}

const without = (path: Path) =>
	edited(path, (parent, key) => {
		delete parent[key];
	});
const replaced = (path: Path, value: unknown) =>
	edited(path, (parent, key) => {
		parent[key] = value;
	});

/** Les refus du schéma d'entrée de creer_monstre pour `input` : le code et le chemin de chacun. */
function issuesOf(input: unknown) {
	const parsed = createMonsterTool(LAST_SEED).input.safeParse(input);
	return parsed.success
		? []
		: parsed.error.issues.map(({ code, path }) => ({ code, path }));
}

/** Le chemin de chaque propriété d'un schéma JSON, à toute profondeur ; un élément de tableau, 0. */
function propertyPaths(schema: JsonSchema, path: Path = []): Path[] {
	if (schema.items) {
		return propertyPaths(schema.items, [...path, 0]);
	}
	return Object.entries(schema.properties ?? {}).flatMap(([name, child]) => [
		[...path, name],
		...propertyPaths(child, [...path, name]),
	]);
}

// Chaque champ requis et une valeur d'un autre type ; puis les deux parts facultatives d'une recette.
const REQUIRED: [Path, unknown][] = [
	[["saison"], "1"],
	[["chapitre"], "1"],
	[["nom"], 1],
	[["profil"], "1"],
	[["profil", "vie"], "1"],
	[["profil", "force"], "1"],
	[["profil", "magie"], "1"],
	[["profil", "vitesse"], "1"],
	[["attaques"], {}],
	[["attaques", 0, "nom"], 1],
	[["attaques", 0, "recette"], "100"],
	[["attaques", 0, "coefficient"], "0.78"],
	[["particularite"], 1],
];
const OPTIONAL: [Path, unknown][] = [
	[["attaques", 0, "recette", "force"], "100"],
	[["attaques", 0, "recette", "magie"], "100"],
];
const OBJECTS: Path[] = [
	[],
	["profil"],
	["attaques", 0],
	["attaques", 0, "recette"],
];
const TEXTS: [Path, number][] = [
	[["nom"], 64],
	[["attaques", 0, "nom"], 100],
	[["particularite"], 500],
];

describe("creer_monstre : le format saisi", () => {
	test("le balayage compte chaque champ que publie le schéma d'entrée, à toute profondeur", () => {
		const [create] = publishedTools(["creer_monstre"]);
		const published = propertyPaths(create?.inputSchema as JsonSchema);
		const swept = [...REQUIRED, ...OPTIONAL].map(([path]) => path);
		expect(published.map(String).sort()).toEqual(swept.map(String).sort());
	});

	test("le golem de lave passe le schéma", () => {
		expect(issuesOf(GOLEM)).toEqual([]);
	});

	test.each(REQUIRED)("%j absent : refusé à ce champ", (path) => {
		expect(issuesOf(without(path))).toEqual([{ code: "invalid_type", path }]);
	});

	test.each([...REQUIRED, ...OPTIONAL])(
		"%j valant %j : refusé à ce champ",
		(path, value) => {
			expect(issuesOf(replaced(path, value))).toEqual([
				{ code: "invalid_type", path },
			]);
		},
	);

	test.each(OBJECTS.map((path) => [path]))(
		"un champ inconnu sous %j : refusé",
		(path) => {
			expect(issuesOf(replaced([...path, "inconnu"], 1))).toEqual([
				{ code: "unrecognized_keys", path },
			]);
		},
	);

	// Un caractère hors du plan multilingue de base, deux unités UTF-16, compte pour un, comme dans
	// la base (`MAX_MONSTER_NAME_LENGTH`).
	test.each(TEXTS)(
		"%j, de 1 à %i caractères sans les blancs qui l'entourent : blanc refusé, à la borne accepté, au-delà refusé",
		(path, max) => {
			expect(issuesOf(replaced(path, " \t"))).toEqual([
				{ code: "too_small", path },
			]);
			for (const character of ["x", String.fromCodePoint(0x1f40c)]) {
				expect(issuesOf(replaced(path, ` ${character.repeat(max)} `))).toEqual(
					[],
				);
				expect(issuesOf(replaced(path, character.repeat(max + 1)))).toEqual([
					{ code: "too_big", path },
				]);
			}
		},
	);
});

describe("creer_monstre", () => {
	test("le golem de lave est créé, rangé dans le modèle de combat, et rendu comme lister_monstres le rend, avec son facteur d'échelle ; l'audit garde l'entrée et l'après", async () => {
		const { db, client } = await connect();
		const created = outputOf(await call(client, "creer_monstre", GOLEM));
		expect(created).toEqual({ ...GOLEM, facteur_echelle: expect.any(Number) });
		expect(await listMonsters(db)).toEqual([
			{
				id: 1,
				season: 1,
				chapter: 1,
				name: GOLEM.nom,
				profile: { life: 1.5, strength: 1, magic: 1, speed: 0.5 },
				attacks: [
					{ name: "Griffes", recipe: { strength: 100 }, coefficient: 0.78 },
					{ name: "Sortilège", recipe: { magic: 100 }, coefficient: 0.78 },
				],
				scaleFactor: (created as { facteur_echelle: number }).facteur_echelle,
				trait: GOLEM.particularite,
			},
		]);
		expect(outputOf(await call(client, "lister_monstres", {}))).toEqual({
			monstres: [created],
		});
		expect(await auditOf(db, "creer_monstre")).toEqual([
			expect.objectContaining({
				input: GOLEM,
				succeeded: true,
				before: null,
				after: created,
			}),
		]);
	});

	test("des coefficients 0,50 et 1,06, de moyenne 0,78 : acceptés", async () => {
		const { client } = await connect();
		const attaques = [strike("Griffes", 0.5), strike("Morsure", 1.06)];
		expect(
			outputOf(await call(client, "creer_monstre", { ...GOLEM, attaques })),
		).toMatchObject({ attaques });
	});

	// Les armées ne tirent que Coup d'épée, pour que la réserve en base diffère de celle de départ.
	test("le facteur d'échelle rangé est celui de scaleFactor pour son profil et ses attaques, sur les graines 1 à 20, les armées tirées dans la réserve en base", async () => {
		const { db, client } = await connect();
		const drawn = 1;
		for (const { number } of STARTING_POOL) {
			if (number !== drawn) {
				await updateSpell(db, number, { weight: 0 });
			}
		}
		const pool = STARTING_POOL.map((spell) =>
			spell.number === drawn ? spell : { ...spell, weight: 0 },
		);
		const armies = simulationArmies<Spell>();
		const factor = scaleFactor(SPECTER_DESIGN, {
			seeds: Array.from({ length: LAST_SEED }, (_, index) => String(index + 1)),
			armyOf: (seed) => armies(seed, pool),
		});

		const created = outputOf(await call(client, "creer_monstre", SPECTER));

		expect(created).toMatchObject({ facteur_echelle: factor });
		expect(await listMonsters(db)).toEqual([
			expect.objectContaining({
				name: SPECTER.nom,
				...SPECTER_DESIGN,
				scaleFactor: factor,
			}),
		]);
	});

	test("un profil à Vie ×0, qu'aucun facteur de ÷8 à ×8 n'équilibre : refusé, le message le dit, une ligne d'audit en erreur, aucun monstre écrit", async () => {
		const { db, client } = await connect();
		const args = { ...GOLEM, profil: { ...GOLEM.profil, vie: 0 } };
		const message =
			"aucun facteur d'échelle de ÷8 à ×8 ne laisse 50 % de victoires à l'armée";
		expect(await call(client, "creer_monstre", args)).toMatchObject({
			content: [{ type: "text", text: message }],
			isError: true,
		});
		expect(await auditOf(db, "creer_monstre")).toEqual([
			expect.objectContaining({
				input: args,
				succeeded: false,
				error: message,
			}),
		]);
		expect(await listMonsters(db)).toEqual([]);
	});
});

describe("creer_monstre : les refus", () => {
	const ORDINALS = { saison: "une saison", chapitre: "un chapitre" };

	// Les refus de `validateMonster`, rendus comme ceux de `validateSpell` par ajouter_sort, et ceux
	// du schéma qui les côtoient ; tous avant la simulation.
	test.each<[string, Record<string, unknown>, string]>([
		[
			"une seule attaque",
			{ ...GOLEM, attaques: [strike("Griffes")] },
			"un monstre doit avoir de 2 à 4 attaques, reçu : 1",
		],
		[
			"cinq attaques",
			{
				...GOLEM,
				attaques: ["Griffes", "Morsure", "Charge", "Souffle", "Queue"].map(
					(nom) => strike(nom),
				),
			},
			"un monstre doit avoir de 2 à 4 attaques, reçu : 5",
		],
		[
			"des coefficients 0,50 et 1,08, de moyenne 0,79",
			{ ...GOLEM, attaques: [strike("Griffes", 0.5), strike("Morsure", 1.08)] },
			"le coefficient moyen des attaques doit valoir 0.78 au centième, reçu : 0.79",
		],
		[
			"deux attaques du même nom",
			{ ...GOLEM, attaques: [strike("Griffes"), strike("Griffes")] },
			"le nom d'attaque « Griffes » doit être unique dans le monstre",
		],
		[
			"une recette sur la Vie",
			{
				...GOLEM,
				attaques: [
					strike("Griffes"),
					{ nom: "Étreinte", recette: { vie: 100 }, coefficient: 0.78 },
				],
			},
			'Unrecognized key: "vie"',
		],
		[
			"une recette de somme 90",
			{
				...GOLEM,
				attaques: [
					strike("Griffes"),
					{
						nom: "Morsure",
						recette: { force: 60, magie: 30 },
						coefficient: 0.78,
					},
				],
			},
			"l'attaque « Morsure » : les parts de la recette doivent faire 100 %, reçu : 90 %",
		],
		[
			"un coefficient nul",
			{ ...GOLEM, attaques: [strike("Griffes", 0), strike("Morsure", 1.56)] },
			"l'attaque « Griffes » : le coefficient doit être un nombre fini > 0, reçu : 0",
		],
		[
			"un multiplicateur négatif",
			{ ...GOLEM, profil: { ...GOLEM.profil, vie: -1 } },
			"le multiplicateur « life » du profil doit être un nombre fini ≥ 0, reçu : -1",
		],
		...Object.entries(ORDINALS).flatMap(
			([field, label]): [string, Record<string, unknown>, string][] => [
				[`${label} 0`, { ...GOLEM, [field]: 0 }, ">=1"],
				[
					`${label} de 1,5`,
					{ ...GOLEM, [field]: 1.5 },
					"expected int, received number",
				],
				[
					`${label} de 2 147 483 648, au-delà du plus grand entier de Postgres`,
					{ ...GOLEM, [field]: 2_147_483_648 },
					"<=2147483647",
				],
			],
		),
	])(
		"%s : refusé, une ligne d'audit en erreur avec l'entrée reçue, aucun monstre écrit",
		async (_, args, message) => {
			const { db } = await expectRefusal("creer_monstre", args, message);
			expect(await listMonsters(db)).toEqual([]);
		},
	);

	// Le fini, que l'entrée JSON ne sait pas enfreindre : le corps brut porte `1e999`.
	test.each<[string, Record<string, unknown>]>([
		[
			"un multiplicateur infini",
			{ ...GOLEM, profil: { ...GOLEM.profil, force: INFINITE } },
		],
		[
			"un coefficient infini",
			{
				...GOLEM,
				attaques: [
					strike("Griffes"),
					{ nom: "Morsure", recette: { force: 100 }, coefficient: INFINITE },
				],
			},
		],
	])("%s : refusé, aucun monstre écrit", async (_, args) => {
		const { db, client } = await connectToRegistry();
		expect(await call(client, "creer_monstre", args)).toMatchObject({
			content: [
				{ text: expect.stringContaining("expected number, received Infinity") },
			],
			isError: true,
		});
		expect(await listMonsters(db)).toEqual([]);
	});

	// Sur le registre réel, aux graines 1 à 2 000 : sans la lecture préalable, la simulation passerait
	// de loin le délai du test. La limace occupe le chapitre 1 de la saison 1.
	test.each<[string, Record<string, unknown>, string]>([
		[
			"un deuxième monstre au même chapitre de la même saison",
			GOLEM,
			"la saison 1 a déjà un monstre au chapitre 1",
		],
		[
			"un nom déjà porté par un monstre d'une autre saison",
			{ ...GOLEM, saison: 2, nom: "limace" },
			"un monstre porte déjà le nom « limace », toutes saisons confondues",
		],
		[
			"un nom et un chapitre déjà pris",
			{ ...GOLEM, nom: "limace" },
			"un monstre porte déjà le nom « limace », toutes saisons confondues\nla saison 1 a déjà un monstre au chapitre 1",
		],
	])(
		"%s : refusé avant tout calcul, le message le dit, une ligne d'audit en erreur, la table inchangée",
		async (_, args, message) => {
			const { db, client } = await connectToRegistry();
			const slug = await storeMonster(db);
			expect(await call(client, "creer_monstre", args)).toMatchObject({
				content: [{ type: "text", text: message }],
				isError: true,
			});
			expect(await auditOf(db, "creer_monstre")).toEqual([
				expect.objectContaining({
					input: args,
					succeeded: false,
					error: message,
				}),
			]);
			expect(await listMonsters(db)).toEqual([slug]);
		},
	);

	// La course entre deux appels : le nom ou le chapitre pris après la lecture préalable, que la base
	// refuse sous sa contrainte d'unicité.
	test.each<[string, string]>([
		[
			"monsters_name_unique",
			"un monstre porte déjà le nom « Golem de lave », toutes saisons confondues",
		],
		[
			"monsters_season_chapter_unique",
			"la saison 1 a déjà un monstre au chapitre 1",
		],
	])(
		"pris entre la lecture et l'écriture, sous %s : refusé par le message de la lecture, aucun monstre écrit",
		async (constraint, message) => {
			const { db, client } = await connect();
			await injectFailure(db, {
				event: "insert",
				table: "monsters",
				code: "23505",
				constraint,
			});
			expect(await call(client, "creer_monstre", GOLEM)).toMatchObject({
				content: [{ type: "text", text: message }],
				isError: true,
			});
			expect(await listMonsters(db)).toEqual([]);
		},
	);
});

describe("lister_monstres", () => {
	test("rend les monstres par saison, puis par chapitre : saison, chapitre, nom, profil, attaques, facteur d'échelle, particularité ; une ligne d'audit", async () => {
		const { db, client } = await connectToRegistry();
		await storeMonster(db, { season: 2, chapter: 1, name: "Hydre" });
		await storeMonster(db, { chapter: 10, name: "Liche" });
		await storeMonster(db);
		expect(outputOf(await call(client, "lister_monstres", {}))).toEqual({
			monstres: [
				SLUG,
				{ ...SLUG, chapitre: 10, nom: "Liche" },
				{ ...SLUG, saison: 2, nom: "Hydre" },
			],
		});
		expect(await auditOf(db, "lister_monstres")).toEqual([
			expect.objectContaining({ input: {}, succeeded: true }),
		]);
	});

	// Le profil et les attaques d'une ligne se relisent avant d'être rendus : rien ne passe sur parole.
	test.each<[string, Partial<NewMonster>]>([
		["un profil sans Vitesse", { profile: { life: 1, strength: 1, magic: 1 } }],
		[
			"une recette sur la Vie",
			{
				attacks: [
					{ name: "Griffes", recipe: { strength: 100 }, coefficient: 0.78 },
					{ name: "Étreinte", recipe: { life: 100 }, coefficient: 0.78 },
				],
			},
		],
	])(
		"une ligne qui n'a pas la forme du modèle de combat, %s : refusée",
		async (_, fields) => {
			const { db, client } = await connectToRegistry();
			await storeMonster(db, fields);
			expect(await call(client, "lister_monstres", {})).toMatchObject({
				isError: true,
			});
		},
	);
});

describe("retirer_monstre", () => {
	test.each<[string, boolean, string]>([
		[
			"d'un monstre : sa ligne, et son chapitre libéré",
			true,
			"Retirera le monstre « limace », chapitre 1 de la saison 1 : sa ligne entière, profil, attaques, facteur d'échelle et particularité, et libérera ce chapitre pour creer_monstre. Ses fichiers 3D restent rangés sous son nom, qu'un monstre recréé sous ce nom retrouve. Sans annulation.",
		],
		[
			"d'un nom qu'aucun monstre ne porte : rien à retirer",
			false,
			"Aucun monstre ne porte le nom « limace » : rien à retirer.",
		],
	])(
		"sans code, le retrait %s : décrit, avec un code ; la table inchangée",
		async (_, stored, description) => {
			const { db, client } = await connectToRegistry();
			if (stored) {
				await storeMonster(db);
			}
			const before = await listMonsters(db);
			expect(
				confirmationOf(
					await call(client, "retirer_monstre", { nom: "limace" }),
				),
			).toEqual({
				description,
				code: expect.any(String),
				expiration: expect.any(String),
			});
			expect(await listMonsters(db)).toEqual(before);
		},
	);

	test("avec le code, retire le monstre et le rend, l'audit le gardant en avant ; rejoué, le code ne retire rien et le dit", async () => {
		const { db, client } = await connectToRegistry();
		await storeMonster(db);
		await storeMonster(db, { chapter: 2, name: "Hydre" });
		const code = await codeFor(client, "retirer_monstre", { nom: "limace" });
		const remove = () =>
			call(client, "retirer_monstre", { nom: "limace", code });

		expect(outputOf(await remove())).toEqual({
			resultat: { nom: "limace", retire: SLUG },
		});
		expect((await listMonsters(db)).map(({ name }) => name)).toEqual(["Hydre"]);
		expect(outputOf(await remove())).toEqual({
			resultat: { nom: "limace", retire: null },
		});
		expect(
			(await auditOf(db, "retirer_monstre")).map(({ succeeded, before }) => ({
				succeeded,
				before,
			})),
		).toEqual([
			{ succeeded: true, before: null },
			{ succeeded: true, before: SLUG },
			{ succeeded: true, before: null },
		]);
	});

	test("le chapitre libéré accepte un nouveau creer_monstre", async () => {
		const { db, client } = await connect();
		await storeMonster(db);
		outputOf(await confirmedRemoval(client, "limace"));
		const created = outputOf(await call(client, "creer_monstre", GOLEM));
		expect(outputOf(await call(client, "lister_monstres", {}))).toEqual({
			monstres: [created],
		});
	});

	test("un monstre retiré puis recréé sous le même nom retrouve ses fichiers 3D, que le retrait laisse rangés sous son nom", async () => {
		const { db, client } = await connect();
		outputOf(await call(client, "creer_monstre", GOLEM));
		const { identifiant } = outputOf(
			await call(client, "deposer_fichier_3d", {
				monstre: GOLEM.nom,
				contenu: base64(glb(CONFORMING)),
			}),
		) as { identifiant: number };
		const filed = [{ id: identifiant, monster: GOLEM.nom }];

		outputOf(await confirmedRemoval(client, GOLEM.nom));
		expect(await filesOf(db)).toEqual(filed);
		outputOf(await call(client, "creer_monstre", { ...GOLEM, chapitre: 2 }));

		expect(await filesOf(db)).toEqual(filed);
	});
});
