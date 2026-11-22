// La génération du wiki du jeu : les sorts de la source injectée — la table `spells` pour la
// commande, une liste pour les tests —, les tirables validés, rendus avec les passages des
// documents, puis écrits dans un dossier vide. Rien n'est écrit tant que tout n'est pas rendu.
import { validateSpell } from "combat";
import { postgresErrorCode } from "donnees";
import { writeFolder } from "./folder.ts";
import { type WikiSpell, wikiPages } from "./pages.ts";
import { passagesOf, readDocuments } from "./passages.ts";

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

/**
 * La raison d'un échec, lue sur la cause la plus profonde de `error`, sans rien de `DATABASE_URL` :
 * une erreur qui porte un `code` — de Node (`connect ECONNREFUSED`, `code ERR_INVALID_URL`) ou de
 * Postgres (`code 3D000`) — se nomme par lui, son message pouvant citer l'hôte, le port, le rôle ou
 * la base ; une autre, par son message ; une valeur qui n'est pas une erreur, par sa chaîne.
 */
function failureReason(error: unknown): string {
	let root = error;
	while (root instanceof Error && root.cause !== undefined) root = root.cause;
	if (!(root instanceof Error)) return String(root);
	const { code, syscall } = root as { code?: unknown; syscall?: unknown };
	if (typeof code !== "string") return root.message;
	return `${typeof syscall === "string" ? syscall : "code"} ${code}`;
}

/**
 * Les sorts de `source` ; un refus de la base dont le code est connu, traduit en sa raison, tout
 * autre échec nommé par `failureReason`. L'erreur d'origine reste en cause.
 */
async function readSpells(source: SpellSource): Promise<readonly WikiSpell[]> {
	try {
		return await source();
	} catch (error) {
		const code = postgresErrorCode(error)?.code;
		const reason =
			(code === undefined ? undefined : READ_REFUSALS[code]) ??
			`La lecture des sorts a échoué : ${failureReason(error)}.`;
		throw new Error(reason, { cause: error });
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
 * Lève une erreur, à afficher telle quelle, avant toute écriture : un passage introuvable ou
 * incomplet dans son document ; un échec de lecture des sorts, expliqué pour une table absente ou
 * un droit refusé, sinon nommé par sa raison, sans rien de `DATABASE_URL` ; aucun sort tirable ; un
 * sort tirable invalide (`validateSpell`), ou dont l'image est d'un type inconnu (`wikiPages`),
 * qu'elle nomme ; un dossier qui n'est pas vide (`writeFolder`).
 */
export async function generateWiki(
	folder: string,
	source: SpellSource,
): Promise<WikiSummary> {
	const passages = passagesOf(await readDocuments());
	const files = wikiPages(passages, drawableSpells(await readSpells(source)));
	await writeFolder(folder, files);
	const pages = [...files.values()].filter(
		(content) => typeof content === "string",
	).length;
	return { pages, images: files.size - pages };
}
