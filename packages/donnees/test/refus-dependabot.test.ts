import { readFileSync } from "node:fs";
import { intersects } from "semver";
import { expect, test } from "vitest";
import { parse } from "yaml";

const REPO_ROOT = new URL("../../../", import.meta.url);

// Les versions de `@types/node` que l'entrée `npm` de `.github/dependabot.yml` refuse : celles qui
// décrivent un Node au-delà du runtime déclaré (`engines.node`), Node 24.
const REFUSED = ">=25.0.0";

function readRepoFile(path: string) {
	return readFileSync(new URL(path, REPO_ROOT), "utf8");
}

test("Dependabot ne refuse que les majeures de @types/node au-delà du runtime", () => {
	const { updates } = parse(readRepoFile(".github/dependabot.yml"));
	const ignores = updates.flatMap(
		(entry: { "package-ecosystem": string; ignore?: object[] }) =>
			(entry.ignore ?? []).map((rule) => ({
				ecosystem: entry["package-ecosystem"],
				...rule,
			})),
	);
	expect(ignores).toEqual([
		{ ecosystem: "npm", "dependency-name": "@types/node", versions: [REFUSED] },
	]);
});

test("le runtime déclaré n'admet aucune version de Node que le refus écarte", () => {
	const runtime: string = JSON.parse(readRepoFile("package.json")).engines.node;
	expect(
		intersects(runtime, REFUSED),
		`engines.node (${runtime}) admet une version de Node que .github/dependabot.yml refuse à @types/node (${REFUSED}) : le refus n'a plus d'objet. Monter la borne de l'ignore à la majeure qui suit le nouveau runtime, dans dependabot.yml (règle et commentaire) et dans REFUSED de ce fichier (packages/donnees/test/refus-dependabot.test.ts), et @types/node à la majeure du runtime.`,
	).toBe(false);
});
