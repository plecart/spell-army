// L'écriture du wiki dans son dossier. Le dossier doit être vide — seul le dépôt git du wiki, qu'on
// y a cloné, est toléré — : un mauvais argument n'efface jamais rien, et un dossier qui porte autre
// chose est refusé avant toute écriture.
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Les fichiers du wiki, par chemin relatif au dossier : le texte d'une page, les octets d'une image. */
export type WikiFiles = Map<string, string | Uint8Array>;

const TOLERATED = ".git";

/**
 * Écrit `files` dans `folder`, créé s'il est absent, une page en UTF-8. Lève une erreur qui nomme le
 * dossier, sans rien y écrire, s'il porte autre chose que `.git` ; une erreur de Node si le chemin
 * n'est pas un dossier ou ne s'écrit pas.
 */
export async function writeFolder(
	folder: string,
	files: WikiFiles,
): Promise<void> {
	await mkdir(folder, { recursive: true });
	if ((await readdir(folder)).some((entry) => entry !== TOLERATED)) {
		throw new Error(
			`Le dossier ${folder} n'est pas vide : la génération n'écrit que dans un dossier vide, où seul ${TOLERATED} est toléré.`,
		);
	}
	for (const [path, content] of files) {
		const target = join(folder, path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, content);
	}
}
