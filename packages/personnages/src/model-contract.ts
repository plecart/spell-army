import { z } from "zod";

// Le contrat du fichier 3D d'une classe ou d'un monstre (direction artistique § 7) : un GLB 2.0
// dont on ne lit que l'en-tête et le morceau JSON, jamais le binaire.

/** Les règles du contrat, dans l'ordre où elles s'appliquent. */
export type RuleId =
	| "taille"
	| "lisible"
	| "ancres"
	| "ancre-unique"
	| "chapeau-sous-tete"
	| "sol-origine"
	| "pieces-rigides"
	| "materiaux"
	| "sans-texture"
	| "budget";

/**
 * Un écart au contrat, tel qu'il sort vers le designer : la règle enfreinte, le nœud, le maillage,
 * le matériau ou l'ancre en cause quand il y en a un, et une phrase qui dit quoi corriger.
 */
export interface Deviation {
	regle: RuleId;
	cible?: string;
	message: string;
}

const MAX_BYTES = 3_000_000;
const MAX_TRIANGLES = 30_000;
const ORIGIN_TOLERANCE = 0.0001;
const TRIANGLES_MODE = 4;
const ANCHORS = ["tete", "chapeau", "main_gauche", "main_droite", "sol"];
const MATERIALS = [
	"corps",
	"secondaire",
	"peau",
	"poils",
	"coiffe",
	"accessoire",
	"fixe",
];

// L'en-tête GLB 2.0 (glTF 2.0, « Binary glTF Layout ») : signature, version, longueur totale, puis
// la longueur et le type du premier morceau. Mots de 32 bits en petit-boutiste.
const GLB_MAGIC = 0x46546c67; // « glTF »
const GLB_VERSION = 2;
const JSON_CHUNK = 0x4e4f534a; // « JSON »
const JSON_START = 20;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

// Ce qui se liste au plus avant d'être compté : les problèmes du JSON que nomme l'écart
// « lisible », les écarts d'une règle. Sans cette borne, 2 200 032 octets de nœuds `{"mesh":0}`
// portent 200 000 renvois rompus, soit 13 488 986 caractères de message ; un GLB de 900 156
// octets, ses cinq ancres et 300 000 matériaux sans nom, 300 000 écarts « materiaux », soit
// 49 877 780 caractères de cible et de message (mesuré le 2026-11-20, Node 24.3).
const MAX_LISTED = 10;

// Les caractères qu'un nom tiré du fichier garde dans un écart, au plus. Sans cette borne, un GLB
// de 2 999 168 octets dont un matériau porte un nom de 2 999 000 caractères rend un écart de
// 5 998 153 caractères de cible et de message (mesuré le 2026-11-20, Node 24.3).
const MAX_NAME_LENGTH = 64;

const index = z.number().int().nonnegative();
const real = z.number();
const vector3 = z.tuple([real, real, real]);
const column = [real, real, real, real] as const; // une matrice glTF se lit colonne par colonne

// Le sous-ensemble du JSON glTF que lisent les règles ; les autres champs sont admis et ignorés.
const nodeSchema = z.object({
	name: z.string().optional(),
	children: z.array(index).optional(),
	mesh: index.optional(),
	skin: index.optional(),
	translation: vector3.optional(),
	rotation: z.tuple([real, real, real, real]).optional(),
	scale: vector3.optional(),
	matrix: z.tuple([...column, ...column, ...column, ...column]).optional(),
});
type GltfNode = z.infer<typeof nodeSchema>;

const gltfShape = z.object({
	nodes: z.array(nodeSchema).default([]),
	meshes: z
		.array(
			z.object({
				name: z.string().optional(),
				primitives: z.array(
					z.object({
						mode: z.number().int().default(TRIANGLES_MODE),
						indices: index.optional(),
						attributes: z.object({ POSITION: index }),
						targets: z.array(z.unknown()).optional(),
					}),
				),
			}),
		)
		.default([]),
	accessors: z.array(z.object({ count: index })).default([]),
	materials: z.array(z.object({ name: z.string().optional() })).default([]),
	skins: z.array(z.unknown()).default([]),
	textures: z.array(z.unknown()).default([]),
	images: z.array(z.unknown()).default([]),
});
type Gltf = z.infer<typeof gltfShape>;

