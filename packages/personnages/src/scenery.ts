import { type ClassKey, perClass } from "./character.ts";
import { CLASS_COLORS } from "./class-colors.ts";

// Le décor de classe (direction artistique § 5, « Règles de dessin du décor »), porté du prototype
// `annuaire-bd.html` de la direction artistique. Repère du `viewBox` : 100 × 100, y vers le bas.

/** La ligne du sol. */
const GROUND = 84;

/**
 * Gabarit de balisage SVG : chaque nombre interpolé s'écrit arrondi au millième, sans les restes
 * du calcul flottant (`87.39999999999999`).
 */
function svg(
	strings: TemplateStringsArray,
	...values: (number | string)[]
): string {
	return String.raw(
		{ raw: strings },
		...values.map((value) =>
			typeof value === "number" ? Math.round(value * 1000) / 1000 : value,
		),
	);
}

const rect = (
	x: number,
	y: number,
	width: number,
	height: number,
	radius = 0.6,
) =>
	svg`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/>`;
const circle = (x: number, y: number, radius: number) =>
	svg`<circle cx="${x}" cy="${y}" r="${radius}"/>`;
/** Un tracé, écrit comme son attribut `d` : path`M${x} ${y}…`. */
const path = (strings: TemplateStringsArray, ...values: number[]) =>
	`<path d="${svg(strings, ...values)}"/>`;

/** Toit en flèche, sa base de largeur `width` centrée en `cx` sur la ligne `y`. */
const spire = (cx: number, y: number, width: number, height: number) =>
	path`M${cx - width / 2} ${y} Q${cx - width / 6} ${y - height * 0.4} ${cx} ${y - height} Q${cx + width / 6} ${y - height * 0.4} ${cx + width / 2} ${y}Z`;
/** Ouverture en plein cintre, porte ou fenêtre, de coin haut gauche (x, y). */
const arch = (x: number, y: number, width: number, height: number) =>
	path`M${x} ${y + height} V${y + width / 2} A${width / 2} ${width / 2} 0 0 1 ${x + width} ${y + width / 2} V${y + height}Z`;
/** `count` créneaux réguliers sur la largeur `width`, posés sur la ligne `y`. */
const crenels = (x: number, y: number, width: number, count: number) => {
	const merlon = width / (2 * count - 1);
	return Array.from({ length: count }, (_, index) =>
		rect(x + index * 2 * merlon, y - 2.6, merlon, 3, 0.3),
	).join("");
};
/** Tour posée au sol : corps droit, bandeau, toit en flèche centré sur le corps. */
const tower = (cx: number, width: number, height: number, roof: number) =>
	rect(cx - width / 2, GROUND - height, width, height, 0) +
	rect(cx - width / 2 - 1, GROUND - height - 1.6, width + 2, 2.2, 0.5) +
	spire(cx, GROUND - height - 1.4, width + 3, roof);
/** Mât posé au sol, de sommet `top`, et son drapeau. */
const flag = (x: number, top: number) =>
	rect(x, top, 1.3, GROUND - top, 0) +
	path`M${x + 1.3} ${top + 0.6} Q${x + 5} ${top + 0.2} ${x + 8.5} ${top + 2.6} Q${x + 5} ${top + 5} ${x + 1.3} ${top + 4.6}Z`;
/** Arbre rond posé au sol, à l'échelle `k`. */
const tree = (x: number, k: number) =>
	rect(x - 1.1 * k, GROUND - 13 * k, 2.2 * k, 13 * k, 0) +
	circle(x, GROUND - 18 * k, 6.5 * k) +
	circle(x - 4.6 * k, GROUND - 14.5 * k, 4.8 * k) +
	circle(x + 4.6 * k, GROUND - 15 * k, 5 * k);
/** Champignon posé au sol, à l'échelle `k`. */
const mushroom = (x: number, k: number) =>
	rect(x - 1.6 * k, GROUND - 9 * k, 3.2 * k, 9 * k, 0) +
	path`M${x - 8 * k} ${GROUND - 8.5 * k} C${x - 7 * k} ${GROUND - 17 * k} ${x + 7 * k} ${GROUND - 17 * k} ${x + 8 * k} ${GROUND - 8.5 * k}Z`;
/** Étincelle à quatre branches, centrée en (x, y), à l'échelle `k`. */
const spark = (x: number, y: number, k: number) =>
	path`M${x} ${y - 2 * k} Q${x + 0.35 * k} ${y - 0.35 * k} ${x + 2 * k} ${y} Q${x + 0.35 * k} ${y + 0.35 * k} ${x} ${y + 2 * k} Q${x - 0.35 * k} ${y + 0.35 * k} ${x - 2 * k} ${y} Q${x - 0.35 * k} ${y - 0.35 * k} ${x} ${y - 2 * k}Z`;
