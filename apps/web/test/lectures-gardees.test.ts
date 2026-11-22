import { readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { playerReads } from "./lectures-des-joueurs.ts";

// Hors du site : le serveur MCP, les routes d'API, et le client et le tic de l'import.
const OUTSIDE_SITE = /^(?:mcp\/|api\/|environment\.ts$|tick\.ts$)/;

/** Les fichiers TypeScript du site, sous `app/`, en chemins relatifs à barres obliques. */
function siteFiles(): string[] {
	return readdirSync(new URL("../app/", import.meta.url), {
		recursive: true,
		encoding: "utf8",
	})
		.map((path) => path.replaceAll("\\", "/"))
		.filter((path) => /\.tsx?$/.test(path) && !OUTSIDE_SITE.test(path))
		.sort();
}

/**
 * Une cible du relevé : son nom, le module d'où un fichier d'`app/` l'importe, un autre chemin vers
 * elle, ce que ce chemin rend, et ce qu'atteint l'espace de noms entier de son module.
 */
interface Target {
	name: string;
	module: string;
	otherPath: string;
	otherPathReads: string[];
	namespaceReads: string[];
}

// Ce qu'atteint l'espace de noms de `donnees` : ses deux tables de joueurs et son client.
const DONNEES_NAMESPACE = ["createClient", "excludedPlayers", "players"];

const TARGETS: Target[] = [
	{
		name: "players",
		module: "donnees",
		otherPath: "donnees/src/schema.ts",
		otherPathReads: ["non résolu : players"],
		namespaceReads: DONNEES_NAMESPACE,
	},
	{
		name: "excludedPlayers",
		module: "donnees",
		otherPath: "donnees/src/schema.ts",
		otherPathReads: ["non résolu : excludedPlayers"],
		namespaceReads: DONNEES_NAMESPACE,
	},
	{
		name: "createClient",
		module: "donnees",
		otherPath: "donnees/src/client.ts",
		otherPathReads: ["non résolu : createClient"],
		namespaceReads: DONNEES_NAMESPACE,
	},
	{
		name: "database",
		module: "./environment.ts",
		otherPath: "../app/environment.ts",
		otherPathReads: ["database"],
		namespaceReads: ["database"],
	},
];

// Le dénombrement des formes par lesquelles un fichier d'`app/` atteint une cible, chacune éprouvée
// sur chaque cible : la forme rend une source, puis ce que le relevé y trouve.
const FORMS: [
	string,
	(target: Target) => string,
	(target: Target) => string[],
][] = [
	[
		"import nommé",
		({ name, module }) => `import { ${name} } from "${module}";\nvoid ${name};`,
		({ name }) => [name],
	],
	[
		"import renommé",
		({ name, module }) =>
			`import { ${name} as alias } from "${module}";\nvoid alias;`,
		({ name }) => [name],
	],
	[
		"espace de noms",
		({ name, module }) => `import * as ns from "${module}";\nvoid ns.${name};`,
		({ namespaceReads }) => namespaceReads,
	],
	[
		"import par défaut",
		({ name, module }) => `import ns from "${module}";\nvoid ns.${name};`,
		() => ["non résolu : ns"],
	],
	[
		"réexport nommé",
		({ name, module }) => `export { ${name} } from "${module}";`,
		({ name }) => [name],
	],
	[
		"réexport du module entier",
		({ module }) => `export * from "${module}";`,
		({ namespaceReads }) => namespaceReads,
	],
	[
		"import() dynamique",
		({ name, module }) =>
			`const ns = await import("${module}");\nvoid ns.${name};`,
		({ namespaceReads }) => namespaceReads,
	],
	[
		"autre chemin",
		({ name, otherPath }) =>
			`import { ${name} } from "${otherPath}";\nvoid ${name};`,
		({ otherPathReads }) => otherPathReads,
	],
];

// Les lectures gardées, chacune avec un argument qui suit le client.
const READINGS: [name: string, rest: string][] = [
	["listVisiblePlayers", '{ search: "", page: 1 }'],
	["readVisiblePlayer", '"1"'],
];

// Le dénombrement des façons de donner le client à une lecture gardée, chacune éprouvée sur chaque
// lecture : le libellé, la source, puis ce que le relevé y trouve. Seul le client appelé tel quel
// en premier argument de la lecture est permis, même sous d'autres noms.
const READING_FORMS: [
	(name: string) => string,
	(name: string, rest: string) => string,
	string[],
][] = [
	[
		(name) => `le client donné à ${name} par une fonction intermédiaire`,
		(name, rest) =>
			`import { ${name} } from "joueurs";\nimport { database } from "./environment.ts";\nconst open = (client: () => unknown) => client();\nawait ${name}(open(database), ${rest});`,
		["database"],
	],
	[
		(name) => `le client donné à ${name} en second argument`,
		(name) =>
			`import { ${name} } from "joueurs";\nimport { database } from "./environment.ts";\nawait ${name}({} as never, database());`,
		["database"],
	],
	[
		(name) => `le client donné à une fonction locale du nom de ${name}`,
		(name, rest) =>
			`import { database } from "./environment.ts";\nconst ${name} = (..._: unknown[]) => 0;\n${name}(database(), ${rest});`,
		["database"],
	],
	[
		(name) => `le client donné à ${name}`,
		(name, rest) =>
			`import { ${name} } from "joueurs";\nimport { database } from "./environment.ts";\nawait ${name}(database(), ${rest});`,
		[],
	],
	[
		(name) => `le client donné à ${name}, sous d'autres noms`,
		(name, rest) =>
			`import { ${name} as read } from "joueurs";\nimport { database as db } from "./environment.ts";\nawait read(db(), ${rest});`,
		[],
	],
];

// Les autres voies — `drizzle-orm`, `pg`, un module calculé, le client donné à autre chose qu'une
// lecture gardée — et ce qui reste permis : une constante de `donnees`, un homonyme local d'une
// table. `apps/web` ne dépend ni de `drizzle-orm` ni de `pg` : leurs imports ne s'y résolvent pas.
const OTHER_CASES: [string, string, string[]][] = [
	[
		"une requête de drizzle-orm",
		'import { sql } from "drizzle-orm";\nvoid sql;',
		["drizzle-orm", "non résolu : sql"],
	],
	[
		"un type de pg",
		'import type { Pool } from "pg";\nexport type P = Pool;',
		["non résolu : Pool", "pg"],
	],
	[
		"un import() calculé",
		'const name = "donnees";\nvoid (await import(name));',
		["import() calculé"],
	],
	[
		"le client donné à autre chose",
		'import { database } from "./environment.ts";\nawait database().execute("select 1");',
		["database"],
	],
	[
		"le client donné à une autre fonction de joueurs",
		'import { listPasses } from "joueurs";\nimport { database } from "./environment.ts";\nawait listPasses(database(), 10);',
		["database"],
	],
	[
		"une variable locale du nom d'une table",
		"const players = [];\nvoid players;",
		[],
	],
	[
		"une constante de donnees",
		'import { INSTAGRAM_USERNAME_PATTERN } from "donnees";\nvoid INSTAGRAM_USERNAME_PATTERN;',
		[],
	],
];

const CASES: [string, string, string[]][] = [
	...FORMS.flatMap(([form, source, reads]) =>
		TARGETS.map((target): [string, string, string[]] => [
			`${form} de ${target.name}`,
			source(target),
			reads(target),
		]),
	),
	...READING_FORMS.flatMap(([label, source, reads]) =>
		READINGS.map(([name, rest]): [string, string, string[]] => [
			label(name),
			source(name, rest),
			reads,
		]),
	),
	...OTHER_CASES,
];

// Chaque cas, en fichier virtuel d'`app/`, relevé en une passe.
const CASE_FILES = CASES.map((_, index) => `cas-${index}.ts`);
const CASE_READS = playerReads(
	CASE_FILES,
	Object.fromEntries(
		CASES.map(([, source], index) => [CASE_FILES[index], source]),
	),
);

describe("le site ne lit les joueurs que par les lectures gardées", () => {
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
		expect(playerReads(files)).toEqual([]);
	});

	test.each(
		CASES.map(([label, , reads], index) => [label, index, reads] as const),
	)("le relevé voit %s", (_, index, reads) => {
		const file = CASE_FILES[index];
		expect(CASE_READS.filter((read) => read.startsWith(`${file} : `))).toEqual(
			reads.map((read) => `${file} : ${read}`),
		);
	});
});
