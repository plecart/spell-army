import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parse } from "yaml";

const REPO_ROOT = new URL("../../../", import.meta.url);

// Les surcharges que `overrides` de `pnpm-workspace.yaml` déclare, et l'avis qui motive chacune :
// sous un seul parent, le paquet vulnérable monté à une version corrigée que la plage du parent
// n'admet pas.
const OVERRIDES = [
	{
		parent: "@esbuild-kit/core-utils",
		target: "esbuild",
		version: "^0.25.0",
		advisory: "GHSA-67mh-4wv8-2f99",
	},
	{
		parent: "archiver-utils",
		target: "glob",
		version: "^14.0.2",
		advisory: "GHSA-3g3m-2fjr-6pw4",
	},
].map((entry) => ({ ...entry, selector: `${entry.parent}>${entry.target}` }));

function readRepoYaml(path: string) {
	return parse(readFileSync(new URL(path, REPO_ROOT), "utf8"));
}

test("pnpm ne surcharge que les paquets des avis de la table", () => {
	expect(readRepoYaml("pnpm-workspace.yaml").overrides).toEqual(
		Object.fromEntries(
			OVERRIDES.map(({ selector, version }) => [selector, version]),
		),
	);
});

test.each(OVERRIDES)(
	"le verrou porte encore $parent, parent de la surcharge $selector",
	({ parent, selector, advisory }) => {
		const keys = Object.keys(readRepoYaml("pnpm-lock.yaml").packages);
		expect(
			keys.some((key) => key.startsWith(`${parent}@`)),
			`Plus aucun ${parent} dans pnpm-lock.yaml : la surcharge ${selector} (${advisory}) n'a plus d'objet. Retirer de pnpm-workspace.yaml son entrée sous overrides et son point dans le commentaire qui les précède, puis sa ligne de la table OVERRIDES de ce fichier (packages/donnees/test/surcharges-pnpm.test.ts) ; si c'était la dernière, retirer aussi la clé overrides et son commentaire, ce fichier de test et son entrée dans packages/donnees/vitest.config.ts. Régénérer enfin pnpm-lock.yaml par pnpm install : le verrou recopie les surcharges.`,
		).toBe(true);
	},
);