/** Chauve-souris en vol, ailes de part et d'autre de (x, y), à l'échelle `k`. */
const bat = (x: number, y: number, k: number) =>
	path`M${x} ${y} Q${x - 2 * k} ${y - 2.4 * k} ${x - 5 * k} ${y - 1.6 * k} Q${x - 3.6 * k} ${y - 0.4 * k} ${x - 3.4 * k} ${y + 0.8 * k} Q${x - 1.6 * k} ${y - 0.2 * k} ${x} ${y + 1.2 * k} Q${x + 1.6 * k} ${y - 0.2 * k} ${x + 3.4 * k} ${y + 0.8 * k} Q${x + 3.6 * k} ${y - 0.4 * k} ${x + 5 * k} ${y - 1.6 * k} Q${x + 2 * k} ${y - 2.4 * k} ${x} ${y}Z`;
/** Les collines du lointain, communes à toutes les classes sauf le nain. */
const HILLS = path`M0 70 C16 64 30 66 44 68 C58 70 70 62 84 63 C92 64 97 66 100 66 V${GROUND} H0Z`;
/** Le sol plat, commun aux huit classes : il déborde du cadre, sans bord visible. */
const FLOOR = rect(-1, GROUND, 102, 17, 0);

/** Les formes d'un décor, par calque, hors du sol commun. */
interface Scene {
	/** Lointain pâle : collines, ou montagnes chez le nain. */
	far: string;
	/** L'élément de la classe, plus marqué, hors du centre laissé libre pour le personnage. */
	feature: string;
	/** Portes et ouvertures sombres. */
	openings?: string;
	/** Détails clairs : fenêtres, lueurs et autres touches de lumière. */
	lights: string;
}

const SCENES: Readonly<Record<ClassKey, Scene>> = {
	// Tour à deux fenêtres éclairées.
	wizard: {
		far: HILLS,
		feature: tower(86, 9, 32, 17) + rect(77, GROUND - 9, 5, 9, 0),
		openings: arch(84.2, GROUND - 8, 3.6, 8),
		lights:
			arch(84.6, GROUND - 28, 2.8, 5) +
			arch(84.6, GROUND - 19, 2.8, 4) +
			spark(20, 30, 1) +
			spark(30, 20, 0.7),
	},
	// Cairn et pierre levée gravée.
	golem: {
		far: HILLS,
		feature:
			rect(2, GROUND - 8, 24, 8, 0) +
			rect(5, GROUND - 15, 18, 8, 3.6) +
			rect(8.5, GROUND - 21.5, 11, 7, 3.2) +
			rect(11, GROUND - 26.5, 6, 5.5, 2.6) +
			path`M84 ${GROUND} V${GROUND - 20} Q84 ${GROUND - 24} 89 ${GROUND - 24} Q94 ${GROUND - 24} 94 ${GROUND - 20} V${GROUND}Z`,
		lights:
			rect(88.4, GROUND - 19, 1.2, 6, 0.6) +
			rect(86.6, GROUND - 15.4, 4.8, 1.2, 0.6) +
			rect(87.8, GROUND - 10, 2.4, 1.2, 0.6),
	},
	// Rempart crénelé, tour, porte et drapeau.
	warrior: {
		far: HILLS,
		feature:
			rect(66, GROUND - 20, 36, 20, 0) +
			crenels(66, GROUND - 20, 36, 7) +
			tower(70, 7, 26, 9) +
			flag(12, 32),
		openings: arch(80, GROUND - 12, 8, 12),
		lights: rect(68.9, GROUND - 20, 2.2, 3.2, 0.5),
	},
	// Montagne enneigée et entrée de mine étayée.
	dwarf: {
		far: path`M-4 ${GROUND} C10 70 18 56 26 46 C29 42 33 42 36 46 C44 56 50 64 60 70 C72 77 88 80 104 ${GROUND}Z`,
		feature:
			rect(72, GROUND - 17, 2.4, 17, 0) +
			rect(87.6, GROUND - 17, 2.4, 17, 0) +
			rect(70.5, GROUND - 19.5, 21, 3, 0.6) +
			path`M8 ${GROUND} V${GROUND - 3.6} Q8 ${GROUND - 6} 10.4 ${GROUND - 6} H14.6 Q17 ${GROUND - 6} 17 ${GROUND - 3.6} V${GROUND}Z M14 ${GROUND} V${GROUND - 7.6} Q14 ${GROUND - 10} 16.4 ${GROUND - 10} H18.6 Q21 ${GROUND - 10} 21 ${GROUND - 7.6} V${GROUND}Z`,
		openings: rect(74.4, GROUND - 16.5, 13.2, 16.5, 0),
		lights:
			path`M23.4 50.4 C25.6 47.4 27.4 44.6 28.8 43.7 C30.6 42.9 32.2 43.6 33.6 45.8 C31.6 47.2 30.2 47.6 28.8 46.8 C27.2 48.4 25.6 49.4 23.4 50.4Z` +
			circle(81, GROUND - 12.5, 1.1),
	},
	// Château à deux tours, lune et chauves-souris.
	vampire: {
		far: HILLS,
		feature:
			tower(5.5, 6, 30, 12) +
			rect(8.5, GROUND - 22, 12, 22, 0) +
			crenels(8.5, GROUND - 22, 12, 3) +
			tower(23.5, 6, 26, 10) +
			bat(70, 30, 0.9) +
			bat(88, 40, 0.7),
		openings: arch(11.8, GROUND - 10, 5.4, 10),
		lights:
			circle(80, 22, 7.5) +
			arch(4.4, GROUND - 25, 2.2, 4) +
			arch(22.4, GROUND - 21, 2.2, 4),
	},
	// Arbres ronds.
	druid: {
		far: HILLS,
		feature:
			tree(10, 1.1) +
			tree(23, 0.72) +
			tree(89, 1.15) +
			path`M74 ${GROUND} V${GROUND - 7.5} Q74 ${GROUND - 10} 76.5 ${GROUND - 10} Q79 ${GROUND - 10} 79 ${GROUND - 7.5} V${GROUND}Z`,
		lights: spark(78, 30, 0.8),
	},
	// Grange et clôture.
	peasant: {
		far: HILLS,
		feature:
			rect(72, GROUND - 17, 21, 17, 0) +
			path`M70 ${GROUND - 16.4} L75.6 ${GROUND - 24} L82.5 ${GROUND - 27.4} L89.4 ${GROUND - 24} L95 ${GROUND - 16.4}Z` +
			rect(2, GROUND - 9, 1.6, 9, 0) +
			rect(12, GROUND - 9, 1.6, 9, 0) +
			rect(22, GROUND - 9, 1.6, 9, 0) +
			rect(1, GROUND - 7.6, 23.6, 1.4, 0.5) +
			rect(1, GROUND - 3.8, 23.6, 1.4, 0.5),
		openings: rect(79, GROUND - 11, 7, 11, 0),
		lights: rect(80.5, GROUND - 22, 4, 3, 0.5),
	},
	// Champignons et étincelles.
	fairy: {
		far: HILLS,
		feature: mushroom(12, 1.2) + mushroom(87, 0.9),
		lights:
			circle(8, GROUND - 13.4, 1.1) +
			circle(14.6, GROUND - 15, 0.9) +
			circle(85, GROUND - 11.6, 0.8) +
			circle(89.4, GROUND - 12.4, 0.7) +
			spark(26, 46, 1.2) +
			spark(74, 36, 1) +
			spark(30, 70, 0.8) +
			spark(68, 66, 0.9),
	},
};

