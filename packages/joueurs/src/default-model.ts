import { type Executor, players, setClassDefaultModel } from "donnees";
import { eq, isNull, type SQL, sql } from "drizzle-orm";
import { characterOf } from "personnages";

/**
 * Un changement du modèle par défaut d'une classe : le défaut avant et après, et le nombre de joueurs
 * qui l'ont suivi.
 */
export interface ClassDefaultModelChange {
	/** L'identifiant du fichier du défaut d'avant ; nul quand la classe n'en avait pas. */
	before: number | null;
	/** L'identifiant du fichier du nouveau défaut. */
	after: number;
	/** Le nombre de joueurs dont le modèle a suivi le défaut. */
	followed: number;
}

/**
 * Fait du fichier `fileId` le modèle par défaut de `characterClass` (`setClassDefaultModel`), et
 * le fait suivre à ses joueurs (direction artistique § 5, « Changement d'un défaut »), dans une
 * même transaction : un point de sauvegarde quand `executor` en est déjà une. Avec un ancien
 * défaut, suivent les joueurs dont le modèle valait l'ancien défaut, quelle que soit leur classe
 * — un défaut est toujours un fichier de sa classe ; sans ancien défaut, les joueurs sans modèle
 * dont la classe, calculée par `characterOf`, est `characterClass`. Les autres ne bougent pas.
 *
 * Une page en cours d'écriture tient `class_default_models` en mode partagé (`writePage`) : le
 * réglage attend son commit, et ses joueurs suivent.
 *
 * @param executor le client, ou la transaction de l'appelant.
 * @param characterClass la classe, dont l'appelant vérifie le nom.
 * @param fileId le fichier du nouveau défaut, un fichier de cette classe.
 * @returns le défaut avant et après, et le nombre de joueurs qui ont suivi.
 * @throws l'erreur de `setClassDefaultModel` pour un fichier inexistant, d'un monstre ou d'une
 * autre classe, et toute erreur de la base, telles quelles : rien n'est alors changé.
 */
export async function changeClassDefaultModel(
	executor: Executor,
	characterClass: string,
	fileId: number,
): Promise<ClassDefaultModelChange> {
	return executor.transaction(async (tx) => {
		const { before, after } = await setClassDefaultModel(
			tx,
			characterClass,
			fileId,
		);
		const followers =
			before === null
				? await modellessPlayersOf(tx, characterClass)
				: eq(players.modelFileId, before);
		const { rowCount } = await tx
			.update(players)
			.set({ modelFileId: after })
			.where(followers);
		return { before, after, followed: rowCount ?? 0 };
	});
}

// La condition qui désigne les joueurs sans modèle de `characterClass`. La classe ne se stocke pas :
// elle se calcule depuis l'identifiant de chaque joueur sans modèle.
async function modellessPlayersOf(
	executor: Executor,
	characterClass: string,
): Promise<SQL> {
	const modelless = await executor
		.select({ id: players.instagramId })
		.from(players)
		.where(isNull(players.modelFileId));
	const ids = modelless
		.map(({ id }) => id)
		.filter((id) => characterOf(id).class === characterClass);
	// Un seul paramètre tableau, jamais un par identifiant (`inArray`) : le message Bind du protocole
	// Postgres compte ses paramètres sur 16 bits (pg-protocol 1.16.1, `serializer.js`, `bind`).
	return sql`${players.instagramId} = any(${sql.param(ids)})`;
}
