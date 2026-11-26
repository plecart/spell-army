// Le rendu des pages du wiki, en Markdown GitHub (#64, « Plan du site ») : l'accueil, une page par
// thème — Personnages, Sorts, Combat —, puis le menu et le pied de page, que GitHub montre sur chaque
// page. Sur un wiki GitHub, le nom d'un fichier est le titre de sa page et la cible de ses liens, sans
// « .md ». Tout mot montré au joueur vient du fichier de textes (`textes.ts`), hors les noms des
// pages, que le plan du site fixe ; le reste est donnée : nom, description et image des sorts,
// libellés des classes et des stats, plages du code. Une section se lit dans l'ordre : son
// explication, son visuel, puis sa « Règle exacte » repliée.
import { readFile } from "node:fs/promises";
import { type EffectCategory, effectCategory, type Spell } from "combat";
import type { SpellImage } from "donnees";
import {
	CLASS_KEYS,
	CLASS_RANGES,
	type ClassKey,
	STAT_KEYS,
} from "personnages";
import { CLASS_NAMES } from "../../app/annuaire/address.ts";
import type { ImageType } from "../../app/mcp/image.ts";
import { STAT_NAMES } from "../../app/stat-names.ts";
import type { WikiFiles } from "./folder.ts";
import { STAT_MAXIMUM, type WikiText } from "./textes.ts";

/** Un sort à publier : le modèle de `combat`, et son image ou `null`. */
export type WikiSpell = Spell & { image: SpellImage | null };

/**
 * Les octets des deux visuels réservés (#64, D8) : le carré des portraits et des vignettes de
 * sorts, et la bannière de l'accueil.
 */
export interface Placeholders {
	square: Uint8Array;
	banner: Uint8Array;
}

/** Les textes du wiki, par clé (`textsOf`). */
type Texts = ReadonlyMap<string, WikiText>;

/** Ce que lit le rendu d'une page : les textes, et de quoi y montrer un visuel. */
interface Context {
	texts: Texts;
	/** Recopie `bytes` sous `path` dans le wiki, et rend `path`. */
	show(path: string, bytes: Uint8Array): string;
	/** Le chemin du visuel réservé `kind`, recopié dans le wiki. */
	placeholder(kind: keyof Placeholders): string;
}

/** Les pages ; `Home` est l'accueil qu'impose GitHub, `_Sidebar` et `_Footer` son menu et son pied de page. */
const PAGES = {
	home: "Home",
	characters: "Personnages",
	spells: "Sorts",
	combat: "Combat",
	sidebar: "_Sidebar",
	footer: "_Footer",
} as const;

/** Le fichier de chaque visuel réservé, rangé avec le générateur et recopié sous `images/`. */
const PLACEHOLDER_FILES = {
	square: "a-venir-carre.png",
	banner: "a-venir-banniere.png",
} as const satisfies Record<keyof Placeholders, string>;

/** Les thèmes, dans l'ordre de l'accueil et du menu : la clé de leur texte et leur page. */
const THEMES = [
	{ key: "theme-personnages", page: PAGES.characters },
	{ key: "theme-sorts", page: PAGES.spells },
	{ key: "theme-combat", page: PAGES.combat },
] as const;

// Les sections de chaque page, par clé de texte, dans l'ordre du plan du site.
const CHARACTER = "ton-personnage";
const CHARACTER_PARTS = ["ta-classe", "tes-stats", "ton-verdict", "ton-sort"];
const CLASSES = "les-classes";
const HOW_A_SPELL_WORKS = "comment-marche-un-sort";
const COMBAT_SECTIONS = [
	"qui-joue",
	"qui-joue-le-plus-souvent",
	"comment-ca-finit",
	"petite-ou-grande-armee",
];

/** La clé du texte de la section de chaque effet, dans l'ordre de la page Sorts. */
const EFFECT_SECTIONS = {
	damage: "degats",
	heal: "soin",
	lifesteal: "vol-de-vie",
} as const satisfies Record<EffectCategory, string>;

// La largeur d'affichage, en pixels, d'un portrait de classe et d'une vignette de sort.
const PORTRAIT_WIDTH = 160;
const THUMBNAIL_WIDTH = 96;

