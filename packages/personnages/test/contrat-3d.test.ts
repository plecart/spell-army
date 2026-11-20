import { expect, test } from "vitest";
import {
	checkModel,
	describeDeviations,
	MODEL_RULES,
	type RuleId,
} from "../src/index.ts";
import { BIN_CHUNK, glb, glbOf, withWord } from "./glb.ts";

type JsonNode = { name: string; [field: string]: unknown };

// Un personnage conforme : chaque ancre porte une pièce, le sol à l'origine.
const NODES: JsonNode[] = [
	{ name: "sol", children: [5] }, // 0
	{ name: "tete", translation: [0, 1.6, 0], children: [2, 6] }, // 1
	{ name: "chapeau", translation: [0, 0.3, 0], children: [7] }, // 2
	{ name: "main_gauche", translation: [0.6, 0.9, 0], children: [8] }, // 3
	{ name: "main_droite", translation: [-0.6, 0.9, 0], children: [9] }, // 4
	{ name: "robe", mesh: 1 }, // 5
	{ name: "visage", mesh: 0 }, // 6
	{ name: "coiffe", mesh: 0 }, // 7
	{ name: "baton", mesh: 0 }, // 8
	{ name: "livre", mesh: 0 }, // 9
];
// « piece » compte ses triangles par ses indices, « tunique » par ses sommets, en mode implicite.
const PIECE = {
	name: "piece",
	primitives: [{ mode: 4, indices: 1, attributes: { POSITION: 0 } }],
};
const TUNIQUE = {
	name: "tunique",
	primitives: [{ attributes: { POSITION: 2 } }],
};
const MATERIALS = [
	"corps",
	"secondaire",
	"peau",
	"poils",
	"coiffe",
	"accessoire",
	"fixe",
].map((name) => ({ name }));

/** Les accesseurs d'un personnage de `total` triangles : 1 par instance de « piece », le reste sur « tunique ». */
const triangles = (total: number) => [
	{ count: 30 },
	{ count: 3 },
	{ count: 3 * (total - 4) },
];

type Parts = Partial<
	Record<
		| "nodes"
		| "meshes"
		| "accessors"
		| "materials"
		| "skins"
		| "textures"
		| "images",
		unknown[]
	>
>;

/** Le JSON du personnage conforme, ses parties remplacées par `parts`. */
const character = (parts: Parts = {}) => ({
	asset: { version: "2.0", generator: "Blender" },
	nodes: NODES,
	meshes: [PIECE, TUNIQUE],
	accessors: triangles(5),
	materials: MATERIALS,
	...parts,
});

const file = (parts: Parts = {}) => glb(character(parts));

/** Les nœuds conformes, chacun complété des champs que `changes` donne sous son nom. */
const nodesWith = (changes: Record<string, Record<string, unknown>>) =>
	NODES.map((node) => ({ ...node, ...changes[node.name] }));

// « tunique », dotée d'une cible de déformation.
const MORPHING_TUNIQUE = {
	...TUNIQUE,
	primitives: [{ attributes: { POSITION: 2 }, targets: [{ POSITION: 0 }] }],
};

// « tunique », en lignes : un écart « budget », sans triangle compté.
const LINES_TUNIQUE = {
	...TUNIQUE,
	primitives: [{ mode: 1, attributes: { POSITION: 2 } }],
};

const MESSAGE = expect.stringMatching(/\S/);

// Une fixture par règle, ses identifiants écrits en toutes lettres : chacune n'enfreint que sa
// règle, et donne la cible attendue.
const FIXTURES: [RuleId, Uint8Array, string | undefined][] = [
	["taille", glb(character(), 3_000_001), undefined],
	["lisible", withWord(file(), 4, 1), undefined],
	[
		"ancres",
		file({ nodes: nodesWith({ main_droite: { name: "main" } }) }),
		"main_droite",
	],
	[
		"ancre-unique",
		file({ nodes: nodesWith({ livre: { name: "main_gauche" } }) }),
		"main_gauche",
	],
	[
		"chapeau-sous-tete",
		file({
			nodes: nodesWith({ tete: { children: [6] }, sol: { children: [5, 2] } }),
		}),
		"chapeau",
	],
	[
		"sol-origine",
		file({ nodes: nodesWith({ sol: { translation: [0, 0.5, 0] } }) }),
		"sol",
	],
	["pieces-rigides", file({ meshes: [PIECE, MORPHING_TUNIQUE] }), "tunique"],
	["materiaux", file({ materials: [...MATERIALS, { name: "robe" }] }), "robe"],
	["sans-texture", file({ textures: [{ sampler: 0 }] }), undefined],
	["budget", file({ meshes: [PIECE, LINES_TUNIQUE] }), "tunique"],
];

