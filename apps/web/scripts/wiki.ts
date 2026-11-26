// Commande `pnpm --filter web wiki <dossier>` : écrit toutes les pages du wiki du jeu dans un dossier
// vide, depuis les documents du dépôt et la table `spells` de la base de `DATABASE_URL`
// (docs/exploitation.md, « Générer le wiki »). Sortie 0 avec une ligne de bilan, 1 avec la raison.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
	closeClient,
	createClient,
	EMPTY_DATABASE_URL,
	listSpellsWithImages,
} from "donnees";
import { spellOf } from "../app/mcp/spell-vocabulary.ts";
import { generateWiki } from "./wiki/generate.ts";

const USAGE = "Usage : pnpm --filter web wiki <dossier>";

try {
	const { positionals } = parseArgs({ allowPositionals: true });
	const [folder] = positionals;
	// Un chemin vide ne nomme aucun dossier : résolu, il désignerait celui où la commande est lancée.
	if (!folder || positionals.length > 1) {
		throw new Error(USAGE);
	}
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error(EMPTY_DATABASE_URL);
	}
	// Le dossier se lit depuis celui d'où pnpm a été lancé, à défaut depuis le dossier courant.
	const target = resolve(process.env.INIT_CWD ?? process.cwd(), folder);
	const db = createClient(url);
	try {
		const { pages, images } = await generateWiki(target, async () =>
			(await listSpellsWithImages(db)).map((row) => ({
				...spellOf(row),
				image: row.image,
			})),
		);
		// Toujours plusieurs images : chaque génération écrit au moins la bannière et un portrait.
		console.log(
			`Wiki écrit dans ${target} : ${pages} pages, ${images} images.`,
		);
	} finally {
		await closeClient(db);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
