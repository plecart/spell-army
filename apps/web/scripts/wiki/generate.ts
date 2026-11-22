// La génération du wiki du jeu : les sorts de la source injectée — la table `spells` pour la
// commande, une liste pour les tests —, les tirables validés, rendus avec les passages des
// documents, puis écrits dans un dossier vide. Rien n'est écrit tant que tout n'est pas rendu.
import { validateSpell } from "combat";
import { postgresErrorCode } from "donnees";
import { writeFolder } from "./folder.ts";
import { type WikiSpell, wikiPages } from "./pages.ts";
import { readPassages } from "./passages.ts";

/** La lecture des sorts, poids 0 compris : la génération ne publie que les tirables. */
export type SpellSource = () => Promise<readonly WikiSpell[]>;

/** Ce que la génération a écrit : les pages Markdown et les images. */
export interface WikiSummary {
	pages: number;
	images: number;
}

// Un refus de la base, par code Postgres (PostgreSQL, annexe A, « Error Codes ») : `undefined_table`
// et `insufficient_privilege`.
const READ_REFUSALS: Readonly<Record<string, string>> = {
	"42P01":
		"La table spells est absente : les migrations ne sont pas appliquées à cette base.",
	"42501": "Lecture refusée : le rôle n'a pas SELECT sur spells.",
};

/** Les sorts de `source` ; un refus de la base dont le code est connu, traduit en sa raison. */
async function readSpells(source: SpellSource): Promise<readonly WikiSpell[]> {
	try {
		return await source();
	} catch (error) {
		const code = postgresErrorCode(error)?.code;
		const refusal = code === undefined ? undefined : READ_REFUSALS[code];
		throw refusal === undefined ? error : new Error(refusal, { cause: error });
	}
}

/** Les sorts tirables (poids > 0) ; une erreur s'il n'y en a aucun, ou si l'un est invalide. */
function drawableSpells(spells: readonly WikiSpell[]): WikiSpell[] {
	const drawable = spells.filter(({ weight }) => weight > 0);
	if (drawable.length === 0) {
		throw new Error(
			"Aucun sort tirable (poids > 0) : la génération refuse de publier un wiki sans sorts.",
		);
	}
	for (const spell of drawable) {
		const errors = validateSpell(spell);
		if (errors.length > 0) {
			throw new Error(
				`Le sort n° ${spell.number}, « ${spell.name} », est invalide : ${errors.join(" ; ")}.`,
			);
		}
	}
	return drawable;
}

/**
 * Écrit dans `folder` toutes les pages du wiki et les images des sorts, puis rend ce qui a été
 * écrit. Les passages viennent des documents du dépôt, les sorts de `source`.
 *
 * Lève une erreur, à afficher telle quelle, avant toute écriture : un passage introuvable dans son
 * document ; un refus de la base, expliqué pour une table absente ou un droit refusé, sinon tel
 * quel ; aucun sort tirable ; un sort tirable invalide (`validateSpell`), qu'elle nomme ; un
 * dossier qui n'est pas vide (`writeFolder`).
 */
export async function generateWiki(
	folder: string,
	source: SpellSource,
): Promise<WikiSummary> {
	const passages = await readPassages();
	const files = wikiPages(passages, drawableSpells(await readSpells(source)));
	await writeFolder(folder, files);
	const pages = [...files.values()].filter(
		(content) => typeof content === "string",
	).length;
	return { pages, images: files.size - pages };
}
