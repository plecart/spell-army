import { type Executor, INSTAGRAM_ID_PATTERN, players, spells } from "donnees";
import { and, eq, sql } from "drizzle-orm";
import { characterOf } from "personnages";
import { notExcluded, type VisiblePlayer } from "./visible-players.ts";

/** Un joueur visible, tel que sa fiche le montre : avec son sort et la taille de la réserve. */
export interface PlayerSheet extends VisiblePlayer {
	/** Le sort du joueur ; `effect` est le modèle de `combat` tel quel, que `joueurs` ne lit pas. */
	spell: {
		number: number;
		name: string;
		effect: unknown;
		description: string;
		hasImage: boolean;
	};
	/** Le nombre de sorts de la réserve, `spells`, poids 0 compris. */
	poolSize: number;
}

/**
 * Lit le joueur visible d'identifiant `instagramId`, son sort et la taille de la réserve, ou `null`
 * pour un joueur retiré, dans `excluded_players` (ADR 0003, « RGPD »), ou inconnu. Un identifiant
 * hors de `INSTAGRAM_ID_PATTERN` rend `null` sans requête.
 *
 * @param executor le client, ou la transaction de l'appelant.
 */
export async function readVisiblePlayer(
	executor: Executor,
	instagramId: string,
): Promise<PlayerSheet | null> {
	if (!INSTAGRAM_ID_PATTERN.test(instagramId)) {
		return null;
	}
	const [row] = await executor
		.select({
			instagramId: players.instagramId,
			username: players.username,
			arrivedAt: players.arrivedAt,
			spell: {
				number: spells.number,
				name: spells.name,
				effect: spells.effect,
				description: spells.description,
				hasImage: sql<boolean>`${spells.image} is not null`,
			},
			poolSize: executor.$count(spells),
		})
		.from(players)
		.innerJoin(spells, eq(spells.number, players.spellNumber))
		.where(and(eq(players.instagramId, instagramId), notExcluded(executor)));
	return row ? { ...row, classKey: characterOf(row.instagramId).class } : null;
}
