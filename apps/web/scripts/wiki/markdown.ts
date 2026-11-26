// Le Markdown GitHub des pages du wiki : un texte rendu tel quel, un lien, un titre, une image, des
// blocs et un tableau, et l'ancre que GitHub donne à un titre. Rien n'y connaît le jeu.

// Les blancs d'un texte rendu sur une ligne : un seul saut de ligne couperait sa ligne de tableau.
const BLANKS = /\s+/g;

// Ce qu'un texte ferait lire comme du Markdown : antislash, code, emphase, lien, HTML, entité,
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
export const literal = (text: string) =>
	text.replace(BLANKS, " ").replace(MARKDOWN_SPECIALS, "\\$&");

/** `text` tel quel en valeur d'attribut HTML, dans une cellule de tableau, sur une ligne. */
const attribute = (text: string) =>
	text
		.replace(BLANKS, " ")
		.replace(ATTRIBUTE_SPECIALS, (char) => `&#${char.codePointAt(0)};`);

/** Un lien Markdown vers `target`. */
export const link = (text: string, target: string) => `[${text}](${target})`;

/** Un titre ATX de niveau `level`. */
export const heading = (level: number, title: string) =>
	`${"#".repeat(level)} ${title}`;

/** Une balise d'image ; sans largeur, l'image garde la sienne. */
export function image(source: string, alt: string, width?: number): string {
	const size = width === undefined ? "" : ` width="${width}"`;
	return `<img src="${source}"${size} alt="${attribute(alt)}">`;
}

/** Des blocs Markdown, séparés d'une ligne vide ; un bloc absent est omis. */
export const blocks = (...parts: (string | undefined)[]) =>
	parts.filter((part) => part !== undefined).join("\n\n");

/** Un tableau Markdown : son en-tête, puis une ligne par élément de `rows`. */
export function table(
	header: readonly string[],
	rows: readonly string[][],
): string {
	return [header, header.map(() => "---"), ...rows]
		.map((cells) => `| ${cells.join(" | ")} |`)
		.join("\n");
}
