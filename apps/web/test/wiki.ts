// Les montages des tests du wiki : la réserve de départ en entrée, et le wiki généré dans un dossier
// temporaire, effacé à la fin du test.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { STARTING_POOL } from "combat";
import { onTestFinished } from "vitest";
import { generateWiki } from "../scripts/wiki/generate.ts";
import type { WikiSpell } from "../scripts/wiki/pages.ts";

/** La réserve de départ, sans image : 24 sorts de poids 1. */
export const POOL: WikiSpell[] = STARTING_POOL.map((spell) => ({
	...spell,
	image: null,
}));

/** Un sort valide hors de la réserve de départ, comme `ajouter_sort` en ajoute un. */
export const ADDED: WikiSpell = {
	number: 25,
	name: "Pluie d'essai",
	recipe: { kind: "shares", shares: { speed: 100 } },
	form: { kind: "inverted" },
	effect: { base: "armyStat", heal: { constant: 1, perGauge: 0 } },
	weight: 2,
	description: "Soin de l'armée selon la Vitesse.",
	image: null,
};

/** La réserve de départ, le sort n° `number` avec `image`. */
export const withImage = (number: number, image: WikiSpell["image"]) =>
	POOL.map((spell) => (spell.number === number ? { ...spell, image } : spell));

/** Un dossier temporaire vide, effacé à la fin du test. */
export async function emptyFolder(): Promise<string> {
	const folder = await mkdtemp(join(tmpdir(), "wiki-"));
	onTestFinished(() => rm(folder, { recursive: true, force: true }));
	return folder;
}

/** Un dossier de sortie, encore absent, dans un dossier temporaire effacé à la fin du test. */
export const outputFolder = async () => join(await emptyFolder(), "wiki");

/** Les fichiers de `folder`, sous-dossiers compris, en chemins relatifs à barres obliques. */
export async function filesOf(folder: string): Promise<string[]> {
	const entries = await readdir(folder, {
		recursive: true,
		withFileTypes: true,
	});
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) =>
			relative(folder, join(entry.parentPath, entry.name)).replaceAll(sep, "/"),
		);
}

/** Le wiki généré depuis `spells`, et de quoi en lire les fichiers. */
export async function generated(spells: readonly WikiSpell[]) {
	const folder = await outputFolder();
	await generateWiki(folder, async () => spells);
	return {
		files: () => filesOf(folder),
		page: (name: string) => readFile(join(folder, `${name}.md`), "utf8"),
		bytes: async (path: string) => [...(await readFile(join(folder, path)))],
	};
}
