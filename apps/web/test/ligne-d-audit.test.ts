import { createHash } from "node:crypto";
import { freshDatabase } from "donnees/test/base-neuve";
import { describe, expect, test } from "vitest";
import { type AuditEntry, writeAuditEntry } from "../app/mcp/audit.ts";
import { auditRows } from "./montage.ts";

/**
 * Ce que la ligne garde d'un texte trop long qui n'est pas du base64 : la taille de ses octets
 * UTF-8 et leur empreinte.
 */
const fingerprintOf = (text: string) => {
	const bytes = Buffer.from(text, "utf8");
	return {
		taille: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
};

/** La même empreinte là où seul un texte tient — clé, outil, message : son JSON. */
const fingerprintText = (text: string) => JSON.stringify(fingerprintOf(text));

type TextPath = [
	name: string,
	entry: (text: string) => AuditEntry,
	columns: (stored: unknown) => object,
	oversized: (text: string) => unknown,
];

/**
 * Les 4 chemins par lesquels un texte venu du client atteint la ligne d'audit, parmi les huit voies
 * d'un texte que dénombre `writeAuditEntry` (`app/mcp/audit.ts`) : une valeur de chaîne de l'entrée,
 * une clé de l'entrée — JSON ne porte de texte qu'en chaîne et en clé —, le nom d'outil, libre pour
 * un outil inconnu, et le message d'erreur, où un refus recopie une valeur reçue. Les quatre autres
 * voies, une chaîne et une clé de l'avant et de l'après, portent ce que rend l'outil :
 * `audit-sans-octets.test.ts` les éprouve. Chaque chemin : l'entrée d'audit qui y place un texte,
 * les colonnes de la ligne qui gardent au bout ce qu'il en reste, et ce qu'il garde d'un texte trop
 * long. Le dernier test recompte les colonnes.
 */
const TEXT_PATHS: TextPath[] = [
	// Sous une clé qui n'est pas un champ d'octets : `image` ou `contenu` serait remplacé quelle que
	// soit sa longueur.
	[
		"une valeur de l'entrée",
		(text) => ({ tool: "essai", input: { texte: text } }),
		(stored) => ({ input: { texte: stored } }),
		fingerprintOf,
	],
	[
		"une clé de l'entrée",
		(text) => ({ tool: "essai", input: { [text]: 1 } }),
		(stored) => ({ input: { [String(stored)]: 1 } }),
		fingerprintText,
	],
	[
		"le nom d'outil",
		(text) => ({ tool: text, input: {} }),
		(stored) => ({ tool: stored }),
		fingerprintText,
	],
	[
		"le message d'erreur",
		(text) => ({ tool: "essai", input: {}, error: text }),
		(stored) => ({ error: stored }),
		fingerprintText,
	],
];

// « é » : un caractère, deux octets UTF-8, hors de l'alphabet du base64. La longueur se compte en
// caractères, la taille et l'empreinte se prennent sur les octets UTF-8.
describe.each(TEXT_PATHS)("%s", (_, entry, columns, oversized) => {
	test.each<[number, string, (text: string) => unknown]>([
		[65_536, "reste entier", (text) => text],
		[
			65_537,
			"est remplacé par la taille de ses octets et leur empreinte SHA-256",
			oversized,
		],
	])(
		"un texte de %i caractères %s dans la ligne d'audit",
		async (length, _, stored) => {
			const db = await freshDatabase();
			const text = "é".repeat(length);
			await writeAuditEntry(db, entry(text));
			expect(await auditRows(db)).toEqual([
				expect.objectContaining(columns(stored(text))),
			]);
		},
	);
});

// Les colonnes au bout d'aucun chemin du client : l'avant et l'après, ce que rend l'outil, et celles
// qui ne portent pas de texte. Une colonne ajoutée à la ligne rougit le test suivant tant qu'elle
// n'est pas rangée ici ou dans un chemin.
const TOOL_RESULT_COLUMNS = ["before", "after"];
const TEXTLESS_COLUMNS = ["id", "at", "succeeded"];

test("chaque colonne de la ligne d'audit est au bout d'un chemin du client, porte ce que rend l'outil ou ne porte pas de texte", async () => {
	const db = await freshDatabase();
	await writeAuditEntry(db, { tool: "essai", input: {} });
	const [row] = await auditRows(db);
	expect(new Set(Object.keys(row ?? {}))).toEqual(
		new Set([
			...TEXT_PATHS.flatMap(([, , columns]) => Object.keys(columns(""))),
			...TOOL_RESULT_COLUMNS,
			...TEXTLESS_COLUMNS,
		]),
	);
});
