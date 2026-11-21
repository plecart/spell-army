import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const APP = new URL("../app/", import.meta.url);

// Hors du site : le serveur MCP, les routes d'API, et le client et le tic de l'import.
const OUTSIDE_SITE = /^(?:mcp\/|api\/|environment\.ts$|tick\.ts$)/;

/** Les fichiers TypeScript du site, sous `app/`, en chemins relatifs à barres obliques. */
function siteFiles(): string[] {
	return readdirSync(APP, { recursive: true, encoding: "utf8" })
		.map((path) => path.replaceAll("\\", "/"))
		.filter((path) => /\.tsx?$/.test(path) && !OUTSIDE_SITE.test(path))
		.sort();
}

// Les noms qu'importe une déclaration `import { … } from "…"`, chacun sans son `type`.
const importedNames = (names: string) =>
	names
		.split(",")
		.map((name) => name.trim().replace(/^type\s+/, ""))
		.filter(Boolean);

/**
 * Ce qui, dans `source`, lirait des joueurs hors de `listVisiblePlayers` : la table des joueurs ou
 * la liste d'exclusion importées de `donnees`, une requête écrite par `drizzle-orm` ou `pg`, ou le
 * client de la base (`database()`) donné à autre chose que `listVisiblePlayers`.
 */
function playerReads(source: string): string[] {
	const imports = [
		...source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g),
	].flatMap(([, names = "", module = ""]) => {
		if (/^(?:drizzle-orm|pg)(?:\/|$)/.test(module)) {
			return [module];
		}
		return module === "donnees"
			? importedNames(names)
					.filter((name) => name === "players" || name === "excludedPlayers")
					.map((name) => `donnees : ${name}`)
			: [];
	});
	const clients = source.match(/\bdatabase\(\)/g)?.length ?? 0;
	const reads =
		source.match(/\blistVisiblePlayers\(\s*database\(\)/g)?.length ?? 0;
	return clients > reads
		? [...imports, "database() hors de listVisiblePlayers"]
		: imports;
}

describe("la lecture des joueurs visibles est la seule voie de l'annuaire", () => {
	test("aucun fichier du site ne lit les joueurs autrement", () => {
		const files = siteFiles();
		// L'inventaire : un relevé vide sur une liste vide ne prouverait rien.
		expect(files).toEqual(
			expect.arrayContaining([
				"annuaire/directory.tsx",
				"layout.tsx",
				"page.tsx",
			]),
		);
		expect(
			files.flatMap((file) =>
				playerReads(readFileSync(new URL(file, APP), "utf8")).map(
					(read) => `${file} : ${read}`,
				),
			),
		).toEqual([]);
	});

	// Un témoin par règle, pour voir chacune mordre seule.
	test.each<[string, string, string[]]>([
		[
			"la table des joueurs",
			'import { players } from "donnees";',
			["donnees : players"],
		],
		[
			"la liste d'exclusion, sur plusieurs lignes",
			'import {\n\ttype Executor,\n\texcludedPlayers,\n} from "donnees";',
			["donnees : excludedPlayers"],
		],
		[
			"une requête de drizzle-orm",
			'import { sql } from "drizzle-orm";',
			["drizzle-orm"],
		],
		["un type de pg", 'import type { Pool } from "pg";', ["pg"]],
		[
			"le client donné à autre chose",
			'await database().execute("select * from players");',
			["database() hors de listVisiblePlayers"],
		],
		[
			"une constante de donnees",
			'import { INSTAGRAM_USERNAME_PATTERN } from "donnees";',
			[],
		],
		[
			"le client donné à la lecture",
			"await listVisiblePlayers(database(), query);",
			[],
		],
	])("le relevé voit %s", (_, source, reads) => {
		expect(playerReads(source)).toEqual(reads);
	});
});
