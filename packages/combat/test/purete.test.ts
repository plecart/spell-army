import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

// `combat` est pur, sans E/S, et ne dépend d'aucun paquet (ADR 0001, « Paquets »). Le typecheck ne
// le garde pas : `types: ["node"]`, posé pour les tests, vaut aussi pour `src`.
const SOURCE = new URL("../src/", import.meta.url);
// Ce qu'importe un fichier : `from "…"`, `import "…"`, `import("…")` ou `require("…")`.
const SPECIFIER = /\b(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
const RELATIVE = /^\.\.?\//;

test("le code de combat n'importe que ses propres fichiers, par chemin relatif : ni module de Node, ni paquet", () => {
	const outside = readdirSync(SOURCE, { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".ts"))
		.flatMap((file) =>
			[...readFileSync(new URL(file, SOURCE), "utf8").matchAll(SPECIFIER)]
				.map(([, specifier = ""]) => specifier)
				.filter((specifier) => !RELATIVE.test(specifier))
				.map((specifier) => `${file} : ${specifier}`),
		);

	expect(outside).toEqual([]);
});
