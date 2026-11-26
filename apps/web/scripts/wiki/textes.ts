// Les textes du wiki, lus dans `textes.yaml` : chaque entrée porte un titre, un texte en Markdown,
// ou les deux ; une explication déclare aussi les passages des documents qu'elle explique et leur
// empreinte (#64, D2 et D3). Un chiffre ne s'y écrit jamais : il s'insère par un nom de valeur,
// `{total des points}`, que la lecture remplace par la valeur du code (D4). Le fichier est saisi à
// la main : chaque champ se valide à la lecture, et toutes les fautes sont nommées d'un coup.
import { readFile } from "node:fs/promises";
import { CLASS_KEYS, CLASS_RANGES, STAT_KEYS, STATS_TOTAL } from "personnages";
import { parse } from "yaml";
import { instagramUrl } from "../../app/site.ts";
import {
	type Documents,
	exactRule,
	fingerprintOf,
	type PassageLocator,
	rawPassages,
} from "./passages.ts";

const TEXTS_FILE = new URL("textes.yaml", import.meta.url);
const TEXTS_NAME = "apps/web/scripts/wiki/textes.yaml";

// Le compte Instagram et le domaine du jeu (cadrage § 1, « Le nom »).
const INSTAGRAM_HANDLE = "spell_army";
const SITE_DOMAIN = "spellarmy.com";

/** Le maximum d'une stat : la plus haute borne des plages des classes. */
export const STAT_MAXIMUM = Math.max(
	...Object.values(CLASS_RANGES).flatMap((ranges) =>
		Object.values(ranges).map(([, max]) => max),
	),
);

/** La valeur de chaque nom de valeur des textes, lue ici seulement. */
const VALUES: Readonly<Record<string, string>> = {
	"total des points": String(STATS_TOTAL),
	"maximum d'une stat": String(STAT_MAXIMUM),
	"nombre de classes": String(CLASS_KEYS.length),
	"nombre de stats": String(STAT_KEYS.length),
	"compte Instagram": `[@${INSTAGRAM_HANDLE}](${instagramUrl(INSTAGRAM_HANDLE)})`,
	site: `[${SITE_DOMAIN}](https://${SITE_DOMAIN})`,
};

// Une clé d'entrée, en kebab-case : des mots de minuscules ASCII et de chiffres, liés par un tiret.
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Un nom de valeur entre accolades.
const VALUE_NAME = /\{([^{}]*)\}/g;
// Une accolade restée seule une fois les noms de valeur retirés.
const BRACE = /[{}]/;
// Un chiffre, de toute écriture : arabe, exposant, fraction, romain…
const DIGIT = /\p{N}/u;

const ENTRY_FIELDS = ["title", "text", "passages", "fingerprint"];
const LOCATOR_FORMS = ["rows", "bullet", "block"];
const LOCATOR_FIELDS = ["document", "section", ...LOCATOR_FORMS];

/** Une entrée du fichier, validée. */
interface TextEntry {
	title?: string;
	text?: string;
	passages?: PassageLocator[];
	fingerprint?: string;
}

/** Une entrée rendue : titre et texte aux noms de valeur remplacés, et sa « Règle exacte ». */
export interface WikiText {
	title?: string;
	text?: string;
	/** Le Markdown filtré de ses passages ; absente sans passage. */
	rule?: string;
}

/** Une explication dont le passage a changé : sa clé, et l'empreinte de son passage actuel. */
export interface StaleText {
	key: string;
	fingerprint: string;
}

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Un texte qui ne se réduit pas à des blancs. */
const isText = (value: unknown): value is string =>
	typeof value === "string" && value.trim() !== "";

/** Un champ de `fields` hors de `allowed`, nommé. */
const unknownFields = (fields: Fields, allowed: readonly string[]) =>
	Object.keys(fields)
		.filter((field) => !allowed.includes(field))
		.map((field) => `champ inconnu « ${field} »`);

/** Les fautes d'un titre ou d'un texte, s'il est présent. */
function proseErrors(fields: Fields, field: "title" | "text"): string[] {
	const value = fields[field];
	if (value === undefined) return [];
	if (!isText(value)) return [`« ${field} » : un texte non vide est attendu`];
	const errors: string[] = [];
	const digit = DIGIT.exec(value)?.[0];
	if (digit !== undefined) {
		errors.push(
			`« ${field} » : chiffre écrit en dur « ${digit} » : écris un nom de valeur, comme {total des points}`,
		);
	}
	for (const [, name = ""] of value.matchAll(VALUE_NAME)) {
		if (!Object.hasOwn(VALUES, name)) {
			errors.push(`« ${field} » : nom de valeur inconnu {${name}}`);
		}
	}
	if (BRACE.test(value.replace(VALUE_NAME, ""))) {
		errors.push(`« ${field} » : accolade sans nom de valeur`);
	}
	return errors;
}

