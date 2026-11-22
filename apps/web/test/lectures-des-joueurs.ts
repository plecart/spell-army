// Le relevé des lectures de joueurs qui contourneraient les lectures gardées, fait par le
// vérificateur de TypeScript 7 (`typescript/unstable/sync`, l'API du compilateur livrée avec
// `tsc`) sur le projet `apps/web` : chaque identifiant se résout jusqu'à sa déclaration, à travers
// renommages, espaces de noms et réexports. Pas d'expression régulière sur la source : elle imite
// un analyseur et manque ce qu'elle n'a pas prévu (relecture de la PR #39).
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	type CallExpression,
	type Identifier,
	isCallExpression,
	isExportDeclaration,
	isImportSpecifier,
	isIdentifier,
	isPropertyAccessExpression,
	isStringLiteralLikeNode,
	type Node,
	type SourceFile,
	SyntaxKind,
} from "typescript/unstable/ast";
import {
	API,
	type Checker,
	SymbolFlags,
	type Symbol as TsSymbol,
} from "typescript/unstable/sync";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
	.replaceAll("\\", "/")
	.replace(/\/$/, "");
const APP = `${ROOT}/apps/web/app`;

/** Des noms, rangés sous le fichier qui les déclare, relatif à la racine du dépôt. */
type Declarations = Readonly<Record<string, readonly string[]>>;

// Les cibles : ce par quoi un fichier lirait des joueurs. Le client `database` n'est permis
// qu'importé, puis donné tel quel à une lecture gardée.
const TARGETS: Declarations = {
	"packages/donnees/src/schema.ts": ["players", "excludedPlayers"],
	"packages/donnees/src/client.ts": ["createClient"],
	"apps/web/app/environment.ts": ["database"],
};

// Les lectures gardées : celles de `joueurs` qui écartent les joueurs de `excluded_players`
// (ADR 0003, « RGPD »), seules à recevoir le client d'un fichier du site.
const GUARDED_READINGS: Declarations = {
	"packages/joueurs/src/visible-players.ts": ["listVisiblePlayers"],
	"packages/joueurs/src/visible-player.ts": ["readVisiblePlayer"],
};

// Les modules dont un import, même de type, écrirait une requête à la main.
const QUERY_MODULES = /^(?:drizzle-orm|pg)(?:\/|$)/;

/** Vrai si `symbol` est déclaré dans `file`, relatif à la racine du dépôt (casse ignorée). */
function declaredIn(symbol: TsSymbol, file: string): boolean {
	const path = symbol.declarations[0]?.path.toLowerCase();
	return path?.endsWith(`/${file.toLowerCase()}`) ?? false;
}

/** Vrai si `symbol` porte l'un des noms que `declarations` range sous son fichier. */
function declaredAmong(symbol: TsSymbol, declarations: Declarations): boolean {
	return Object.entries(declarations).some(
		([file, names]) => names.includes(symbol.name) && declaredIn(symbol, file),
	);
}

/** Le nom de cible de `symbol`, résolu, s'il en est une. */
function targetOf(symbol: TsSymbol): string | undefined {
	return declaredAmong(symbol, TARGETS) ? symbol.name : undefined;
}

/**
 * Ce que le vérificateur dit des symboles d'un projet, chaque résolution mémorisée : la déclaration
 * qu'un nœud désigne, à travers alias et réexports, et les cibles qu'atteint l'espace de noms
 * entier d'un module.
 */
