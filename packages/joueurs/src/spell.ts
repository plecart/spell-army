import { type Executor, players, spells } from "donnees";
import { eq } from "drizzle-orm";

/** Le don d'un sort : le numéro du sort du joueur avant, et après. */
export interface SpellChange {
	before: number;
	after: number;
}

/**
 * Donne au joueur `instagramId` le sort `spellNumber` de la réserve, à la place du sien, poids 0
 * compris : un sort de poids 0 ne se tire jamais, il ne se donne qu'ainsi (game design § 2,
 * « Rareté »). Donner au joueur le sort qu'il a déjà ne change rien, et rend ce numéro avant comme
 * après.
 *
 * Une transaction, un point de sauvegarde quand `executor` en est déjà une. La ligne du joueur est
 * verrouillée dès la lecture de son sort, qu'aucun don concurrent ne périme. L'existence du sort se
 * vérifie sur son seul numéro, sans lire son image.
 *
 * @param executor le client, ou la transaction de l'appelant.
 * @param instagramId l'identifiant du joueur, dont l'appelant vérifie la forme.
 * @param spellNumber le numéro du sort à donner.
 * @returns le numéro du sort du joueur avant le don, et après.
 * @throws une erreur qui nomme l'identifiant quand aucun joueur ne le porte — un joueur retiré
 * compris, puisque le retrait supprime sa ligne (issue #14) —, sinon une erreur qui nomme le numéro
 * quand aucun sort ne le porte, et toute erreur de la base telle quelle : rien n'est alors changé.
 */
export async function giveSpell(
	executor: Executor,
	instagramId: string,
	spellNumber: number,
): Promise<SpellChange> {
	const ofPlayer = eq(players.instagramId, instagramId);
	return executor.transaction(async (tx) => {
		const [player] = await tx
			.select({ spellNumber: players.spellNumber })
			.from(players)
			.where(ofPlayer)
			.for("update");
		if (!player) {
			throw new Error(
				`Aucun joueur d'identifiant ${instagramId} : rien n'a changé.`,
			);
		}
		const [spell] = await tx
			.select({ number: spells.number })
			.from(spells)
			.where(eq(spells.number, spellNumber));
		if (!spell) {
			throw new Error(`Aucun sort de numéro ${spellNumber} : rien n'a changé.`);
		}
		await tx.update(players).set({ spellNumber }).where(ofPlayer);
		return { before: player.spellNumber, after: spellNumber };
	});
}
