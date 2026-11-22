// Les passages des documents que le wiki recopie, lus à la génération : le concept au cadrage, la
// puissance d'un sort et le combat au game design. Les sections se découpent par leurs titres `## `,
// comme `packages/combat/test/annexe-b.ts` lit l'annexe B. Un passage introuvable ou incomplet
// arrête la génération en le nommant, jamais une page vide ; les statuts internes n'y sont pas
// recopiés.
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
// lien, ni liste indentée ou à tabulation.
const NOT_PARAGRAPH = /^(?:[|>#<]|[-*+] |\d+[.)] |```|~~~| {4}|([-*_])\1{2,}$)/;

// Les statuts internes des documents, que le wiki ne montre pas : entre parenthèses après un titre,
// « (décidé) », et en colonne d'un tableau.
const INLINE_STATUS = / \((?:décidé|proposé|ouvert)\)/giu;
const STATUS_COLUMN = "Statut";
// Une barre verticale de tableau, hors d'une barre échappée par un antislash (GFM, « Tables »).
const CELL_SEPARATOR = /(?<!\\)\|/;

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

/** Le corps de la section `## <title>` de `document`, que `name` nomme dans l'erreur s'il manque. */
function section(document: string, name: string, title: string): string {
	const found = document
		.split(/^## /m)
		.find((candidate) => candidate.split("\n", 1)[0] === title);
	if (found === undefined) {
		throw new Error(`${name} : section « ${title} » introuvable.`);
	}
	return found.slice(title.length).trim();
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

/** Le texte des deux documents, lu dans le dépôt ; une erreur de Node s'il ne se lit pas. */
export async function readDocuments(): Promise<Documents> {
	const read = (path: string) => readFile(new URL(path, ROOT), "utf8");
	return { cadrage: await read(CADRAGE), gameDesign: await read(GAME_DESIGN) };
}
