import { type Executor, excludedPlayers, players } from "donnees";
import { eq } from "drizzle-orm";

/**
 * L'effet d'un retrait : `removed`, la ligne d'un joueur supprimée et son identifiant exclu ;
 * `excluded`, un identifiant sans joueur exclu ; `already_excluded`, un identifiant déjà exclu et
 * sans joueur, rien de changé.
 */
export type RemovalEffect = "removed" | "excluded" | "already_excluded";

/** Ce que ferait un retrait : son effet et, pour un joueur, son pseudo. */
export type RemovalPreview =
	| { effect: "removed"; username: string }
	| { effect: "excluded" | "already_excluded" };

/**
 * Ce que ferait `removePlayer` sur `instagramId` d'après l'état présent. Lecture seule.
 *
 * @param executor le client, ou la transaction de l'appelant.
 * @param instagramId l'identifiant, dont l'appelant vérifie la forme.
 * @returns `removed` et le pseudo du joueur quand une ligne de `players` porte l'identifiant ;
 * sinon `already_excluded` quand il est exclu, `excluded` quand il ne l'est pas.
 * @throws toute erreur de la base, telle quelle.
 */
export async function previewRemoval(
	executor: Executor,
	instagramId: string,
): Promise<RemovalPreview> {
	const [player] = await executor
		.select({ username: players.username })
		.from(players)
		.where(eq(players.instagramId, instagramId));
	if (player) {
		return { effect: "removed", username: player.username };
	}
	const exclusions = await executor.$count(
		excludedPlayers,
		eq(excludedPlayers.instagramId, instagramId),
	);
	return { effect: exclusions > 0 ? "already_excluded" : "excluded" };
}

/**
 * Retire `instagramId` (ADR 0003, « RGPD ») : l'inscrit dans `excluded_players`, puis supprime la
 * ligne de son joueur, pseudo compris, s'il en a une. Définitif : rien ne l'annule, et l'import ne
 * crée jamais le joueur d'un identifiant exclu (`writePage`). Retirer un identifiant déjà exclu et
 * sans joueur ne change rien et ne lève rien.
 *
 * Une transaction, un point de sauvegarde quand `executor` en est déjà une. L'exclusion s'inscrit
 * avant la suppression : une page en cours d'écriture tient `excluded_players` en mode partagé
 * (`writePage`), l'inscription attend son commit, et la suppression, qui lit après lui, supprime le
 * joueur que la page vient d'inscrire.
 *
 * @param executor le client, ou la transaction de l'appelant.
 * @param instagramId l'identifiant, dont l'appelant vérifie la forme.
 * @returns `removed` si une ligne de `players` a été supprimée ; sinon `excluded` si l'exclusion est
 * neuve ; sinon `already_excluded`.
 * @throws toute erreur de la base, telle quelle : rien n'est alors changé.
 */
export async function removePlayer(
	executor: Executor,
	instagramId: string,
): Promise<RemovalEffect> {
	return executor.transaction(async (tx) => {
		const excluded = await tx
			.insert(excludedPlayers)
			.values({ instagramId })
			.onConflictDoNothing()
			.returning({ instagramId: excludedPlayers.instagramId });
		const removed = await tx
			.delete(players)
			.where(eq(players.instagramId, instagramId))
			.returning({ instagramId: players.instagramId });
		if (removed.length > 0) {
			return "removed";
		}
		return excluded.length > 0 ? "excluded" : "already_excluded";
	});
}
