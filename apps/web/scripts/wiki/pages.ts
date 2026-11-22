// Le rendu des pages du wiki, en Markdown GitHub. Sur un wiki GitHub, le nom d'un fichier est le
// titre de sa page et la cible de ses liens, sans « .md ». Une page n'écrit que des passages
// recopiés des documents, des valeurs du code, la transcription des sorts (`spell-text.ts`) et des
// titres fixes.
import type { Spell } from "combat";
import type { SpellImage } from "donnees";
import {
	CLASS_KEYS,
	CLASS_RANGES,
	type ClassKey,
	STAT_KEYS,
} from "personnages";
import { CLASS_NAMES } from "../../app/annuaire/address.ts";
import type { ImageType } from "../../app/mcp/image.ts";
import type { WikiFiles } from "./folder.ts";
import type { Passages } from "./passages.ts";
import { STAT_NAMES, spellText } from "./spell-text.ts";

/** Un sort à publier : le modèle de `combat`, et son image ou `null`. */
export type WikiSpell = Spell & { image: SpellImage | null };

/** Les pages fixes ; `Home` est l'accueil qu'impose GitHub. */
const PAGES = {
	home: "Home",
	combat: "Combat",
	classes: "Classes",
	spells: "Sorts",
} as const;

const STAT_HEADERS = STAT_KEYS.map((stat) => STAT_NAMES[stat]);

// Ce qui sépare les mots d'un nom de page de sort : tout sauf les lettres, les chiffres et
// l'apostrophe, donc tout caractère qu'interdit Windows (`\ / : * ? " < > |`) ou qu'un lien
// Markdown lirait. Le nom est d'abord composé (NFC) : décomposée, une lettre porte son accent en
// marque combinante, qui n'est pas une lettre et couperait le mot.
const NAME_SEPARATORS = /[^\p{L}\p{N}']+/u;

// Les blancs d'un nom de sort : un seul saut de ligne couperait sa ligne de tableau.
const BLANKS = /\s+/g;

// Ce qu'un nom de sort ferait lire comme du Markdown : antislash, code, emphase, lien, HTML, entité,
// cellule de tableau, barré. Un antislash devant le rend littéral (GFM, « Backslash escapes »).
const MARKDOWN_SPECIALS = /[\\`*_[\]<>&|~]/g;

// L'extension d'une image, par type : les trois qu'admet la table `spells` (`spells_image_type_check`).
const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
} satisfies Record<ImageType, string>;

/** `text` tel quel une fois rendu en Markdown, sur une ligne : ses blancs réduits à une espace. */
const literal = (text: string) =>
	text.replace(BLANKS, " ").replace(MARKDOWN_SPECIALS, "\\$&");

const link = (text: string, page: string) => `[${text}](${page})`;

/**
 * La page d'un sort : « Sort-3-Charge ». Le numéro la rend unique et stable, le nom lisible ; ses
 * mots, composés (NFC), ne gardent que lettres, chiffres et apostrophes.
 */
function spellPage({ number, name }: Pick<Spell, "number" | "name">): string {
	const words = name.normalize("NFC").split(NAME_SEPARATORS).filter(Boolean);
	return ["Sort", number, ...words].join("-");
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

/** Un tableau Markdown : son en-tête, puis une ligne par élément de `rows`. */
function table(header: readonly string[], rows: readonly string[][]): string {
	return [header, header.map(() => "---"), ...rows]
		.map((cells) => `| ${cells.join(" | ")} |`)
		.join("\n");
}

/** Les plages des stats d'une classe, « 0–8 », bornes comprises, dans l'ordre des stats. */
function ranges(key: ClassKey): string[] {
	return STAT_KEYS.map((stat) => CLASS_RANGES[key][stat].join("–"));
}

/** L'accueil : le concept, puis un lien vers chaque page d'index. */
function home({ concept }: Passages): string {
	const links = [PAGES.classes, PAGES.spells, PAGES.combat].map(
		(page) => `- ${link(page, page)}`,
	);
	return [concept, links.join("\n")].join("\n\n");
}

/** Le combat : la puissance d'un sort, puis le déroulé d'un combat. */
function combat({ power, combat }: Passages): string {
	return [power, "## Déroulé d'un combat", combat].join("\n\n");
}

/** Une ligne par classe, liée à sa page, avec ses plages. */
function classesIndex(): string {
	return table(
		["Classe", ...STAT_HEADERS],
		CLASS_KEYS.map((key) => {
			const { label } = CLASS_NAMES[key];
			return [link(label, label), ...ranges(key)];
		}),
	);
}

/** Une ligne par sort, son nom lié à sa page, avec sa recette, sa forme et son effet. */
function spellsIndex(spells: readonly WikiSpell[]): string {
	return table(
		["Sort", "Recette", "Forme", "Effet"],
		spells.map((spell) => {
			const { recipe, form, effect } = spellText(spell);
			return [
				link(literal(spell.name), spellPage(spell)),
				recipe,
				form,
				effect,
			];
		}),
	);
}

/** La fiche d'un sort : nom, recette, forme et effet, puis son image s'il en a une. */
function spellSheet(spell: WikiSpell): string {
	const { recipe, form, effect } = spellText(spell);
	const name = literal(spell.name);
	const sheet = [
		`- **Nom** : ${name}`,
		`- **Recette** : ${recipe}`,
		`- **Forme** : ${form}`,
		`- **Effet** : ${effect}`,
	].join("\n");
	return spell.image === null
		? sheet
		: `${sheet}\n\n![${name}](${imagePath(spell.number, spell.image)})`;
}

/**
 * Les fichiers du wiki : l'accueil, le combat, l'index des classes et une page par classe de
 * `CLASS_KEYS`, l'index des sorts et une page par sort de `spells`, dans leur ordre, puis l'image de
 * chaque sort qui en a une. Une page finit par un saut de ligne ; rien n'y dépend de l'heure : les
 * mêmes entrées rendent les mêmes octets.
 *
 * `spells` : les sorts à publier, valides (`validateSpell`) ; le tri des tirables revient à
 * l'appelant. Lève une erreur pour une image d'un type inconnu.
 */
export function wikiPages(
	passages: Passages,
	spells: readonly WikiSpell[],
): WikiFiles {
	const files: WikiFiles = new Map();
	const page = (name: string, content: string) =>
		files.set(`${name}.md`, `${content}\n`);
	page(PAGES.home, home(passages));
	page(PAGES.combat, combat(passages));
	page(PAGES.classes, classesIndex());
	for (const key of CLASS_KEYS) {
		page(CLASS_NAMES[key].label, table(STAT_HEADERS, [ranges(key)]));
	}
	page(PAGES.spells, spellsIndex(spells));
	for (const spell of spells) {
		page(spellPage(spell), spellSheet(spell));
		if (spell.image !== null) {
			files.set(imagePath(spell.number, spell.image), spell.image.bytes);
		}
	}
	return files;
}