function lookupOf(checker: Checker) {
	const resolved = new Map<number, TsSymbol>();
	const resolve = (symbol: TsSymbol): TsSymbol => {
		let target = resolved.get(symbol.id);
		if (!target) {
			target =
				symbol.flags & SymbolFlags.Alias
					? checker.getAliasedSymbol(symbol)
					: symbol;
			resolved.set(symbol.id, target);
		}
		return target;
	};
	const reached = new Map<number, string[]>();
	return {
		/** La déclaration que désigne chaque nœud de `nodes`, s'il en désigne une. */
		symbolsAt: (nodes: readonly Node[]) =>
			checker
				.getSymbolAtLocation(nodes)
				.map((symbol) => symbol && resolve(symbol)),
		isUnresolved: (symbol: TsSymbol) => checker.isUnknownSymbol(symbol),
		/** Les cibles qu'exporte `module`, sous quelque nom que ce soit. */
		namespaceReads(module: TsSymbol): string[] {
			let reads = reached.get(module.id);
			if (!reads) {
				reads = checker
					.getExportsOfModule(module)
					.flatMap((symbol) => targetOf(resolve(symbol)) ?? []);
				reached.set(module.id, reads);
			}
			return reads;
		},
	};
}
type Lookup = ReturnType<typeof lookupOf>;

/** Les nœuds de `file` que le relevé regarde : ses identifiants et ses appels `import()`. */
function nodesOf(file: SourceFile) {
	const identifiers: Identifier[] = [];
	const importCalls: CallExpression[] = [];
	const visit = (node: Node): undefined => {
		if (isIdentifier(node)) {
			identifiers.push(node);
		} else if (
			isCallExpression(node) &&
			node.expression.kind === SyntaxKind.ImportKeyword
		) {
			importCalls.push(node);
		}
		node.forEachChild(visit);
	};
	visit(file);
	return { identifiers, importCalls };
}

/**
 * Les lectures de joueurs des fichiers `files`, chemins relatifs à `app/`, chacune en
 * « fichier : lecture ». `virtual` donne la source de fichiers d'`app/` absents du disque. Une
 * lecture est :
 *
 * - une référence à une cible (`players`, `excludedPlayers`, `createClient`, `database`) sous
 *   quelque nom, espace de noms ou réexport que ce soit, sauf `database` importé puis appelé sans
 *   argument en premier argument d'une lecture gardée (`GUARDED_READINGS`) ;
 * - l'espace de noms entier d'un module qui exporte une cible (`import * as`, `export * from`,
 *   `import()`) : chacune de ses cibles ;
 * - un alias que le vérificateur ne résout pas (`non résolu : <nom>`) — import par défaut d'un
 *   module qui n'en a pas, sous-chemin non exporté — et un `import()` dont le module se calcule
 *   (`import() calculé`) : le relevé ne sait pas où ils mènent ;
 * - un module, même importé pour un type, de `drizzle-orm` ou `pg`.
 *
 * Hors de portée : un module chargé sans `import` (`createRequire`), et ce qu'un module hors
 * d'`app/` ferait des joueurs pour le compte d'un fichier du site.
 */
export function playerReads(
	files: readonly string[],
	virtual: Readonly<Record<string, string>> = {},
): string[] {
	const sources = new Map(
		Object.entries(virtual).map(([file, source]) => [`${APP}/${file}`, source]),
	);
	const api = new API({ cwd: ROOT, fs: overlay(sources) });
	try {
		const [project] = api
			.updateSnapshot({ openProjects: [`${ROOT}/apps/web/tsconfig.json`] })
			.getProjects();
		if (!project) {
			throw new Error("Le projet apps/web ne s'est pas chargé.");
		}
		const lookup = lookupOf(project.checker);
		return files.flatMap((file) => {
			const source = project.program.getSourceFile(`${APP}/${file}`);
			if (!source) {
				throw new Error(`${file} n'est pas un fichier du projet apps/web.`);
			}
			return readsOf(source, lookup).map((read) => `${file} : ${read}`);
		});
	} finally {
		api.close();
	}
}

/** Les lectures d'un fichier, triées, sans doublon. */
function readsOf(file: SourceFile, lookup: Lookup): string[] {
	const { identifiers, importCalls } = nodesOf(file);
	return [
		...new Set([
			...identifierReads(identifiers, lookup),
			...moduleReads(file, importCalls, lookup),
		]),
	].sort();
}

