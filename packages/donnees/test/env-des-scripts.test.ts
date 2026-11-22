import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { expect, test } from "vitest";

const REPO_ROOT = new URL("../../../", import.meta.url);
// Le fichier qu'un script charge par `node --env-file-if-exists=<chemin>`.
const ENV_FILE = /--env-file-if-exists=(\S+)/g;

// Les manifestes suivis par git, racine comprise (même lecture que `version-node.test.ts`).
const MANIFESTS = execFileSync(
	"git",
	["ls-files", "-z", "--", "package.json", "*/package.json"],
	{ cwd: REPO_ROOT, encoding: "utf8" },
)
	.split("\0")
	.filter(Boolean);

// Chaque `<chemin>` de chaque script, résolu depuis le dossier de son paquet : pnpm lance un script
// depuis là. Une paire `[<manifeste> › <script>, <chemin résolu>]` par occurrence, qu'un script en
// porte une ou plusieurs.
const LOADED = MANIFESTS.flatMap((manifest) => {
	const { scripts = {} } = JSON.parse(
		readFileSync(new URL(manifest, REPO_ROOT), "utf8"),
	);
	return Object.entries<string>(scripts).flatMap(([name, command]) =>
		[...command.matchAll(ENV_FILE)].map(([, path = ""]) => [
			`${manifest} › ${name}`,
			posix.join(posix.dirname(manifest), path),
		]),
	);
});

test("chaque chargement de .env d'un script vise celui de la racine du dépôt", () => {
	// Sans chargement, la comparaison passerait à vide : la population se recompte à chaque exécution.
	expect(LOADED.length).toBeGreaterThan(0);
	expect(
		LOADED,
		`${LOADED.length} chargements de .env relevés dans les scripts des manifestes`,
	).toEqual(LOADED.map(([script]) => [script, ".env"]));
});
