import { createHash } from "node:crypto";
import { freshDatabase } from "donnees/test/base-neuve";
import { expect, test } from "vitest";
import { writeAuditEntry } from "../app/mcp/audit.ts";
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

// « é » : un caractère, deux octets UTF-8, hors de l'alphabet du base64. La longueur se compte en
// caractères, la taille et l'empreinte se prennent sur les octets UTF-8.
test.each<[number, string, (text: string) => unknown]>([
	[65_536, "reste entier", (text) => text],
	[
		65_537,
		"est remplacé par la taille de ses octets et leur empreinte SHA-256",
		fingerprintOf,
	],
])(
	"un texte de %i caractères dans l'entrée %s dans la ligne d'audit",
	async (length, _, stored) => {
		const db = await freshDatabase();
		const text = "é".repeat(length);
		await writeAuditEntry(db, { tool: "essai", input: { contenu: text } });
		expect((await auditRows(db)).map((row) => row.input)).toEqual([
			{ contenu: stored(text) },
		]);
	},
);