test("un GLB conforme n'a aucun écart", () => {
	expect(checkModel(file())).toEqual([]);
});

test("un GLB conforme vu au milieu d'un tampon plus grand, comme un Buffer de Node, n'a aucun écart", () => {
	const bytes = file();
	const buffer = new Uint8Array(bytes.length + 8);
	buffer.set(bytes, 4);
	expect(checkModel(buffer.subarray(4, 4 + bytes.length))).toEqual([]);
});

test.each(FIXTURES)(
	"la fixture « %s » rend l'écart de sa règle, sa cible et un message, et lui seul",
	(regle, bytes, cible) => {
		expect(checkModel(bytes)).toEqual([{ regle, cible, message: MESSAGE }]);
	},
);

test("chaque règle du contrat a sa fixture, dans l'ordre où elles s'appliquent", () => {
	expect(MODEL_RULES.map((rule) => rule.regle)).toEqual(
		FIXTURES.map(([regle]) => regle),
	);
});

test.each<[string, RuleId[], Uint8Array]>([
	["30 000 triangles", [], file({ accessors: triangles(30_000) })],
	["30 001 triangles", ["budget"], file({ accessors: triangles(30_001) })],
	[
		"sol à (0 ; 0,00005 ; 0)",
		[],
		file({ nodes: nodesWith({ sol: { translation: [0, 0.00005, 0] } }) }),
	],
	[
		"sol à (0 ; 0,001 ; 0)",
		["sol-origine"],
		file({ nodes: nodesWith({ sol: { translation: [0, 0.001, 0] } }) }),
	],
	["3 000 000 octets d'un GLB conforme", [], glb(character(), 3_000_000)],
	["3 000 000 octets illisibles, lus", ["lisible"], new Uint8Array(3_000_000)],
	[
		"3 000 001 octets illisibles, refusés avant d'être lus",
		["taille"],
		new Uint8Array(3_000_001),
	],
])("à la borne, %s : écarts %j", (_, regles, bytes) => {
	expect(checkModel(bytes).map((deviation) => deviation.regle)).toEqual(regles);
});

test.each<[string, Uint8Array]>([
	[
		"une ancre en plus (dos, une troisième main)",
		file({ nodes: [...NODES, { name: "dos" }, { name: "main_troisieme" }] }),
	],
	[
		"une ancre vide",
		file({
			nodes: nodesWith({
				chapeau: { children: [] },
				tete: { children: [2, 6, 7] },
			}),
		}),
	],
	[
		"une pièce posée sous la racine (le corps)",
		file({ nodes: [...NODES, { name: "corps", mesh: 0 }] }),
	],
	[
		"un matériau de la liste absent",
		file({ materials: [{ name: "corps" }, { name: "peau" }] }),
	],
	[
		"un chapeau sous un nœud intermédiaire de la tête",
		file({
			nodes: [
				...nodesWith({ tete: { children: [10, 6] } }),
				{ name: "pivot_chapeau", children: [2] },
			],
		}),
	],
])("toléré sans écart : %s", (_, bytes) => {
	expect(checkModel(bytes)).toEqual([]);
});

test.each<[string, Uint8Array]>([
	["tete", file({ nodes: nodesWith({ tete: { name: "crane" } }) })],
	["chapeau", file({ nodes: nodesWith({ chapeau: { name: "bonnet" } }) })],
	["sol", file({ nodes: nodesWith({ sol: { name: "base" } }) })],
])("sans l'ancre « %s » : le seul écart « ancres »", (anchor, bytes) => {
	expect(checkModel(bytes)).toEqual([
		{ regle: "ancres", cible: anchor, message: MESSAGE },
	]);
});

test.each<[string, Uint8Array]>([
	["sol", file({ nodes: [...NODES, { name: "sol", translation: [0, 1, 0] }] })],
	["chapeau", file({ nodes: [...NODES, { name: "chapeau" }] })],
])(
	"une ancre « %s » en double, la seconde hors de sa place : le seul écart « ancre-unique », la première fait foi",
	(anchor, bytes) => {
		expect(checkModel(bytes)).toEqual([
			{ regle: "ancre-unique", cible: anchor, message: MESSAGE },
		]);
	},
);

