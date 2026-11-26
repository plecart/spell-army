/**
 * L'anonymisation d'un joueur retiré dans les journaux de combat stockés (issue #21, Décisions, 1) :
 * `retirer_joueur` (`packages/joueurs`, `removePlayer`) l'appelle dans sa transaction.
 */
import { eq, sql } from "drizzle-orm";
import type { Executor } from "./client.ts";
import { combats } from "./schema.ts";
import { readSeasonState } from "./season.ts";

/** Ce qui remplace l'identifiant d'un joueur retiré dans les journaux stockés. */
export const REMOVED_PLAYER_LABEL = "retiré";

/**
 * `value`, chacun de ses textes égal à `from`, à toute profondeur, remplacé par `to`, ainsi que le
 * `reason` d'un objet dont l'`id` vaut `from` : le motif d'un forcé, texte libre du mainteneur, peut
 * nommer le joueur qu'il décrit.
 */
function replaceText(value: unknown, from: string, to: string): unknown {
	if (value === from) return to;
	if (Array.isArray(value)) {
		return value.map((item) => replaceText(item, from, to));
	}
	if (value !== null && typeof value === "object") {
		const describesPlayer = "id" in value && value.id === from;
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				describesPlayer && key === "reason" ? to : replaceText(item, from, to),
			]),
		);
	}
	return value;
}

/**
 * Remplace par `REMOVED_PLAYER_LABEL` chaque texte égal à `instagramId` dans les journaux de combat
 * stockés — tirés, actions, forcés, forcés non atteints — et le motif du forcé qu'il était, puis
 * rend le nombre de journaux réécrits. Seuls ceux qui le portent le sont, trouvés par la base. Un
 * texte égal, pas un texte qui le contient : « 10 » ne touche ni « 100 », ni le nombre 10, ni le
 * motif d'un autre forcé qui le citerait. Rejouée, elle ne réécrit rien.
 *
 * Ouvre sa propre transaction, un point de sauvegarde quand `executor` en est déjà une, ce qui
 * l'annule avec celle de l'appelant. Elle verrouille d'abord l'état de la saison, comme le
 * lancement d'un combat (`readSeasonState`, `forUpdate`) : pendant un lancement, elle attend sa fin
 * et réécrit le journal qu'il vient d'écrire ; un lancement suivant attend la fin de la transaction
 * de l'appelant.
 */
export async function anonymizeCombatLogs(
	executor: Executor,
	instagramId: string,
): Promise<number> {
	return executor.transaction(async (tx) => {
		await readSeasonState(tx, { forUpdate: true });
		const carrying = await tx
			.select({ id: combats.id, log: combats.log })
			.from(combats)
			.where(
				sql`jsonb_path_exists(${combats.log}, 'strict $.** ? (@ == $id)', jsonb_build_object('id', ${instagramId}::text))`,
			);
		// ponytail: une requête par journal réécrit, un retrait en touche au plus un par combat de la
		// saison ; un seul `update … from (values …)` s'il en touchait des milliers.
		for (const { id, log } of carrying) {
			await tx
				.update(combats)
				.set({ log: replaceText(log, instagramId, REMOVED_PLAYER_LABEL) })
				.where(eq(combats.id, id));
		}
		return carrying.length;
	});
}
