// Les passages des documents que le wiki recopie, lus à la génération : le concept au cadrage, la
// puissance d'un sort et le combat au game design (`passagesOf`), et ceux que déclarent les
// explications du fichier de textes (`rawPassages`), avec leur empreinte et leur « Règle exacte ».
// Les sections se découpent par leurs titres, comme `packages/combat/test/annexe-b.ts` lit
// l'annexe B. Un passage introuvable ou incomplet arrête la génération en le nommant, jamais une page
// vide ; les statuts internes n'y sont pas recopiés.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/** Les passages recopiés, en Markdown, sans statut interne. */
export interface Passages {
	/** Cadrage, § 1 « Ce qui est ferme », la puce « Le concept », sur une ligne. */
	concept: string;
	/** Game design, § 2 : le bloc « Puissance d'un sort lancé par l'armée », sa formule et le paragraphe qui la suit. */
	power: string;
	/** Game design, § 4 « Le combat », entier. */
	combat: string;
}

/** Le texte des deux documents. */
export interface Documents {
	cadrage: string;
	gameDesign: string;
}

const CADRAGE = "docs/etudes/00-cadrage.md";
const GAME_DESIGN = "docs/game-design.md";
const ROOT = new URL("../../../../", import.meta.url);

const BLOCK_SEPARATOR = "\n\n";
// La puce « Le concept » et ses lignes de suite, indentées de deux espaces.
const CONCEPT = /^- (\*\*Le concept\*\* :.*(?:\n {2}.*)*)/m;
const POWER = "Puissance d'un sort lancé par l'armée";
// Son titre en gras, puis la formule en citation et le paragraphe qui la suit, reconnus à leur forme.
const POWER_FORMULA = "> valeur = ";
// Le début d'un bloc qui n'est pas un paragraphe, sans indentation : tableau (GFM), citation, titre
// ATX, bloc HTML, liste à puces ou numérotée suivie d'une espace, code clôturé (``` ou ~~~) ou
// indenté de quatre espaces, ligne de séparation seule. Ne voit ni titre setext, ni définition de
// lien, ni liste indentée ou à tabulation ; refuse à tort un paragraphe ouvert par un autolien
// `<…>`.
const NOT_PARAGRAPH = /^(?:[|>#<]|[-*+] |\d+[.)] |```|~~~| {4}|([-*_])\1{2,}$)/;

// Les statuts internes des documents, que le wiki ne montre pas : entre parenthèses après un titre,
// « (décidé) », et en colonne d'un tableau.
const INLINE_STATUS = / \((?:décidé|proposé|ouvert)\)/giu;
const STATUS_COLUMN = "Statut";
// Les renvois internes entre parenthèses, avec les blancs qui les précèdent (#64, D9 et T3) :
// « (#10) », « (ADR 0001) », « (§ 2) », « (§ 6, « Équilibre ») », « (mesuré : … ) », « (annexe A) »,
// « (annexes A et B, § 3) ». Population bornée : les formes des passages autorisés, recomptées sur
// les passages réels par `wiki-textes.test.ts`, pas toute la prose des documents.
const INTERNAL_REFERENCE =
	/\s*\((?:#\d+|ADR \d+|§ [^)]*|mesuré :[^)]*|annexes? [A-Z][^)]*)\)/g;
// Une barre verticale de tableau, hors d'une barre échappée par un antislash (GFM, « Tables »).
const CELL_SEPARATOR = /(?<!\\)\|/;

// Un titre ATX : ses `#`, puis son texte.
const HEADING = /^(#+) (.*)$/;
// Le libellé en gras qui ouvre une puce, « - **Le concept** : … ».
const BULLET_LABEL = /^- \*\*(.+?)\*\*/;
// Le titre en gras qui ouvre un bloc, sans son point final : « **Selon la taille de l'armée.** … ».
const BLOCK_TITLE = /^\*\*(.+?)\.?\*\*/;
// Ce qui clôt un bloc et ses suites : un tableau, un titre, un autre titre en gras.
const BLOCK_END = /^(?:\||#|\*\*)/;
// Les lignes de suite d'une puce, indentées de deux espaces.
const BULLET_CONTINUATION = "  ";

/** Les documents que peut citer un passage, par chemin dans le dépôt. */
const DOCUMENT_KEYS: ReadonlyMap<string, keyof Documents> = new Map([
	[CADRAGE, "cadrage"],
	[GAME_DESIGN, "gameDesign"],
]);

// L'empreinte d'un passage : le début hexadécimal de son SHA-256, assez long pour qu'une
// modification du passage la change (#64, D3 et T7).
const FINGERPRINT_LENGTH = 12;

/**
 * Où lire un passage : dans `document` (son chemin dans le dépôt), sous le titre `section`, de tout
 * niveau, les lignes d'un tableau nommées par leur première cellule (`rows`) ; une puce ouverte par
 * son libellé en gras (`bullet`) ; ou un bloc ouvert par son titre en gras (`block`), avec les blocs
 * qui le suivent jusqu'au prochain tableau, titre ou titre en gras.
 */
export type PassageLocator = { document: string; section: string } & (
	| { rows: readonly string[] }
	| { bullet: string }
	| { block: string }
);

/** Un tableau sans sa colonne « Statut » ; tout autre bloc tel quel. */
function withoutStatusColumn(block: string): string {
	if (!block.startsWith("|")) return block;
	const rows = block.split("\n").map((row) => row.split(CELL_SEPARATOR));
	const column = rows[0]?.findIndex((cell) => cell.trim() === STATUS_COLUMN);
	if (column === undefined || column < 0) return block;
	return rows.map((cells) => cells.toSpliced(column, 1).join("|")).join("\n");
}

/** `markdown` sans ses statuts internes. */
function withoutStatuses(markdown: string): string {
	return markdown
		.replace(INLINE_STATUS, "")
		.split(BLOCK_SEPARATOR)
		.map(withoutStatusColumn)
		.join(BLOCK_SEPARATOR);
}

/** Le niveau du titre ATX `line`, le nombre de ses `#` ; l'infini pour une ligne qui n'en est pas un. */
const headingLevel = (line: string) =>
	HEADING.exec(line)?.[1]?.length ?? Number.POSITIVE_INFINITY;

/**
 * Le corps de la section de titre `title`, de tout niveau, dans `document` : jusqu'au titre suivant
 * de même niveau ou plus haut. `name` nomme le document dans l'erreur si la section manque.
 */
function section(document: string, name: string, title: string): string {
	const lines = document.split("\n");
	const start = lines.findIndex((line) => HEADING.exec(line)?.[2] === title);
	if (start < 0) {
		throw new Error(`${name} : section « ${title} » introuvable.`);
	}
	const level = headingLevel(lines[start] ?? "");
	const end = lines.findIndex(
		(line, index) => index > start && headingLevel(line) <= level,
	);
	return lines
		.slice(start + 1, end < 0 ? undefined : end)
		.join("\n")
		.trim();
}

function concept(cadrage: string): string {
	const bullet = CONCEPT.exec(
		section(cadrage, CADRAGE, "1. Ce qui est ferme"),
	)?.[1];
	if (bullet === undefined) {
		throw new Error(`${CADRAGE} : puce « Le concept » introuvable au § 1.`);
	}
	return bullet.replace(/\n +/g, " ");
}

function power(gameDesign: string): string {
	const blocks = section(gameDesign, GAME_DESIGN, "2. Les sorts").split(
		BLOCK_SEPARATOR,
	);
	const start = blocks.findIndex((block) => block.startsWith(`**${POWER}**`));
	if (start < 0) {
		throw new Error(`${GAME_DESIGN} : bloc « ${POWER} » introuvable au § 2.`);
	}
	const [title, formula, paragraph] = blocks.slice(start);
	if (
		!formula?.startsWith(POWER_FORMULA) ||
		paragraph === undefined ||
		NOT_PARAGRAPH.test(paragraph)
	) {
		throw new Error(
			`${GAME_DESIGN} : bloc « ${POWER} » incomplet au § 2 : sa formule ou le paragraphe qui la suit manque.`,
		);
	}
	return [title, formula, paragraph].join(BLOCK_SEPARATOR);
}

/**
 * Les passages que recopie le wiki, extraits du texte des deux documents. Lève une erreur qui nomme
 * le document et la section, la puce ou le bloc introuvable, ou le bloc incomplet.
 */
export function passagesOf({ cadrage, gameDesign }: Documents): Passages {
	return {
		concept: withoutStatuses(concept(cadrage)),
		power: withoutStatuses(power(gameDesign)),
		combat: withoutStatuses(section(gameDesign, GAME_DESIGN, "4. Le combat")),
	};
}

/** La première cellule d'une ligne de tableau, sans ses blancs. */
const firstCell = (row: string) => row.split(CELL_SEPARATOR)[1]?.trim();

/**
 * Les lignes `labels` du tableau de `body` qui porte la première, sous son en-tête et dans l'ordre
 * du tableau ; `where` nomme la section dans l'erreur si l'une manque.
 */
function rows(body: string, labels: readonly string[], where: string): string {
	const table =
		body
			.split(BLOCK_SEPARATOR)
			.map((block) => block.split("\n"))
			.find(
				(lines) =>
					lines[0]?.startsWith("|") &&
					lines.slice(2).some((row) => firstCell(row) === labels[0]),
			) ?? [];
	const [header = "", separator = "", ...data] = table;
	const missing = labels.find(
		(label) => !data.some((row) => firstCell(row) === label),
	);
	if (missing !== undefined) {
		throw new Error(`${where} : ligne « ${missing} » introuvable.`);
	}
	const kept = data.filter((row) => labels.includes(firstCell(row) ?? ""));
	return [header, separator, ...kept].join("\n");
}

/** La puce de `body` ouverte par le libellé en gras `label`, sur une ligne. */
function bullet(body: string, label: string, where: string): string {
	const lines = body.split("\n");
	const start = lines.findIndex(
		(line) => BULLET_LABEL.exec(line)?.[1] === label,
	);
	if (start < 0) {
		throw new Error(`${where} : puce « ${label} » introuvable.`);
	}
	const end = lines.findIndex(
		(line, index) => index > start && !line.startsWith(BULLET_CONTINUATION),
	);
	return lines
		.slice(start, end < 0 ? undefined : end)
		.map((line) => line.trim())
		.join(" ")
		.slice("- ".length);
}

/** Le bloc de `body` ouvert par le titre en gras `label`, avec ses suites. */
function block(body: string, label: string, where: string): string {
	const blocks = body.split(BLOCK_SEPARATOR);
	const start = blocks.findIndex(
		(candidate) => BLOCK_TITLE.exec(candidate)?.[1] === label,
	);
	if (start < 0) {
		throw new Error(`${where} : bloc « ${label} » introuvable.`);
	}
	const end = blocks.findIndex(
		(candidate, index) => index > start && BLOCK_END.test(candidate),
	);
	return blocks.slice(start, end < 0 ? undefined : end).join(BLOCK_SEPARATOR);
}

/** Le texte brut du passage `locator`, tel que son document l'écrit. */
function passage(documents: Documents, locator: PassageLocator): string {
	const key = DOCUMENT_KEYS.get(locator.document);
	if (key === undefined) {
		throw new Error(`Document inconnu : ${locator.document}.`);
	}
	const body = section(documents[key], locator.document, locator.section);
	const where = `${locator.document}, section « ${locator.section} »`;
	if ("rows" in locator) return rows(body, locator.rows, where);
	if ("bullet" in locator) return bullet(body, locator.bullet, where);
	return block(body, locator.block, where);
}

/**
 * Le texte brut des passages `locators`, à la suite, avant tout filtre. Lève une erreur qui nomme
 * le document inconnu, ou le document, la section et la ligne, la puce ou le bloc introuvable.
 */
export function rawPassages(
	documents: Documents,
	locators: readonly PassageLocator[],
): string {
	return locators
		.map((locator) => passage(documents, locator))
		.join(BLOCK_SEPARATOR);
}

/** La « Règle exacte » d'un texte brut de passages : sans statut ni renvoi interne (#64, D9). */
export const exactRule = (raw: string) =>
	withoutStatuses(raw).replace(INTERNAL_REFERENCE, "");

/** L'empreinte d'un texte brut de passages, qui change quand il change. */
export const fingerprintOf = (raw: string) =>
	createHash("sha256").update(raw).digest("hex").slice(0, FINGERPRINT_LENGTH);

/** Le texte des deux documents, lu dans le dépôt ; une erreur de Node s'il ne se lit pas. */
export async function readDocuments(): Promise<Documents> {
	const read = (path: string) => readFile(new URL(path, ROOT), "utf8");
	return { cadrage: await read(CADRAGE), gameDesign: await read(GAME_DESIGN) };
}