/** Ce que désignent les identifiants `identifiers` d'un fichier. */
function identifierReads(
	identifiers: readonly Identifier[],
	lookup: Lookup,
): string[] {
	const targets = new Map<Node, TsSymbol | undefined>(
		lookup
			.symbolsAt(identifiers)
			.map((symbol, index) => [identifiers[index] as Node, symbol]),
	);
	return identifiers.flatMap((node) => {
		const target = targets.get(node);
		if (!target) {
			return [];
		}
		if (lookup.isUnresolved(target)) {
			return [`non résolu : ${node.text}`];
		}
		if (target.flags & SymbolFlags.ValueModule) {
			return lookup.namespaceReads(target);
		}
		const name = targetOf(target);
		const permitted =
			name === "database" &&
			(isImportSpecifier(node.parent) || handsClientToReading(node, targets));
		return name && !permitted ? [name] : [];
	});
}

/**
 * Vrai si `node` est appelé sans argument en premier argument d'une lecture gardée, selon la
 * déclaration que `targets` donne à chaque identifiant du fichier.
 */
function handsClientToReading(
	node: Node,
	targets: ReadonlyMap<Node, TsSymbol | undefined>,
): boolean {
	const call = node.parent;
	const outer = call.parent;
	if (
		!isCallExpression(call) ||
		call.arguments.length > 0 ||
		!isCallExpression(outer) ||
		outer.arguments[0] !== call
	) {
		return false;
	}
	const callee = isPropertyAccessExpression(outer.expression)
		? outer.expression.name
		: outer.expression;
	const reading = targets.get(callee);
	return reading !== undefined && declaredAmong(reading, GUARDED_READINGS);
}

/**
 * Ce que nomment les modules d'un fichier : `drizzle-orm` et `pg` en toutes lettres, l'espace de
 * noms entier qu'ouvrent `export *` et `import()`, et un `import()` au module calculé.
 */
function moduleReads(
	file: SourceFile,
	importCalls: readonly CallExpression[],
	lookup: Lookup,
): string[] {
	const modules = lookup.symbolsAt(file.imports);
	const named = file.imports.flatMap((specifier, index) => {
		const owner = specifier.parent;
		const module = modules[index];
		const wholeNamespace =
			(isExportDeclaration(owner) && !owner.exportClause) ||
			isCallExpression(owner);
		const text = isStringLiteralLikeNode(specifier) ? specifier.text : "";
		return [
			...(QUERY_MODULES.test(text) ? [text] : []),
			...(module && wholeNamespace ? lookup.namespaceReads(module) : []),
		];
	});
	const computed = importCalls.some(
		(call) => !file.imports.includes(call.arguments[0] as Node),
	);
	return computed ? [...named, "import() calculé"] : named;
}

/**
 * Le disque, augmenté des fichiers `sources` (chemins absolus à barres obliques) : le vérificateur
 * les lit et les voit dans leur dossier. Tout le reste se lit sur le disque.
 */
function overlay(sources: ReadonlyMap<string, string>) {
	const inDirectory = (directory: string) =>
		[...sources.keys()]
			.filter((path) => path.slice(0, path.lastIndexOf("/")) === directory)
			.map((path) => path.slice(path.lastIndexOf("/") + 1));
	return {
		readFile: (path: string) => sources.get(path),
		fileExists: (path: string) => sources.has(path) || undefined,
		getAccessibleEntries(directory: string) {
			const added = inDirectory(directory);
			if (added.length === 0) {
				return undefined;
			}
			const entries = readdirSync(directory, { withFileTypes: true });
			return {
				files: [
					...entries.filter((entry) => entry.isFile()).map(({ name }) => name),
					...added,
				],
				directories: entries
					.filter((entry) => entry.isDirectory())
					.map(({ name }) => name),
			};
		},
	};
}
