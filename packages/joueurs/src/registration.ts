import {
	classDefaultModels,
	type Executor,
	excludedPlayers,
	players,
	readDrawablePool,
} from "donnees";
import { inArray, sql } from "drizzle-orm";
import { characterOf, drawSpell } from "personnages";
import {
	type FollowerEntry,
	type ScreenedPage,
	screenEntries,
} from "./entries.ts";

/** Ce qu'a fait l'écriture d'une page : les joueurs ajoutés, les entrées écartées par motif. */
export type WrittenPage = Omit<ScreenedPage, "entries"> & { added: number };

/**
 * Écrit une page du fournisseur (ADR 0003, « Écriture », « Sort à l'inscription ») : inscrit chaque
 * nouvel abonné, et ne touche à aucun joueur présent — ni pseudo, ni date d'arrivée, ni sort, ni
 * modèle. Les entrées se trient d'abord par `screenEntries`. Un identifiant exclu n'est jamais
 * inscrit. Un nouveau joueur reçoit le pseudo reçu, la date d'arrivée de la transaction, le sort
 * que `drawSpell` lui tire dans la réserve tirable, lue seulement s'il y a un nouveau joueur, et le
 * modèle par défaut de sa classe, nul sans défaut.
 *
 * Une transaction par appel, un point de sauvegarde quand `executor` en est déjà une : la page
 * s'écrit entière ou pas du tout. Elle verrouille d'abord, en une instruction et en mode partagé,
 * `class_default_models` et `excluded_players`. Un réglage du modèle par défaut qui a déjà écrit son
 * défaut la fait attendre son commit, et un réglage lancé pendant l'écriture attend le sien, même
 * pour une classe encore sans défaut, sans ligne à verrouiller. De même d'un retrait
 * (`removePlayer`) : celui qui a déjà inscrit son exclusion la fait attendre son commit, puis elle
 * voit l'exclusion ; celui lancé pendant l'écriture attend le sien, puis supprime le joueur qu'elle
 * vient d'inscrire.
 *
 * @param executor le client, ou la transaction de l'appelant.
 * @param page les entrées de la page, telles que le fournisseur les rend.
 * @returns le nombre de joueurs inscrits par cette écriture, et celui des entrées écartées par motif.
 * @throws l'erreur de `drawSpell` (`RangeError`) quand la réserve tirable n'a aucun poids positif,
 * et toute erreur de la base, telles quelles : rien de la page n'est alors écrit.
 */
export async function writePage(
	executor: Executor,
	page: readonly FollowerEntry[],
): Promise<WrittenPage> {
	const { entries, ...discarded } = screenEntries(page);
	const added = await executor.transaction(async (tx) => {
		await tx.execute(
			sql`lock table ${classDefaultModels}, ${excludedPlayers} in share mode`,
		);
		const known = await knownIds(
			tx,
			entries.map(({ id }) => id),
		);
		const newcomers = entries.filter(({ id }) => !known.has(id));
		if (newcomers.length === 0) {
			return 0;
		}
		const inserted = await tx
			.insert(players)
			.values(await newPlayers(tx, newcomers))
			.onConflictDoNothing()
			.returning({ instagramId: players.instagramId });
		return inserted.length;
	});
	return { added, ...discarded };
}

/** Parmi `ids`, ceux d'un joueur présent ou d'un identifiant exclu. */
async function knownIds(
	executor: Executor,
	ids: string[],
): Promise<Set<string>> {
	const rows = await executor
		.select({ id: players.instagramId })
		.from(players)
		.where(inArray(players.instagramId, ids))
		.union(
			executor
				.select({ id: excludedPlayers.instagramId })
				.from(excludedPlayers)
				.where(inArray(excludedPlayers.instagramId, ids)),
		);
	return new Set(rows.map(({ id }) => id));
}

/** Les lignes des nouveaux joueurs : sort tiré dans la réserve, modèle par défaut de leur classe. */
async function newPlayers(
	executor: Executor,
	newcomers: FollowerEntry[],
): Promise<(typeof players.$inferInsert)[]> {
	const pool = await readDrawablePool(executor);
	const defaults = new Map(
		(await executor.select().from(classDefaultModels)).map(
			({ class: characterClass, modelFileId }) => [characterClass, modelFileId],
		),
	);
	return newcomers.map(({ id, username }) => ({
		instagramId: id,
		username,
		spellNumber: Number(drawSpell(id, pool)),
		modelFileId: defaults.get(characterOf(id).class) ?? null,
	}));
}