/** Un lien rompu du JSON, au chemin du champ en cause. */
interface LinkIssue {
	path: (string | number)[];
	message: string;
}

/** Les renvois vers un nœud, un maillage ou un accesseur qui n'existe pas. */
function danglingReferences({ nodes, meshes, accessors }: Gltf): LinkIssue[] {
	const dangling = (
		target: unknown[],
		at: number | undefined,
		path: (string | number)[],
	): LinkIssue[] =>
		at !== undefined && at >= target.length
			? [{ path, message: `renvoie à l'élément ${at}, qui n'existe pas` }]
			: [];
	return [
		...nodes.flatMap((node, n) => [
			...(node.children ?? []).flatMap((child, c) =>
				dangling(nodes, child, ["nodes", n, "children", c]),
			),
			...dangling(meshes, node.mesh, ["nodes", n, "mesh"]),
		]),
		...meshes.flatMap((mesh, m) =>
			mesh.primitives.flatMap(({ indices, attributes }, p) => {
				const primitive = ["meshes", m, "primitives", p];
				return [
					...dangling(accessors, indices, [...primitive, "indices"]),
					...dangling(accessors, attributes.POSITION, [
						...primitive,
						"attributes",
						"POSITION",
					]),
				];
			}),
		),
	];
}

/**
 * Ce qui empêche les nœuds de former des arbres disjoints (glTF 2.0, « Nodes and Hierarchy »).
 * Linéaire : 3 000 000 octets portent jusqu'à un million de nœuds vides (`{},`, 3 octets).
 */
function hierarchyIssues(nodes: GltfNode[]): LinkIssue[] {
	const children = nodes.flatMap((node) => node.children ?? []);
	const isChild = new Set(children);
	if (isChild.size < children.length) {
		return [
			{
				path: ["nodes"],
				message: "un nœud figure deux fois parmi les enfants",
			},
		];
	}
	// Chaque nœud a au plus un parent : tous se rejoignent depuis les racines, sauf ceux d'une boucle.
	const pending = nodes.flatMap((_, at) => (isChild.has(at) ? [] : [at]));
	let reached = 0;
	for (let at = pending.pop(); at !== undefined; at = pending.pop()) {
		const node = nodes[at];
		if (node !== undefined) {
			reached += 1;
			for (const child of node.children ?? []) pending.push(child);
		}
	}
	return reached < nodes.length
		? [{ path: ["nodes"], message: "la hiérarchie des nœuds forme une boucle" }]
		: [];
}

const gltfSchema = gltfShape.superRefine((gltf, ctx) => {
	for (const issue of [
		...danglingReferences(gltf),
		...hierarchyIssues(gltf.nodes),
	]) {
		ctx.addIssue({ code: "custom", ...issue });
	}
});

/** Les `MAX_LISTED` premiers problèmes d'une validation, suivis de leur nombre au-delà. */
function listIssues({ issues }: z.ZodError): string {
	const listed = z.prettifyError({
		issues: issues.slice(0, MAX_LISTED),
	});
	return issues.length > MAX_LISTED
		? `${listed}\n… ${issues.length} problèmes en tout`
		: listed;
}

