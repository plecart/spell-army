import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const REPO_ROOT = new URL("../../../", import.meta.url);
// Le plancher d'une plage `engines` : la version qui suit son `>=`.
const FLOOR = /^>=(\S+)/;

function readRepoFile(path: string) {
	return readFileSync(new URL(path, REPO_ROOT), "utf8");
}

// Les manifestes suivis par git, racine comprise : ni `node_modules` ni les worktrees que la copie
// principale range sous `.claude/worktrees/`. `-z` : chaque chemin sort tel quel, sans les
// guillemets que `core.quotePath` pose sur un nom accentué.
const MANIFESTS = execFileSync(
	"git",
	["ls-files", "-z", "--", "package.json", "*/package.json"],
	{ cwd: REPO_ROOT, encoding: "utf8" },
)
	.split("\0")
	.filter(Boolean);

test("le plancher de chaque engines.node du dépôt est la version de .nvmrc, celle que la CI exécute", () => {
	const floors = Object.fromEntries(
		MANIFESTS.flatMap((path) => {
			const { engines } = JSON.parse(readRepoFile(path));
			const range: string | undefined = engines?.node;
			return range === undefined ? [] : [[path, FLOOR.exec(range)?.[1]]];
		}),
	);
	const nvmrc = readRepoFile(".nvmrc").trim();
	// La racine porte toujours `engines` : sans elle, un dépôt sans plancher passerait.
	const carriers = ["package.json", ...Object.keys(floors)];
	expect(floors).toEqual(
		Object.fromEntries(carriers.map((path) => [path, nvmrc])),
	);
});
