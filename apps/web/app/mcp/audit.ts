import { createHash } from "node:crypto";
import { auditLog, type Executor } from "donnees";
import { z } from "zod";
import { readImageInfo } from "./image.ts";

/** Un appel d'outil à auditer : réussi sans `error`, échoué avec. */
export interface AuditEntry {
	tool: string;
	/** L'entrée reçue, avant toute validation. */
	input: unknown;
	error?: string;
	before?: unknown;
	after?: unknown;
}

// Ce que le client glisse dans le nom d'outil, l'entrée et donc le message, et que la ligne d'audit
// ne saurait stocker : U+0000, que refusent `text` et `jsonb`, et un surrogate isolé, que refuse
// `jsonb`. `toWellFormed` remplace le second par U+FFFD ; le premier l'est ensuite.
const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);

// Imbrication gardée d'une entrée, au-delà de laquelle un sous-arbre est remplacé. Mesuré le
// 2026-11-17 (Node 24, Postgres 18) : la récursion de JS déborde entre 3 000 et 4 000 niveaux,
// `jsonb` refuse entre 10 000 et 100 000, et le corps de 4 Mio que le SDK admet en porte plus de
// 2 000 000. Les entrées des outils sont plates.
const MAX_DEPTH = 100;
const TRUNCATED = "[imbrication tronquée]";

// La borne de longueur, 64 Ki : un texte reçu de plus de 65 536 caractères (`length`, en unités
// UTF-16), ou une suite d'octets de plus de 65 536 éléments, est remplacé en entier par son
// empreinte, `{ taille, sha256 }`, en JSON dans un texte. C'est celle de l'issue #15, critère
// « Ligne d'audit » : « un texte de 65 536 caractères reste entier ; un texte de 65 537 caractères
// est remplacé par la taille de ses octets et leur empreinte SHA-256 (octets décodés s'il est en
// base64, sinon UTF-8) ».
const MAX_AUDITED_LENGTH = 65_536;
// Les champs d'octets, ceux que les outils déclarent en base64 : `image` (`modifier_sort`) et
// `contenu` (`deposer_fichier_3d`). Un champ de ce nom, pour tout outil, est remplacé par son
// empreinte quelle que soit sa longueur, et que ses octets soient admis ou non : une image si petite
// soit-elle (issue #12, « Image »), un fichier 3D que la borne de longueur garderait entier jusqu'à
// 49 152 octets (issue #15, « Ligne d'audit » : « Après un dépôt, la ligne ne contient pas le
// contenu »). Un champ d'octets s'ajoute ici ; `test/audit-sans-octets.test.ts` recompte ceux que
// publie le registre.
const BYTE_FIELDS: ReadonlySet<string> = new Set(["image", "contenu"]);
// Dans un texte : une suite de caractères du base64, remplissage compris.
const BASE64_RUN = /[A-Za-z0-9+/]+={0,2}/g;
const BASE64 = z.base64();

/** Ce que l'audit garde d'octets reçus : leur taille et leur empreinte SHA-256. */
function fingerprint(bytes: Uint8Array) {
	return {
		taille: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
}

/** L'empreinte de `bytes` dans un texte : son JSON. */
function fingerprintText(bytes: Uint8Array): string {
	return JSON.stringify(fingerprint(bytes));
}

/**
 * Les octets d'une chaîne : décodés quand c'est du base64 au sens du schéma d'un champ d'octets —
 * l'empreinte d'une image ou d'un fichier 3D accepté est alors celle que la base calcule —, sinon
 * ses octets UTF-8.
 */
function textBytes(text: string): Uint8Array {
	return BASE64.safeParse(text).success
		? Buffer.from(text, "base64")
		: Buffer.from(text);
}

/** Un entier de 0 à 255. */
function isByte(item: unknown): boolean {
	return (
		typeof item === "number" &&
		Number.isInteger(item) &&
		item >= 0 &&
		item <= 255
	);
}

/**
 * Les octets que porte une valeur JSON : une chaîne (`textBytes`), ou un tableau ou un objet dont
 * chaque valeur est un octet — l'objet indexé est ce qu'écrit `JSON.stringify` d'un `Uint8Array`.
 * `undefined` pour toute autre valeur.
 */
function bytesOf(value: unknown): Uint8Array | undefined {
	if (typeof value === "string") return textBytes(value);
	if (value === null || typeof value !== "object") return undefined;
	const items = Object.values(value);
	return items.every(isByte) ? Uint8Array.from(items) : undefined;
}

/** Des octets qui forment une image que la réserve admet, si petite soit-elle. */
function isImage(bytes: Uint8Array): boolean {
	return readImageInfo(bytes) !== undefined;
}

/**
 * Des octets reçus à remplacer par leur empreinte : portés par plus de `MAX_AUDITED_LENGTH`
 * caractères ou éléments, ou formant une image (`isImage`).
 */
function isBlob(length: number, bytes: Uint8Array): boolean {
	return length > MAX_AUDITED_LENGTH || isImage(bytes);
}

/**
 * Un texte que `text` et `jsonb` admettent, sans octets reçus : plus long que
 * `MAX_AUDITED_LENGTH`, remplacé en entier par son empreinte en JSON ; sinon, chaque suite en
 * base64 qui forme une image remplacée par la sienne.
 *
 * Limite : dans un texte d'au plus `MAX_AUDITED_LENGTH` caractères, des octets écrits autrement
 * qu'en base64, ou qui ne forment pas une image que la réserve admet, restent.
 */
function storableText(text: string): string {
	if (text.length > MAX_AUDITED_LENGTH) {
		return fingerprintText(textBytes(text));
	}
	return text
		.replace(BASE64_RUN, (run) => {
			const bytes = textBytes(run);
			return isImage(bytes) ? fingerprintText(bytes) : run;
		})
		.toWellFormed()
		.replaceAll(NUL, REPLACEMENT);
}

/**
 * Une valeur JSON que `jsonb` admet, sans octets reçus : une valeur qui porte des octets
 * (`bytesOf`) est remplacée par leur empreinte, `{ taille, sha256 }`, quand ils sont à remplacer
 * (`isBlob`) ou qu'elle est celle d'un champ de `BYTE_FIELDS` ; chaque autre chaîne, clés
 * comprises, rendue stockable (`storableText`), et ce qui dépasse `MAX_DEPTH` remplacé par
 * `TRUNCATED`.
 *
 * Limites : hors d'un champ de `BYTE_FIELDS`, une image d'un format que la réserve n'admet pas, ou
 * écrite autrement qu'en base64 ou en suite d'octets, reste en clair dans une chaîne d'au plus
 * `MAX_AUDITED_LENGTH` caractères ou une suite d'au plus autant d'éléments. Deux clés distinctes
 * d'un même objet qui ne diffèrent que par ce que `storableText` remplace deviennent la même clé, et
 * la dernière écrase l'autre dans la ligne : aucun nom de champ d'outil n'en porte, et le schéma
 * strict refuse de toute façon l'appel.
 */
function storableJson(value: unknown, depth = 0, byteField = false): unknown {
	const bytes = bytesOf(value);
	if (
		bytes &&
		(byteField ||
			isBlob(typeof value === "string" ? value.length : bytes.length, bytes))
	) {
		return fingerprint(bytes);
	}
	if (typeof value === "string") {
		return storableText(value);
	}
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (depth === MAX_DEPTH) {
		return TRUNCATED;
	}
	if (Array.isArray(value)) {
		return value.map((item) => storableJson(item, depth + 1, byteField));
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			storableText(key),
			storableJson(item, depth + 1, BYTE_FIELDS.has(key)),
		]),
	);
}