test("les règles du JSON s'appliquent toutes : deux règles enfreintes, deux écarts", () => {
	const bytes = file({
		materials: [{ name: "robe" }],
		textures: [{ sampler: 0 }],
	});
	expect(checkModel(bytes).map((deviation) => deviation.regle)).toEqual([
		"materiaux",
		"sans-texture",
	]);
});

test("un fichier à squelette et à cibles de déformation : un écart « pieces-rigides » par cause", () => {
	const bytes = file({
		skins: [{ joints: [1] }],
		nodes: nodesWith({ robe: { skin: 0 } }),
		meshes: [PIECE, MORPHING_TUNIQUE],
	});
	expect(checkModel(bytes)).toEqual([
		{ regle: "pieces-rigides", message: MESSAGE },
		{ regle: "pieces-rigides", cible: "robe", message: MESSAGE },
		{ regle: "pieces-rigides", cible: "tunique", message: MESSAGE },
	]);
});

test.each<[string, Uint8Array, RuleId, string | undefined]>([
	[
		"une image, sans texture",
		file({ images: [{ uri: "peau.png" }] }),
		"sans-texture",
		undefined,
	],
	[
		"un matériau sans nom, désigné par son index",
		file({ materials: [...MATERIALS, {}] }),
		"materiaux",
		"#7",
	],
	[
		"29 999 triangles et une primitive en lignes de 6 sommets, hors du compte des triangles",
		file({
			meshes: [
				PIECE,
				{
					...TUNIQUE,
					primitives: [
						...TUNIQUE.primitives,
						{ mode: 1, attributes: { POSITION: 3 } },
					],
				},
			],
			accessors: [...triangles(29_999), { count: 6 }],
		}),
		"budget",
		"tunique",
	],
])("%s : l'écart de sa règle", (_, bytes, regle, cible) => {
	expect(checkModel(bytes)).toEqual([{ regle, cible, message: MESSAGE }]);
});

// Un quart de tour autour de Z : l'axe X va sur l'axe Y.
const QUARTER_TURN_Z = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

test.each<[string, RuleId[], JsonNode[]]>([
	[
		"sous un parent translaté",
		["sol-origine"],
		[...NODES, { name: "racine", translation: [0, 1, 0], children: [0] }],
	],
	[
		"ramené à l'origine par l'échelle puis la rotation de son parent",
		[],
		[
			...nodesWith({ sol: { translation: [1, 0, 0] } }),
			{
				name: "racine",
				translation: [0, -2, 0],
				rotation: QUARTER_TURN_Z,
				scale: [2, 1, 1],
				children: [0],
			},
		],
	],
	[
		// Colonnes : X va sur Y, Y sur −X, Z reste, puis la translation (0 ; −1 ; 0) ; (1 ; 0 ; 0)
		// devient (0 ; 1 ; 0), puis l'origine. Lue transposée, la rotation l'enverrait en (0 ; −2 ; 0).
		"ramené à l'origine par la rotation et la translation de la matrice de son parent",
		[],
		[
			...nodesWith({ sol: { translation: [1, 0, 0] } }),
			{
				name: "racine",
				matrix: [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 1],
				children: [0],
			},
		],
	],
	[
		// L'échelle porte 1e308 à 1e309, hors des doubles : Infinity, que la rotation identité du
		// parent multiplie par 0, d'où une position NaN.
		"poussé hors des nombres finis par l'échelle de son parent",
		["sol-origine"],
		[
			...nodesWith({ sol: { translation: [1e308, 0, 0] } }),
			{ name: "racine", scale: [10, 1, 1], children: [0] },
		],
	],
	[
		"ramené à l'origine par ses deux ancêtres, le plus proche d'abord",
		[],
		[
			...NODES,
			{ name: "pivot", translation: [1, 0, 0], children: [0] },
			{
				name: "racine",
				translation: [0, -1, 0],
				rotation: QUARTER_TURN_Z,
				children: [10],
			},
		],
	],
])("sol %s : écarts %j", (_, regles, nodes) => {
	expect(
		checkModel(file({ nodes })).map((deviation) => deviation.regle),
	).toEqual(regles);
});

const encode = (text: string) => new TextEncoder().encode(text);
const CONFORMING = file();