/** Un calque : un groupe à opacité unique, où les formes d'un plan se fondent en silhouette. */
const layer = (fill: string, opacity: number, shapes = "") =>
	shapes && svg`<g fill="${fill}" opacity="${opacity}">${shapes}</g>`;

function backdrop(classKey: ClassKey): string {
	const color = CLASS_COLORS[classKey];
	const scene = SCENES[classKey];
	const layers =
		layer(color, 0.13, scene.far) +
		layer(color, 0.42, FLOOR) +
		layer(color, 0.32, scene.feature) +
		layer("#1a1418", 0.38, scene.openings) +
		layer("#fff", 0.55, scene.lights);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMax slice">${layers}</svg>`;
}

/**
 * Le décor de chaque classe, derrière le personnage : un document SVG complet. Cinq calques au
 * plus, du fond vers l'avant, chacun un `<g>` à opacité unique : le lointain pâle, le sol,
 * l'élément de la classe — tous trois à la couleur de la classe —, les ouvertures sombres et les
 * détails clairs. Un calque sans forme est omis.
 */
export const BACKDROPS: Readonly<Record<ClassKey, string>> = perClass(backdrop);

/**
 * Le socle rond de figurine (direction artistique § 5, « Sol »), en unités du fichier 3D
 * (direction artistique § 7, « Repère ») : Y vers le haut, origine au centre du sol, sous les
 * pieds du personnage, qui mesure environ 2 unités.
 */
export interface Pedestal {
	/** Tronc de cône sombre, son dessus à y = 0. */
	base: {
		topRadius: number;
		bottomRadius: number;
		height: number;
		color: string;
	};
	/**
	 * Disque du dessus, à la couleur de la classe, centré à la hauteur `centerY` : il dépasse de
	 * la base de `centerY + thickness / 2`.
	 */
	top: { radius: number; thickness: number; centerY: number; color: string };
	/**
	 * Hauteur des pieds du personnage au-dessus de y = 0 : il flotte au-dessus du socle, assez près
	 * pour que ses pieds, vus d'un peu haut, restent au milieu du disque.
	 */
	lift: number;
}

export const PEDESTALS: Readonly<Record<ClassKey, Pedestal>> = perClass(
	(classKey) => ({
		base: {
			topRadius: 0.6,
			bottomRadius: 0.66,
			height: 0.14,
			color: "#3a302b",
		},
		top: {
			radius: 0.56,
			thickness: 0.02,
			centerY: -0.005,
			color: CLASS_COLORS[classKey],
		},
		lift: 0.012,
	}),
);
