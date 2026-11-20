import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// `combat` est pur, sans E/S, et ne dépend d'aucun paquet (ADR 0001, « Paquets »). Le typecheck ne
// le garde pas : `types: ["node"]`, posé pour les tests, vaut aussi pour `src`. Ce test ne garde
// que les imports : un global d'E/S que ces types déclarent, `fetch` ou `process`, n'en passe pas
// par un, et reste à la relecture.
const SOURCE = new URL("../src/", import.meta.url);
// Ce qu'importe un fichier : `from "…"`, `import "…"`, `import("…")` ou `require("…")`.
const SPECIFIER = /\b(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
const RELATIVE = /^\.\.?\//;

/** `specifier`, importé depuis `file`, est un fichier de `src` : relatif, et résolu sous `src`. */
function isOwnFile(specifier: string, file: URL): boolean {
	return (
		RELATIVE.test(specifier) &&
		new URL(specifier, file).href.startsWith(SOURCE.href)
	);
}

/** Ce que `source`, le texte du fichier `file`, importe hors de `src`. */
function importsOutside(source: string, file: URL): string[] {
	return [...source.matchAll(SPECIFIER)]
		.map(([, specifier = ""]) => specifier)
		.filter((specifier) => !isOwnFile(specifier, file));
}

describe("pureté du code de combat", () => {
	test("il n'importe que ses propres fichiers, par chemin relatif : ni module de Node, ni paquet, ni fichier hors de src", () => {
		const outside = readdirSync(SOURCE, { recursive: true, encoding: "utf8" })
			.filter((file) => file.endsWith(".ts"))
			.flatMap((file) => {
				const url = new URL(file, SOURCE);
				return importsOutside(readFileSync(url, "utf8"), url).map(
					(specifier) => `${file} : ${specifier}`,
				);
			});

		expect(outside).toEqual([]);
	});

	// La garde, éprouvée sur des imports écrits ici, comme s'ils étaient dans `src/rules.ts`.
	const RULES = new URL("rules.ts", SOURCE);

	test.each([
		["un module de Node", 'import { readFileSync } from "node:fs";'],
		["un paquet", 'import { z } from "zod";'],
		[
			"un fichier d'un autre paquet, par chemin relatif",
			'import { auditLog } from "../../donnees/src/index.ts";',
		],
		[
			"un fichier hors de src, par un détour",
			'export * from "./../test/regles.test.ts";',
		],
		[
			"un import dynamique d'un autre paquet",
			'await import("../../donnees/src/index.ts");',
		],
	])("%s : relevé", (_, source) => {
		expect(importsOutside(source, RULES)).toHaveLength(1);
	});

	test("un fichier de src, par chemin relatif : admis", () => {
		expect(
			importsOutside('import { spellKey } from "./spell.ts";', RULES),
		).toEqual([]);
	});
});
