import { eq } from "drizzle-orm";
import type { Executor } from "./client.ts";
import { classDefaultModels, modelFiles } from "./schema.ts";

/** À qui appartient un fichier 3D : une classe ou un monstre, désigné par son nom. */
export type ModelTarget = { class: string } | { monster: string };

/** Un fichier 3D rangé : son identifiant, sa taille en octets, son empreinte SHA-256 en hexadécimal. */
export type StoredModelFile = Pick<
	typeof modelFiles.$inferSelect,
	"id" | "size" | "sha256"
>;

/**
 * Range les octets d'un fichier 3D pour `target` et rend son identifiant, sa taille et son
 * empreinte, que la base calcule. Le contrat du fichier et le nom de la classe se vérifient chez
 * l'appelant.
 */
export async function storeModelFile(
	executor: Executor,
	{ target, content }: { target: ModelTarget; content: Uint8Array },
): Promise<StoredModelFile> {
	const [stored] = await executor
		.insert(modelFiles)
		.values({ ...target, content })
		.returning({
			id: modelFiles.id,
			size: modelFiles.size,
			sha256: modelFiles.sha256,
		});
	return stored as StoredModelFile;
}

/** Les octets du modèle par défaut de `characterClass`, nuls quand la classe n'en a pas. */
export async function readClassDefaultModel(
	executor: Executor,
	characterClass: string,
): Promise<Uint8Array | null> {
	const [model] = await executor
		.select({ content: modelFiles.content })
		.from(classDefaultModels)
		.innerJoin(modelFiles, eq(modelFiles.id, classDefaultModels.modelFileId))
		.where(eq(classDefaultModels.class, characterClass));
	return model?.content ?? null;
}

/** Lève une erreur qui le dit si le fichier `fileId` n'est pas un fichier de `characterClass`. */
async function assertFileOfClass(
	executor: Executor,
	characterClass: string,
	fileId: number,
): Promise<void> {
	const [file] = await executor
		.select({ class: modelFiles.class, monster: modelFiles.monster })
		.from(modelFiles)
		.where(eq(modelFiles.id, fileId));
	if (!file) {
		throw new Error(`Aucun fichier 3D d'identifiant ${fileId}.`);
	}
	if (file.monster !== null) {
		throw new Error(
			`Le fichier 3D ${fileId} est celui du monstre « ${file.monster} », pas celui d'une classe.`,
		);
	}
	if (file.class !== characterClass) {
		throw new Error(`Le fichier 3D ${fileId} est celui d'une autre classe.`);
	}
}

/**
 * Fait du fichier `fileId` le modèle par défaut de `characterClass`, à la place du précédent, et
 * rend l'identifiant avant (nul sans modèle) et après. Un fichier inexistant, celui d'un monstre ou
 * celui d'une autre classe lève une erreur qui le dit, sans rien écrire.
 *
 * Ouvre sa propre transaction, un point de sauvegarde quand `executor` en est déjà une. La ligne de
 * la classe est verrouillée dès la lecture de l'avant, qu'aucun réglage concurrent ne périme.
 */
export async function setClassDefaultModel(
	executor: Executor,
	characterClass: string,
	fileId: number,
): Promise<{ before: number | null; after: number }> {
	return executor.transaction(async (tx) => {
		await assertFileOfClass(tx, characterClass, fileId);
		// ponytail: sans ligne pour la classe, rien à verrouiller : deux premiers réglages simultanés
		// lisent tous deux un avant nul, et le second écrase le premier (mesuré le 2026-11-20,
		// Postgres 18). Un verrou consultatif par classe si les réglages deviennent concurrents.
		const [current] = await tx
			.select({ fileId: classDefaultModels.modelFileId })
			.from(classDefaultModels)
			.where(eq(classDefaultModels.class, characterClass))
			.for("update");
		await tx
			.insert(classDefaultModels)
			.values({ class: characterClass, modelFileId: fileId })
			.onConflictDoUpdate({
				target: classDefaultModels.class,
				set: { modelFileId: fileId },
			});
		return { before: current?.fileId ?? null, after: fileId };
	});
}
