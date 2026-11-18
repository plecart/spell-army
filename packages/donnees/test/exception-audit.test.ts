import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parse } from "yaml";

const REPO_ROOT = new URL("../../../", import.meta.url);

// L'avis que `audit.ignore` de `pnpm-workspace.yaml` excepte, et la dernière version qu'il touche.
const ADVISORY = "GHSA-fc5q-39xc-vjpf";
const LAST_VULNERABLE = "4.0.7";

function readRepoYaml(path: string) {
	return parse(readFileSync(new URL(path, REPO_ROOT), "utf8"));
}

/** Vrai pour une version au plus égale à `LAST_VULNERABLE`, ses prépublications comprises. */
function isVulnerable(version: string) {
	const [release = ""] = version.split("-");
	return (
		release.localeCompare(LAST_VULNERABLE, undefined, { numeric: true }) <= 0
	);
}

test("l'audit n'excepte que l'avis picomatch", () => {
	expect(readRepoYaml("pnpm-workspace.yaml").audit?.ignore).toEqual([ADVISORY]);
});

test("le verrou porte encore un picomatch que l'avis excepté touche", () => {
	const versions = Object.keys(readRepoYaml("pnpm-lock.yaml").packages)
		.filter((key) => key.startsWith("picomatch@"))
		.map((key) => key.slice("picomatch@".length));
	expect(
		versions.filter(isVulnerable),
		`Plus aucun picomatch <= ${LAST_VULNERABLE} dans pnpm-lock.yaml : l'exception n'a plus d'objet. Retirer ${ADVISORY} et son commentaire de pnpm-workspace.yaml, puis ce fichier de test, son entrée dans packages/donnees/vitest.config.ts, et yaml des devDependencies de donnees s'il ne sert plus.`,
	).not.toEqual([]);
});