// Une ligne par forme de fichier illisible : chacune rend le seul écart « lisible », dont le
// message dit la cause.
test.each<[string, Uint8Array, string]>([
	["trop court pour un en-tête", new Uint8Array(19), "trop court"],
	["sans la signature glTF", withWord(CONFORMING, 0, 0), "signature"],
	["d'une autre version", withWord(CONFORMING, 4, 1), "version 1"],
	[
		"dont l'en-tête annonce une autre longueur",
		withWord(CONFORMING, 8, CONFORMING.length + 4),
		"annonce",
	],
	[
		"dont le morceau JSON dépasse la fin du fichier",
		withWord(CONFORMING, 12, CONFORMING.length),
		"dépasse",
	],
	[
		"dont le premier morceau n'est pas du JSON",
		withWord(CONFORMING, 16, BIN_CHUNK),
		"pas du JSON",
	],
	[
		"dont le JSON n'est pas de l'UTF-8",
		glbOf(Uint8Array.of(...encode('{"asset":"'), 0xff, ...encode('"}'))),
		"ne se lit pas",
	],
	["dont le JSON est mal formé", glbOf(encode("{")), "ne se lit pas"],
	["dont le JSON n'est pas un objet", glb([]), "expected object"],
	[
		"dont un champ lu a le mauvais type",
		glb({ nodes: [{ name: 1 }] }),
		"nodes[0].name",
	],
	[
		"qui renvoie à un nœud absent",
		glb({ nodes: [{ children: [1] }] }),
		"nodes[0].children[0]",
	],
	[
		"qui renvoie à un maillage absent",
		glb({ nodes: [{ mesh: 0 }] }),
		"nodes[0].mesh",
	],
	[
		"qui renvoie à un accesseur d'indices absent",
		glb({
			meshes: [{ primitives: [{ indices: 1, attributes: { POSITION: 0 } }] }],
			accessors: [{ count: 3 }],
		}),
		"meshes[0].primitives[0].indices",
	],
	[
		"qui renvoie à un accesseur de sommets absent",
		glb({
			meshes: [{ primitives: [{ indices: 0, attributes: { POSITION: 1 } }] }],
			accessors: [{ count: 3 }],
		}),
		"meshes[0].primitives[0].attributes.POSITION",
	],
	[
		"dont un nœud a deux parents",
		glb({ nodes: [{ children: [2] }, { children: [2] }, {}] }),
		"deux fois",
	],
	[
		"dont la hiérarchie boucle",
		glb({ nodes: [{ children: [1] }, { children: [0] }] }),
		"boucle",
	],
	[
		"dont un nœud est son propre enfant",
		glb({ nodes: [{ children: [0] }] }),
		"boucle",
	],
])("un fichier %s : le seul écart « lisible »", (_, bytes, cause) => {
	expect(checkModel(bytes)).toEqual([
		{ regle: "lisible", message: expect.stringContaining(cause) },
	]);
});

// Chaque nœud renvoie à un maillage absent : un problème par nœud, du nœud 0 au nœud `count` − 1.
test.each<[number, string, boolean]>([
	[10, "les dix, sans leur nombre", false],
	[11, "les dix premiers, suivis de leur nombre", true],
])(
	"un fichier aux %i renvois rompus : l'écart « lisible » en nomme %s",
	(count, _, counted) => {
		const nodes = Array.from({ length: count }, () => ({ mesh: 0 }));
		const [deviation, ...others] = checkModel(glb({ nodes }));
		expect(others).toEqual([]);
		expect(deviation?.regle).toBe("lisible");
		const message = deviation?.message ?? "";
		expect(message.match(/✖/g)).toHaveLength(10);
		expect(message.includes("nodes[10].mesh")).toBe(false);
		expect(message.includes(`${count} problèmes en tout`)).toBe(counted);
	},
);

/** `count` copies de `fields`, renommées `e0`, `e1`… */
const numbered = (count: number, fields: object = {}) =>
	Array.from({ length: count }, (_, at) => ({ ...fields, name: `e${at}` }));

// Toute règle de `GLTF_RULES` passe par `listDeviations`, dans `checkModel`, qui borne ses écarts.
// Cette table l'éprouve sur les règles qui rendent un écart par élément du fichier (« materiaux »,
// « pieces-rigides », « budget »), chacune avec le personnage conforme augmenté de `count`
// éléments en écart ; « lisible » est bornée à l'intérieur de son unique écart (test des renvois
// rompus ci-dessus).
const ONE_PER_ELEMENT: [RuleId, (count: number) => Uint8Array][] = [
	[
		"materiaux",
		(count) => file({ materials: [...MATERIALS, ...numbered(count)] }),
	],
	[
		"pieces-rigides",
		(count) => file({ nodes: [...NODES, ...numbered(count, { skin: 0 })] }),
	],
	[
		"budget",
		(count) =>
			file({ meshes: [PIECE, TUNIQUE, ...numbered(count, LINES_TUNIQUE)] }),
	],
];