/** Les fautes d'un passage déclaré. */
function locatorErrors(locator: unknown): string[] {
	if (!isFields(locator)) return ["une table de champs est attendue"];
	const errors = unknownFields(locator, LOCATOR_FIELDS);
	const required = ["document", "section"];
	for (const field of [...required, "bullet", "block"]) {
		const value = locator[field];
		if ((required.includes(field) || value !== undefined) && !isText(value)) {
			errors.push(`« ${field} » : un texte est attendu`);
		}
	}
	const { rows } = locator;
	if (
		rows !== undefined &&
		!(Array.isArray(rows) && rows.length > 0 && rows.every(isText))
	) {
		errors.push("« rows » : une liste de textes non vide est attendue");
	}
	const forms = LOCATOR_FORMS.filter((form) => locator[form] !== undefined);
	if (forms.length !== 1) {
		errors.push(
			`un seul de ${LOCATOR_FORMS.map((form) => `« ${form} »`).join(", ")} est attendu`,
		);
	}
	return errors;
}

/** Les fautes d'une entrée, chacune nommant son champ ; vide pour une entrée valide. */
function entryErrors(entry: unknown): string[] {
	if (!isFields(entry)) return ["une table de champs est attendue"];
	const errors = [
		...unknownFields(entry, ENTRY_FIELDS),
		...proseErrors(entry, "title"),
		...proseErrors(entry, "text"),
	];
	const { title, text, passages, fingerprint } = entry;
	if (title === undefined && text === undefined)
		errors.push("ni titre ni texte");
	if (passages === undefined) {
		if (fingerprint !== undefined) {
			errors.push("« fingerprint » sans « passages »");
		}
		return errors;
	}
	if (text === undefined) errors.push("« passages » sans « text »");
	if (!Array.isArray(passages) || passages.length === 0) {
		errors.push("« passages » : une liste non vide est attendue");
	} else {
		passages.forEach((locator, index) => {
			for (const error of locatorErrors(locator)) {
				errors.push(`passage ${index + 1} : ${error}`);
			}
		});
	}
	if (typeof fingerprint !== "string") {
		errors.push("« fingerprint » : une chaîne entre guillemets est attendue");
	}
	return errors;
}

/** Les entrées de `source`, validées ; une erreur qui nomme toutes leurs fautes. */
function entriesOf(source: string): [string, TextEntry][] {
	const file: unknown = parse(source);
	if (!isFields(file)) {
		throw new Error(`${TEXTS_NAME} : une table d'entrées est attendue.`);
	}
	const errors = Object.entries(file).flatMap(([key, entry]) =>
		[
			...(KEY.test(key) ? [] : ["clé en kebab-case attendue"]),
			...entryErrors(entry),
		].map((error) => `« ${key} » : ${error}`),
	);
	if (errors.length > 0) {
		throw new Error(`${TEXTS_NAME} :\n- ${errors.join("\n- ")}`);
	}
	return Object.entries(file) as [string, TextEntry][];
}

/** `prose` aux noms de valeur remplacés, sans ses blancs finaux. */
const withValues = (prose: string) =>
	prose.replace(VALUE_NAME, (_, name: string) => VALUES[name] ?? "").trimEnd();

/** Le texte du fichier de textes du dépôt. */
export const readTextsFile = () => readFile(TEXTS_FILE, "utf8");

/**
 * Les entrées du fichier de textes `source`, par clé, rendues sur les passages de `documents`. Lève
 * une erreur qui nomme toutes les fautes du fichier, ou un passage introuvable (`rawPassages`).
 */
export function textsOf(
	source: string,
	documents: Documents,
): ReadonlyMap<string, WikiText> {
	return new Map(
		entriesOf(source).map(([key, { title, text, passages }]) => [
			key,
			{
				title: title && withValues(title),
				text: text && withValues(text),
				rule: passages && exactRule(rawPassages(documents, passages)),
			},
		]),
	);
}

/**
 * Les explications de `source` dont l'empreinte n'est plus celle de leurs passages dans
 * `documents`, avec l'empreinte actuelle, à recopier une fois l'explication relue (#64, D3).
 */
export function staleTexts(source: string, documents: Documents): StaleText[] {
	return entriesOf(source).flatMap(([key, { passages, fingerprint }]) => {
		if (passages === undefined) return [];
		const current = fingerprintOf(rawPassages(documents, passages));
		return current === fingerprint ? [] : [{ key, fingerprint: current }];
	});
}