// Une case de barre de stat (#64, D11) : pleine dans la plage de la classe, vide hors d'elle. Deux
// « Block Elements » (U+2588 et U+2591) qu'une police à chasse fixe dessine sur une case de texte,
// comme le tiret de « 0–8 » : mesuré le 2026-11-26 sur Consolas, la police Windows de la pile
// `monospace` de GitHub (Primer, `font-stack.json5`), Cascadia Mono, Courier New, Lucida Console et
// Ubuntu Mono.
const FULL_CELL = "█";
const EMPTY_CELL = "░";

// Les blancs d'un nom ou d'une description de sort : un seul saut de ligne couperait sa ligne de
// tableau.
const BLANKS = /\s+/g;

// Ce qu'un texte de sort ferait lire comme du Markdown : antislash, code, emphase, lien, HTML, entité,
// cellule de tableau, barré. Un antislash devant le rend littéral (GFM, « Backslash escapes »).
const MARKDOWN_SPECIALS = /[\\`*_[\]<>&|~]/g;

// Ce qu'une valeur d'attribut HTML entre guillemets ne garde pas telle quelle — guillemet,
// esperluette — et la barre verticale, qui couperait sa cellule de tableau (GFM, « Tables »).
const ATTRIBUTE_SPECIALS = /[&"|]/g;

// Ce que GitHub retire d'un titre pour en faire l'ancre : tout sauf les lettres, les marques, les
// chiffres décimaux, le tiret bas, le tiret et l'espace ; et ses seules capitales ASCII passent en
// minuscules. Lu le 2026-11-26 : `[^\p{Word}\- ]` et `downcase(:ascii)` du `TableOfContentsFilter`
// de html-pipeline v2.14.3, et l'ancre `…-greek-letter-Θ` de docs.github.com (« Basic writing and
// formatting syntax », « Section links »). Constaté le 2026-11-26 sur le wiki publié : `dégâts`,
// `qui-joue-` (#64).
const NOT_IN_ANCHOR = /[^\p{L}\p{M}\p{Nd}\p{Pc} -]/gu;
const ASCII_CAPITAL = /[A-Z]/g;

// L'extension d'une image, par type : les trois qu'admet la table `spells` (`spells_image_type_check`).
const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
} satisfies Record<ImageType, string>;

/**
 * L'ancre que GitHub donne au titre `title` : ses capitales ASCII en minuscules — « É » reste —,
 * sans ponctuation hors `-` et `_`, chaque espace en tiret. « Qui joue ? » donne `qui-joue-`.
 */
export const anchorOf = (title: string) =>
	title
		.replace(ASCII_CAPITAL, (capital) => capital.toLowerCase())
		.replace(NOT_IN_ANCHOR, "")
		.replaceAll(" ", "-");

/** `text` tel quel une fois rendu en Markdown, sur une ligne : ses blancs réduits à une espace. */
const literal = (text: string) =>
	text.replace(BLANKS, " ").replace(MARKDOWN_SPECIALS, "\\$&");

/** `text` tel quel en valeur d'attribut HTML, dans une cellule de tableau, sur une ligne. */
const attribute = (text: string) =>
	text
		.replace(BLANKS, " ")
		.replace(ATTRIBUTE_SPECIALS, (char) => `&#${char.codePointAt(0)};`);

const link = (text: string, target: string) => `[${text}](${target})`;

const heading = (level: number, title: string) =>
	`${"#".repeat(level)} ${title}`;

/** Une balise d'image ; sans largeur, l'image garde la sienne. */
function image(source: string, alt: string, width?: number): string {
	const size = width === undefined ? "" : ` width="${width}"`;
	return `<img src="${source}"${size} alt="${attribute(alt)}">`;
}

/** Des blocs Markdown, séparés d'une ligne vide ; un bloc absent est omis. */
const blocks = (...parts: (string | undefined)[]) =>
	parts.filter((part) => part !== undefined).join("\n\n");

/** Un tableau Markdown : son en-tête, puis une ligne par élément de `rows`. */
function table(header: readonly string[], rows: readonly string[][]): string {
	return [header, header.map(() => "---"), ...rows]
		.map((cells) => `| ${cells.join(" | ")} |`)
		.join("\n");
}

/** Le champ `field` de l'entrée `key` des textes ; une erreur qui les nomme s'il manque. */
function textOf(texts: Texts, key: string, field: "title" | "text"): string {
	const value = texts.get(key)?.[field];
	if (value === undefined) {
		throw new Error(
			`Le fichier de textes n'a pas de « ${field} » pour « ${key} ».`,
		);
	}
	return value;
}

/**
 * La section de l'entrée `key` : son titre de niveau `level`, son texte, `visuals`, puis la Règle
 * exacte de l'entrée, s'il en a une, dans un bloc fermé par défaut (#64, D5).
 */
function section(
	{ texts }: Context,
	level: number,
	key: string,
	...visuals: string[]
): string {
	const rule = texts.get(key)?.rule;
	return blocks(
		heading(level, textOf(texts, key, "title")),
		textOf(texts, key, "text"),
		...visuals,
		rule &&
			[
				"<details>",
				`<summary>${textOf(texts, "regle-exacte", "title")}</summary>`,
				"",
				rule,
				"",
				"</details>",
			].join("\n"),
	);
}

/** Le lien vers `page`, sous le titre de l'entrée `key`. */
const pageLink = (texts: Texts, key: string, page: string) =>
	link(textOf(texts, key, "title"), page);

/** Le lien vers la section de l'entrée `key` de `page`, par l'ancre de son titre. */
function sectionLink(texts: Texts, page: string, key: string): string {
	const title = textOf(texts, key, "title");
	return link(title, `${page}#${anchorOf(title)}`);
}

/**
 * Le chemin de l'image d'un sort : `images/sort-3.png`, son extension tirée de son type ; une erreur
 * qui nomme le sort pour un type inconnu.
 */
function imagePath(number: number, { type }: SpellImage): string {
	const extension = IMAGE_EXTENSIONS[type];
	if (extension === undefined) {
		throw new Error(
			`Le sort n° ${number} a une image d'un type inconnu : ${type}.`,
		);
	}
	return `images/sort-${number}.${extension}`;
}

/**
 * Les barres des stats d'une classe (#64, D11), dans un bloc à chasse fixe : par stat, son nom, une
 * case par point de 0 à `STAT_MAXIMUM`, pleine dans la plage de la classe, puis « min–max ».
 */
function bars(key: ClassKey): string {
	const width = Math.max(...STAT_KEYS.map((stat) => STAT_NAMES[stat].length));
	const lines = STAT_KEYS.map((stat) => {
		const [min, max] = CLASS_RANGES[key][stat];
		const cells = Array.from({ length: STAT_MAXIMUM + 1 }, (_, point) =>
			point < min || point > max ? EMPTY_CELL : FULL_CELL,
		).join("");
		return `${STAT_NAMES[stat].padEnd(width)} ${cells} ${min}–${max}`;
	});
	return ["```", ...lines, "```"].join("\n");
}

/** Le visuel réservé `kind`, à sa largeur `width` s'il en a une. */
const placeholderImage = (
	context: Context,
	kind: keyof Placeholders,
	width?: number,
) =>
	image(
		context.placeholder(kind),
		textOf(context.texts, "visuel-a-venir", "title"),
		width,
	);

/** La section d'une classe : son libellé, sa phrase de caractère, son portrait, puis ses barres. */
function classSection(context: Context, key: ClassKey): string {
	const { label, slug } = CLASS_NAMES[key];
	return blocks(
		heading(3, label),
		textOf(context.texts, `classe-${slug}`, "text"),
		placeholderImage(context, "square", PORTRAIT_WIDTH),
		bars(key),
	);
}

/** Un tableau d'effet : par sort, sa vignette, son nom et sa description. */
function spellTable(context: Context, spells: readonly WikiSpell[]): string {
	const { texts } = context;
	return table(
		["colonne-visuel", "colonne-sort", "colonne-description"].map((key) =>
			textOf(texts, key, "title"),
		),
		spells.map(({ number, name, description, image: picture }) => [
			image(
				picture === null
					? context.placeholder("square")
					: context.show(imagePath(number, picture), picture.bytes),
				name,
				THUMBNAIL_WIDTH,
			),
			literal(name),
			literal(description),
		]),
	);
}

/** Les sorts de chaque effet qui en a, dans l'ordre de la page Sorts, avec la clé de sa section. */
function effectGroups(spells: readonly WikiSpell[]) {
	return Object.entries(EFFECT_SECTIONS)
		.map(([effect, key]) => ({
			key,
			spells: spells.filter((spell) => effectCategory(spell.effect) === effect),
		}))
		.filter((group) => group.spells.length > 0);
}

type EffectGroup = ReturnType<typeof effectGroups>[number];

/** L'accueil : la bannière, le jeu, comment rejoindre l'armée, puis un lien vers chaque thème. */
function home(context: Context): string {
	const { texts } = context;
	return blocks(
		placeholderImage(context, "banner"),
		section(context, 2, "accueil"),
		section(context, 2, "rejoindre"),
		heading(2, textOf(texts, "themes", "title")),
		THEMES.map(
			({ key, page }) =>
				`- ${pageLink(texts, key, page)} — ${textOf(texts, key, "text")}`,
		).join("\n"),
	);
}

/** Les personnages : le tien, en quatre parties, puis chaque classe dans l'ordre de `CLASS_KEYS`. */
function characters(context: Context): string {
	return blocks(
		section(context, 2, CHARACTER),
		...CHARACTER_PARTS.map((key) => section(context, 3, key)),
		section(context, 2, CLASSES),
		...CLASS_KEYS.map((key) => classSection(context, key)),
	);
}

/** Les sorts : comment ils marchent, puis un tableau par effet. */
function spellsPage(context: Context, groups: readonly EffectGroup[]): string {
	return blocks(
		section(context, 2, HOW_A_SPELL_WORKS),
		...groups.map(({ key, spells }) =>
			section(context, 2, key, spellTable(context, spells)),
		),
	);
}

/** Le combat : un tour, avec son schéma, puis ses règles. */
function combat(context: Context): string {
	const schema = textOf(context.texts, "schema-tour-de-combat", "text");
	return blocks(
		section(
			context,
			2,
			"tour-de-combat",
			["```mermaid", schema, "```"].join("\n"),
		),
		...COMBAT_SECTIONS.map((key) => section(context, 2, key)),
	);
}

/** Le menu : l'accueil, puis chaque thème, avec les sections des personnages et des sorts. */
function sidebar(texts: Texts, groups: readonly EffectGroup[]): string {
	const sections: Readonly<Record<string, readonly string[]>> = {
		[PAGES.characters]: [CHARACTER, CLASSES],
		[PAGES.spells]: [HOW_A_SPELL_WORKS, ...groups.map(({ key }) => key)],
	};
	return [
		`- ${pageLink(texts, "menu-accueil", PAGES.home)}`,
		...THEMES.flatMap(({ key, page }) => [
			`- ${pageLink(texts, key, page)}`,
			...(sections[page] ?? []).map(
				(section) => `  - ${sectionLink(texts, page, section)}`,
			),
		]),
	].join("\n");
}

/** Les octets des visuels réservés, lus avec le générateur ; une erreur de Node s'ils ne se lisent pas. */
export async function readPlaceholders(): Promise<Placeholders> {
	const read = (kind: keyof Placeholders) =>
		readFile(new URL(PLACEHOLDER_FILES[kind], import.meta.url));
	return { square: await read("square"), banner: await read("banner") };
}

/**
 * Les fichiers du wiki : `Home`, `Personnages`, `Sorts`, `Combat`, `_Sidebar` et `_Footer`, puis
 * sous `images/` l'image de chaque sort qui en a une et chaque visuel réservé qu'une page montre. Un
 * effet sans sort n'a ni section ni entrée au menu. Une page finit par un saut de ligne ; rien n'y
 * dépend de l'heure : les mêmes entrées rendent les mêmes octets.
 *
 * `spells` : les sorts à publier, valides (`validateSpell`), dans l'ordre de leurs tableaux ; le tri
 * des tirables revient à l'appelant. Lève une erreur pour une image d'un type inconnu, ou une entrée
 * de `texts` sans le titre ou le texte qu'une page lui demande.
 */
export function wikiPages(
	texts: Texts,
	spells: readonly WikiSpell[],
	placeholders: Placeholders,
): WikiFiles {
	const files: WikiFiles = new Map();
	const show = (path: string, bytes: Uint8Array) => {
		files.set(path, bytes);
		return path;
	};
	const context: Context = {
		texts,
		show,
		placeholder: (kind) =>
			show(`images/${PLACEHOLDER_FILES[kind]}`, placeholders[kind]),
	};
	const groups = effectGroups(spells);
	const pages = {
		[PAGES.home]: home(context),
		[PAGES.characters]: characters(context),
		[PAGES.spells]: spellsPage(context, groups),
		[PAGES.combat]: combat(context),
		[PAGES.sidebar]: sidebar(texts, groups),
		[PAGES.footer]: textOf(texts, "pied-de-page", "text"),
	};
	for (const [name, content] of Object.entries(pages)) {
		files.set(`${name}.md`, `${content}\n`);
	}
	return files;
}