test.each(ONE_PER_ELEMENT)(
	"« %s » à dix éléments en écart : dix écarts ; à onze : les dix premiers, puis un écart sans cible qui compte le onzième",
	(regle, withElements) => {
		const listed = numbered(10).map(({ name }) => ({
			regle,
			cible: name,
			message: MESSAGE,
		}));
		expect(checkModel(withElements(10))).toEqual(listed);
		expect(checkModel(withElements(11))).toEqual([
			...listed,
			{ regle, message: expect.stringContaining(" 1 autre") },
		]);
	},
);

// Chaque nom tiré du fichier passe par `nameOf`, qui le borne. Cette table l'éprouve sur les règles
// qui recopient un nom, dans la cible et le message. L'erreur de `JSON.parse` dans l'écart
// « lisible » est bornée par V8, qui recopie au plus 20 caractères du texte (mesuré le 2026-11-20,
// Node 24.3, sur des textes de 1 à 100 000 caractères) : test suivant. Le reste de la cause de
// « lisible » — en-tête, UTF-8, problèmes Zod, renvois rompus — ne recopie ni clé ni texte du
// fichier, seulement des types, des nombres et les chemins du schéma (mesuré le même jour) ; les
// autres règles, des nombres et les noms d'ancres du contrat.
const NAME_PATHS: [RuleId, string, (name: string) => Uint8Array][] = [
	[
		"pieces-rigides",
		"nœud lié à un squelette",
		(name) => file({ nodes: [...NODES, { name, skin: 0 }] }),
	],
	[
		"pieces-rigides",
		"maillage à cibles de déformation",
		(name) => file({ meshes: [PIECE, { ...MORPHING_TUNIQUE, name }] }),
	],
	[
		"materiaux",
		"matériau",
		(name) => file({ materials: [...MATERIALS, { name }] }),
	],
	[
		"budget",
		"maillage en lignes",
		(name) => file({ meshes: [PIECE, { ...LINES_TUNIQUE, name }] }),
	],
];

// Un nom de `length` caractères : un retour à la ligne, puis des mages hors du plan de base, de
// deux unités UTF-16 chacun — ce que compterait mal une borne en unités, ou arrêtée à la ligne.
const nameOfLength = (length: number) => `\n${"🧙".repeat(length - 1)}`;

test.each(NAME_PATHS)(
	"« %s », %s : un nom de 64 caractères gardé entier, de 65 réduit aux 64 premiers suivis de « … »",
	(regle, _, withName) => {
		const kept = nameOfLength(64);
		expect(checkModel(withName(kept))).toEqual([
			{ regle, cible: kept, message: expect.stringContaining(`« ${kept} »`) },
		]);
		const cut = `${kept}…`;
		expect(checkModel(withName(nameOfLength(65)))).toEqual([
			{ regle, cible: cut, message: expect.stringContaining(`« ${cut} »`) },
		]);
	},
);

test("describeDeviations écrit chaque écart sur une ligne, la cible entre parenthèses quand il en a une ; un caractère de contrôle tiré du fichier y devient une espace", () => {
	expect(
		describeDeviations([
			{
				regle: "materiaux",
				cible: "robe\nrouge",
				message: "Le matériau « robe\r\nrouge » n'est pas de la liste.",
			},
			{ regle: "sans-texture", message: "Une\ttexture." },
		]),
	).toBe(
		[
			"Le fichier ne respecte pas le contrat du fichier 3D (direction artistique § 7) :",
			"- materiaux (robe rouge) : Le matériau « robe rouge » n'est pas de la liste.",
			"- sans-texture : Une texture.",
		].join("\n"),
	);
});

test("un JSON mal formé de 1 000 caractères : l'écart « lisible » n'en recopie pas 65 de suite", () => {
	const text = "x".repeat(1_000);
	const [deviation, ...others] = checkModel(glbOf(encode(text)));
	expect(others).toEqual([]);
	expect(deviation?.regle).toBe("lisible");
	expect(deviation?.message.includes(text.slice(0, 65))).toBe(false);
});
