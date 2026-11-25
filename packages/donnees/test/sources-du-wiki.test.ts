import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parse } from "yaml";

const REPO_ROOT = new URL("../../../", import.meta.url);
const CONFIG = ".claude/pipeline.config.md";
const WORKFLOW = ".github/workflows/wiki.yml";
// Un chemin du dépôt, parmi les mots entre backticks de la colonne « Sources » : il contient un `/`
// ou se termine par une extension. Les autres (`spells`, `spell-army-prod`) nomment ce qui n'est pas dans
// le dépôt.
const REPO_PATH = /\/|\.\w+$/;

function readRepoFile(path: string) {
	return readFileSync(new URL(path, REPO_ROOT), "utf8");
}

// Les chemins du dépôt entre backticks de la colonne « Sources » de la ligne du wiki, dans la
// section « Documentation dérivée » du texte de `.claude/pipeline.config.md`.
function wikiRepoPaths(config: string) {
	const section = config
		.split("\n## ")
		.find((part) => part.startsWith("Documentation dérivée"));
	const rows = (section ?? "")
		.split("\n")
		.filter((line) => line.startsWith("| wiki "));
	expect(
		rows,
		"une seule ligne du wiki dans « Documentation dérivée »",
	).toHaveLength(1);
	const [row = ""] = rows;
	const sources = row.split("|")[2] ?? "";
	const paths = [...sources.matchAll(/`([^`]+)`/g)]
		.map(([, word = ""]) => word)
		.filter((word) => REPO_PATH.test(word));
	// Sans chemin, les comparaisons passeraient à vide : la population se recompte à chaque exécution.
	expect(paths.length).toBeGreaterThan(0);
	return paths;
}

// `on.push.paths` du workflow du wiki.
function pushFilter(workflow: string): string[] {
	return parse(workflow).on.push.paths;
}

// Les deux ensembles à tenir égaux, triés : les sources du dépôt de la colonne, un dossier `x/`
// écrit `x/**` comme dans le filtre ; et `on.push.paths` du workflow, privé du workflow lui-même.
function wikiPathSets(config: string, workflow: string) {
	const filter = pushFilter(workflow);
	return {
		sources: wikiRepoPaths(config)
			.map((path) => (path.endsWith("/") ? `${path}**` : path))
			.sort(),
		filter: filter.filter((path) => path !== WORKFLOW).sort(),
	};
}

test("chaque chemin des sources du wiki existe dans le dépôt", () => {
	const missing = wikiRepoPaths(readRepoFile(CONFIG)).filter(
		(path) => !existsSync(new URL(path, REPO_ROOT)),
	);
	expect(missing).toEqual([]);
});

test("le filtre de push du workflow du wiki couvre exactement ses sources du dépôt", () => {
	const { sources, filter } = wikiPathSets(
		readRepoFile(CONFIG),
		readRepoFile(WORKFLOW),
	);
	expect(
		filter,
		`${sources.length} chemins dans la colonne « Sources » de ${CONFIG}`,
	).toEqual(sources);
});

// Le workflow est exclu de la comparaison ci-dessus : sans ce cas, le retirer de son propre filtre
// ne rougirait rien, et un changement du workflow ne republierait plus le wiki.
test("le filtre de push du workflow du wiki le surveille lui-même", () => {
	const workflow = readRepoFile(WORKFLOW);
	const faulty = workflow.replace(`      - ${WORKFLOW}\n`, "");
	expect(faulty, `« - ${WORKFLOW} » absent de ${WORKFLOW}`).not.toBe(workflow);

	expect(pushFilter(workflow)).toContain(WORKFLOW);
	expect(pushFilter(faulty)).not.toContain(WORKFLOW);
});

// Des écarts tenus en mémoire, chacun dans une copie d'un des deux fichiers : le harnais de mutation
// ne réécrit pas `.github/workflows/` (réglage de sécurité), et une source de la racine, sans `/`,
// garde la branche « extension » de `REPO_PATH`, qu'aucune source actuelle n'emprunte.
test.each([
	[
		"une source retirée du filtre",
		WORKFLOW,
		"      - packages/combat/src/**\n",
		"",
	],
	[
		"un fichier ajouté au filtre seul",
		WORKFLOW,
		"      - apps/web/scripts/wiki.ts\n",
		"      - apps/web/scripts/wiki.ts\n      - apps/web/package.json\n",
	],
	[
		"un fichier de la racine ajouté à la colonne seule",
		CONFIG,
		"(`packages/donnees/src/`)",
		"(`packages/donnees/src/`, `pnpm-lock.yaml`)",
	],
])("la comparaison rougit sur %s", (_, file, from, to) => {
	const original = readRepoFile(file);
	const faulty = original.replace(from, to);
	expect(faulty, `« ${from.trim()} » absent de ${file}`).not.toBe(original);
	const read = (path: string) => (path === file ? faulty : readRepoFile(path));
	const { sources, filter } = wikiPathSets(read(CONFIG), read(WORKFLOW));
	expect(filter).not.toEqual(sources);
});