/** `value` tel que `JSON.stringify` l'écrit — un `Date` en texte ISO, non en `{}` ; `undefined` reste. */
const asJson = (value: unknown): unknown =>
	value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/**
 * Écrit la ligne d'audit d'un appel d'outil, sur le client ou dans une transaction.
 *
 * Aucune ligne ne garde d'octets reçus, une image (issue #12, « Image ») ou un fichier 3D (issue
 * #15, « Ligne d'audit ») surtout, entrée refusée comprise : leur taille et leur empreinte à la
 * place, ou celles du texte entier qui les porte s'il dépasse `MAX_AUDITED_LENGTH`. Chaque voie
 * par laquelle une valeur reçue entre dans une ligne passe ici, pour tout outil, outil inconnu
 * compris :
 * - `tool` : le nom d'un outil inconnu ;
 * - `input` : l'entrée, que l'appel réussisse, que le schéma ou l'outil la refuse ou que l'outil
 *   soit inconnu, chacune de ses valeurs et de ses clés à toute profondeur ;
 * - `error` : un message qui recopie une valeur reçue — le nom d'un outil inconnu ; une clé, que
 *   cite le refus d'un schéma strict ou le chemin d'une erreur, seule valeur reçue que recopie un
 *   message de Zod (4.6.7, `v4/locales/en.js` et `prettifyError`, lus le 2026-11-20) ; un nombre,
 *   ou un nom d'un vocabulaire fermé, que cite `validateSpell` ; tout message d'outil ou de
 *   Postgres ;
 * - `before`, `after` : ce que rend l'outil, où une image est déjà `{ type, taille, sha256 }`,
 *   passé par `JSON.stringify` avant d'être traité, pour qu'un `Date` s'écrive en texte ISO.
 *
 * Un texte reçu entre dans une ligne par huit voies : `tool` ; `error` ; et dans chacune des trois
 * colonnes JSON, `input`, `before` et `after`, une clé ou une chaîne, à toute profondeur. Sur
 * chacune, un texte de plus de `MAX_AUDITED_LENGTH` caractères est remplacé en entier par son
 * empreinte (issue #15, « Ligne d'audit ») — en JSON dans `tool`, `error` et une clé, en objet pour
 * une chaîne.
 *
 * `test/audit-sans-octets.test.ts` éprouve chaque voie : une valeur sous chaque forme d'octets, un
 * texte en base64, chaque champ d'octets que publie le registre, un texte à la borne sur chacune des
 * huit voies d'un texte, dont il recompte le nombre sur les colonnes d'`audit_log`.
 */
export async function writeAuditEntry(
	executor: Executor,
	{ tool, input, error, before, after }: AuditEntry,
): Promise<void> {
	await executor.insert(auditLog).values({
		tool: storableText(tool),
		input: storableJson(input),
		succeeded: error === undefined,
		error: error === undefined ? undefined : storableText(error),
		before: storableJson(asJson(before)),
		after: storableJson(asJson(after)),
	});
}