/** Le JSON d'un GLB 2.0, ou ce qui empêche de le lire. */
function readGltf(bytes: Uint8Array): Gltf | string {
	if (bytes.length < JSON_START) {
		return "le fichier est trop court pour un en-tête GLB";
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const word = (offset: number) => view.getUint32(offset, true);
	if (word(0) !== GLB_MAGIC) {
		return "la signature « glTF » manque en tête du fichier";
	}
	if (word(4) !== GLB_VERSION) {
		return `version ${word(4)} de l'en-tête GLB, 2 attendue`;
	}
	if (word(8) !== bytes.length) {
		return `l'en-tête annonce ${word(8)} octets, le fichier en compte ${bytes.length}`;
	}
	const jsonEnd = JSON_START + word(12);
	if (jsonEnd > bytes.length) {
		return "le morceau JSON dépasse la fin du fichier";
	}
	if (word(16) !== JSON_CHUNK) {
		return "le premier morceau n'est pas du JSON";
	}
	let json: unknown;
	try {
		json = JSON.parse(UTF8.decode(bytes.subarray(JSON_START, jsonEnd)));
	} catch (error) {
		return `le morceau JSON ne se lit pas (${error})`;
	}
	const parsed = gltfSchema.safeParse(json);
	return parsed.success ? parsed.data : listIssues(parsed.error);
}

type Vector3 = [number, number, number];
type Quaternion = [number, number, number, number];

function cross([ax, ay, az]: Vector3, [bx, by, bz]: Vector3): Vector3 {
	return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/** `v` tourné par un quaternion unitaire : v + w·t + q × t, avec t = 2 q × v. */
function rotate([qx, qy, qz, w]: Quaternion, v: Vector3): Vector3 {
	const q: Vector3 = [qx, qy, qz];
	const [cx, cy, cz] = cross(q, v);
	const t: Vector3 = [2 * cx, 2 * cy, 2 * cz];
	const [ux, uy, uz] = cross(q, t);
	return [v[0] + w * t[0] + ux, v[1] + w * t[1] + uy, v[2] + w * t[2] + uz];
}

/** Un point du repère d'un nœud, dans le repère de son parent : `matrix`, sinon T × R × S. */
function toParent(node: GltfNode, [x, y, z]: Vector3): Vector3 {
	if (node.matrix !== undefined) {
		const [a, b, c, , d, e, f, , g, h, i, , tx, ty, tz] = node.matrix; // colonne par colonne
		return [
			a * x + d * y + g * z + tx,
			b * x + e * y + h * z + ty,
			c * x + f * y + i * z + tz,
		];
	}
	const [sx, sy, sz] = node.scale ?? [1, 1, 1];
	const [rx, ry, rz] = rotate(node.rotation ?? [0, 0, 0, 1], [
		x * sx,
		y * sy,
		z * sz,
	]);
	const [tx, ty, tz] = node.translation ?? [0, 0, 0];
	return [rx + tx, ry + ty, rz + tz];
}

/** Le premier nœud d'un nom, puis son parent, et ainsi jusqu'à sa racine ; vide sans ce nœud. */
function lineage(nodes: GltfNode[], name: string): GltfNode[] {
	const parents = new Map(
		nodes.flatMap((node, parent) =>
			(node.children ?? []).map((child) => [child, parent] as const),
		),
	);
	const chain: GltfNode[] = [];
	for (
		let at = nodes.findIndex((node) => node.name === name);
		at !== -1;
		at = parents.get(at) ?? -1
	) {
		const node = nodes[at];
		if (node !== undefined) chain.push(node);
	}
	return chain;
}

// Les `MAX_NAME_LENGTH` premiers caractères d'un nom qui en a davantage : comptés en points de code
// (`u`), pour ne pas couper un caractère hors du plan de base, retours à la ligne compris (`s`).
const NAME_HEAD = new RegExp(`^.{${MAX_NAME_LENGTH}}(?=.)`, "su");

/**
 * Le nom d'un élément du glTF, ou son index s'il n'en a pas ; au-delà de `MAX_NAME_LENGTH`
 * caractères, ses premiers suivis de « … ».
 */
function nameOf(item: { name?: string | undefined }, at: number): string {
	const name = item.name ?? `#${at}`;
	const head = NAME_HEAD.exec(name)?.[0];
	return head === undefined ? name : `${head}…`;
}

/** Un écart sans sa règle, que la règle appose. */
type Finding = Omit<Deviation, "regle">;

/** `finding` si `condition` tient, rien sinon. */
const when = (condition: boolean, finding: Finding): Finding[] =>
	condition ? [finding] : [];

/** Une règle qui lit une entrée — les octets ou le JSON — et y trouve ses écarts. */
interface Rule<Input> {
	readonly regle: RuleId;
	check(input: Input): Deviation[];
}

function rule<Input>(
	regle: RuleId,
	find: (input: Input) => Finding[],
): Rule<Input> {
	return {
		regle,
		check: (input) => find(input).map((finding) => ({ regle, ...finding })),
	};
}

const SIZE_RULE = rule("taille", (bytes: Uint8Array) =>
	when(bytes.length > MAX_BYTES, {
		message: `Le fichier pèse ${bytes.length} octets, plus que les ${MAX_BYTES} admis : allégez le modèle avant de le déposer.`,
	}),
);

const READABLE_RULE = {
	regle: "lisible",
	/** Le JSON du fichier, ou l'écart qui dit pourquoi il ne se lit pas. */
	read(bytes: Uint8Array): Gltf | Deviation[] {
		const gltf = readGltf(bytes);
		return typeof gltf === "string"
			? [
					{
						regle: "lisible",
						message: `Le fichier ne se lit pas comme un GLB 2.0 : réexportez-le au format glTF binaire (.glb). Cause : ${gltf}`,
					},
				]
			: gltf;
	},
} as const;

/** Les règles du JSON : chacune lit le JSON seul, toutes s'appliquent. */
const GLTF_RULES: Rule<Gltf>[] = [
	rule("ancres", ({ nodes }) =>
		ANCHORS.flatMap((anchor) =>
			when(!nodes.some((node) => node.name === anchor), {
				cible: anchor,
				message: `L'ancre « ${anchor} » manque : ajoutez un nœud nommé « ${anchor} », vide si rien n'y pend.`,
			}),
		),
	),
	rule("ancre-unique", ({ nodes }) =>
		ANCHORS.flatMap((anchor) => {
			const count = nodes.filter((node) => node.name === anchor).length;
			return when(count > 1, {
				cible: anchor,
				message: `${count} nœuds s'appellent « ${anchor} » : renommez les autres pour qu'un seul porte le nom de l'ancre.`,
			});
		}),
	),
	rule("chapeau-sous-tete", ({ nodes }) => {
		const hat = lineage(nodes, "chapeau");
		return when(
			hat.length > 0 &&
				nodes.some((node) => node.name === "tete") &&
				!hat.some((node) => node.name === "tete"),
			{
				cible: "chapeau",
				message:
					"L'ancre « chapeau » n'est pas sous « tete » : rangez-la parmi les descendants de « tete ».",
			},
		);
	}),
	rule("sol-origine", ({ nodes }) => {
		const position = lineage(nodes, "sol").reduce<Vector3>(
			(point, node) => toParent(node, point),
			[0, 0, 0],
		);
		return when(
			// En négation : une position NaN, qu'aucune comparaison ne vérifie, est un écart.
			position.some((value) => !(Math.abs(value) <= ORIGIN_TOLERANCE)),
			{
				cible: "sol",
				message: `L'ancre « sol » est en (${position.map((value) => Number(value.toFixed(6))).join(" ; ")}) dans la scène (Y vers le haut), parents compris : placez-la à l'origine, à ${ORIGIN_TOLERANCE} près.`,
			},
		);
	}),
	rule("pieces-rigides", ({ nodes, meshes, skins }) => [
		...when(skins.length > 0, {
			message: `Le fichier porte ${skins.length} squelette(s) : retirez les armatures, chaque pièce est un maillage rigide.`,
		}),
		...nodes.flatMap((node, at) => {
			const name = nameOf(node, at);
			return when(node.skin !== undefined, {
				cible: name,
				message: `Le nœud « ${name} » est lié à un squelette : détachez-le de son armature.`,
			});
		}),
		...meshes.flatMap((mesh, at) => {
			const name = nameOf(mesh, at);
			return when(
				mesh.primitives.some(({ targets }) => (targets?.length ?? 0) > 0),
				{
					cible: name,
					message: `Le maillage « ${name} » porte des cibles de déformation (shape keys) : retirez-les.`,
				},
			);
		}),
	]),
	rule("materiaux", ({ materials }) =>
		materials.flatMap((material, at) => {
			const name = nameOf(material, at);
			return when(!MATERIALS.includes(material.name ?? ""), {
				cible: name,
				message: `Le matériau « ${name} » ne porte pas un nom de la liste (${MATERIALS.join(", ")}) : renommez-le d'après la partie qu'il colore.`,
			});
		}),
	),
	rule("sans-texture", ({ textures, images }) =>
		when(textures.length > 0 || images.length > 0, {
			message: `Le fichier porte ${textures.length} texture(s) et ${images.length} image(s) : retirez-les, les couleurs sont unies.`,
		}),
	),
	rule("budget", ({ nodes, meshes, accessors }) => {
		const count = (at: number) => accessors[at]?.count ?? 0;
		const triangles = nodes
			.flatMap((node) =>
				node.mesh === undefined ? [] : (meshes[node.mesh]?.primitives ?? []),
			)
			.filter(({ mode }) => mode === TRIANGLES_MODE)
			.reduce(
				(sum, { indices, attributes }) =>
					sum + Math.floor(count(indices ?? attributes.POSITION) / 3),
				0,
			);
		return [
			...when(triangles > MAX_TRIANGLES, {
				message: `Le modèle compte ${triangles} triangles, plus que les ${MAX_TRIANGLES} admis : simplifiez-le.`,
			}),
			...meshes.flatMap((mesh, at) => {
				const name = nameOf(mesh, at);
				return when(
					mesh.primitives.some(({ mode }) => mode !== TRIANGLES_MODE),
					{
						cible: name,
						message: `Le maillage « ${name} » contient des points, des lignes ou des bandes de triangles : réexportez-le en triangles.`,
					},
				);
			}),
		];
	}),
];

/**
 * Les dix règles du contrat, dans l'ordre où elles s'appliquent. `taille` et `lisible` lisent les
 * octets, et leur écart arrête la vérification ; `lisible` rend le JSON que lisent les huit
 * autres. Ajouter une règle du JSON, c'est ajouter une entrée à `GLTF_RULES`.
 */
export const MODEL_RULES = [SIZE_RULE, READABLE_RULE, ...GLTF_RULES];

/** Les `MAX_LISTED` premiers écarts d'une règle, puis un écart sans cible qui compte le reste. */
function listDeviations(regle: RuleId, deviations: Deviation[]): Deviation[] {
	const unlisted = deviations.length - MAX_LISTED;
	return unlisted > 0
		? [
				...deviations.slice(0, MAX_LISTED),
				{
					regle,
					message: `Et ${unlisted} autre(s) écart(s) de la règle « ${regle} », non listé(s) : corrigez les ${MAX_LISTED} premiers, puis vérifiez de nouveau le fichier.`,
				},
			]
		: deviations;
}

/**
 * Les écarts d'un fichier GLB au contrat du fichier 3D (direction artistique § 7) ; une liste vide
 * veut dire conforme. Une règle rend au plus ses dix premiers écarts, suivis, au-delà, d'un écart
 * de la même règle, sans cible, qui dit combien d'autres ne sont pas listés. Un nom tiré du
 * fichier y entre réduit, au-delà de 64 caractères, à ses 64 premiers suivis de « … ».
 *
 * 1. `taille` : 3 000 000 octets au plus, vérifié avant toute lecture ; au-delà, seul cet écart.
 * 2. `lisible` : en-tête GLB 2.0, premier morceau en JSON UTF-8, champs lus du bon type, renvois
 *    vers des nœuds, maillages et accesseurs qui existent, nœuds en arbres disjoints ; sinon, seul
 *    cet écart, qui en dit la cause — dix problèmes du JSON au plus, suivis de leur nombre au-delà.
 * 3. `ancres` : un nœud nommé `tete`, `chapeau`, `main_gauche`, `main_droite` et `sol` ; un écart
 *    par ancre absente. Une ancre peut être vide, d'autres ancres (`dos`) sont admises.
 * 4. `ancre-unique` : un seul nœud par nom d'ancre.
 * 5. `chapeau-sous-tete` : `chapeau` descend de `tete`, à toute profondeur.
 * 6. `sol-origine` : `sol` à l'origine de la scène, parents compris, à 0,0001 près.
 * 7. `pieces-rigides` : ni squelette, ni nœud lié à un squelette, ni cible de déformation ; un
 *    écart par cause.
 * 8. `materiaux` : chaque matériau nommé `corps`, `secondaire`, `peau`, `poils`, `coiffe`,
 *    `accessoire` ou `fixe` ; les sept ne sont pas exigés.
 * 9. `sans-texture` : ni texture ni image.
 * 10. `budget` : 30 000 triangles au plus, comptés sur les seules primitives en triangles
 *     (mode 4), chaque instance d'un maillage comptée ; toute primitive en triangles, sinon un
 *     écart par maillage.
 *
 * Les règles 5 et 6 lisent le premier nœud du nom ; un nom en double est l'écart de la règle 4. Une
 * pièce posée sous la racine, comme le corps, est admise.
 */
export function checkModel(bytes: Uint8Array): Deviation[] {
	const tooLarge = SIZE_RULE.check(bytes);
	if (tooLarge.length > 0) return tooLarge;
	const gltf = READABLE_RULE.read(bytes);
	if (Array.isArray(gltf)) return gltf;
	return GLTF_RULES.flatMap((rule) =>
		listDeviations(rule.regle, rule.check(gltf)),
	);
}
