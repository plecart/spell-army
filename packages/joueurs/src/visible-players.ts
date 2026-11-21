import { type Executor, excludedPlayers, players } from "donnees";
import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { CLASS_KEYS, type ClassKey, characterOf } from "personnages";

/** Le nombre de joueurs d'une page de l'annuaire (direction artistique § 3, « Pagination »). */
export const DIRECTORY_PAGE_SIZE = 24;

/** Un joueur visible, tel que l'annuaire le montre. */
export interface VisiblePlayer {
	instagramId: string;
	username: string;
	/** La classe, calculée depuis l'identifiant (`characterOf`), jamais stockée. */
	classKey: ClassKey;
	arrivedAt: Date;
}

/** Ce que l'annuaire demande ; tout champ est facultatif. */
export interface VisiblePlayersQuery {
	/** Une partie du pseudo, sans tenir compte de la casse ; vide ou blanche : pas de recherche. */
	search?: string;
	/** La classe des joueurs à rendre ; absente : toutes. */
	classKey?: ClassKey;
	/** La page, un entier compté depuis 1, ramené dans [1, `pageCount`] ; 1 par défaut. */
	page?: number;
}

/** Une page de joueurs visibles, et de quoi la situer. */
export interface VisiblePlayersPage {
	/** Les joueurs de la page, le plus récent d'abord. */
	players: VisiblePlayer[];
	/** Le nombre de joueurs qui portent la recherche et le filtre de classe. */
	total: number;
	/** Le nombre de joueurs de chaque classe qui portent la recherche, quel que soit le filtre. */
	classCounts: Record<ClassKey, number>;
	/** La page rendue, comptée depuis 1. */
	page: number;
	/** Le nombre de pages, au moins 1. */
	pageCount: number;
}

/**
 * Lit une page des joueurs visibles : ceux dont l'identifiant n'est pas dans `excluded_players`
 * (ADR 0003, « RGPD »). C'est la seule voie par laquelle l'annuaire lit des joueurs.
 *
 * La recherche est un « contient » insensible à la casse sur le pseudo, par `strpos` et jamais par
 * `like` : `_` est un caractère de pseudo et un joker de `like`. Les joueurs se rangent du plus
 * récent au plus ancien par `arrived_at`, puis par identifiant croissant à arrivée égale.
 *
 * La classe ne se stocke pas : la base rend les joueurs visibles qui portent la recherche, puis la
 * classe, les nombres par classe, le filtre et la page se calculent ici.
 * ponytail: coût linéaire en joueurs visibles par appel, accepté au MVP (le prototype de
 * l'annuaire en montre 1 284, direction artistique § 10 ; pages servies par le cache du CDN) ;
 * une colonne de classe indexée s'il ne tient plus.
 *
 * @param executor le client, ou la transaction de l'appelant.
 * @param query la recherche, le filtre de classe et la page.
 */
export async function listVisiblePlayers(
	executor: Executor,
	{ search, classKey, page = 1 }: VisiblePlayersQuery,
): Promise<VisiblePlayersPage> {
	const found = await readVisiblePlayers(executor, search?.trim());
	const matching = classKey
		? found.filter((player) => player.classKey === classKey)
		: found;
	return {
		...paginate(matching, page),
		total: matching.length,
		classCounts: countByClass(found),
	};
}

// Les joueurs visibles dont le pseudo contient `needle` — tous sans `needle` —, le plus récent
// d'abord, chacun avec sa classe.
async function readVisiblePlayers(
	executor: Executor,
	needle: string | undefined,
): Promise<VisiblePlayer[]> {
	const rows = await executor
		.select({
			instagramId: players.instagramId,
			username: players.username,
			arrivedAt: players.arrivedAt,
		})
		.from(players)
		.where(
			and(
				notExists(
					executor
						.select()
						.from(excludedPlayers)
						.where(eq(excludedPlayers.instagramId, players.instagramId)),
				),
				needle
					? sql`strpos(lower(${players.username}), lower(${needle})) > 0`
					: undefined,
			),
		)
		.orderBy(desc(players.arrivedAt), players.instagramId);
	return rows.map((row) => ({
		...row,
		classKey: characterOf(row.instagramId).class,
	}));
}

// La page `page` de `items`, ramenée dans [1, `pageCount`], et le nombre de pages, au moins 1.
function paginate(items: VisiblePlayer[], page: number) {
	const pageCount = Math.max(1, Math.ceil(items.length / DIRECTORY_PAGE_SIZE));
	const current = Math.min(Math.max(page, 1), pageCount);
	const start = (current - 1) * DIRECTORY_PAGE_SIZE;
	return {
		players: items.slice(start, start + DIRECTORY_PAGE_SIZE),
		page: current,
		pageCount,
	};
}

// Le nombre de `found` de chaque classe, à zéro pour une classe absente.
function countByClass(found: VisiblePlayer[]): Record<ClassKey, number> {
	const counts = Object.fromEntries(
		CLASS_KEYS.map((classKey) => [classKey, 0]),
	) as Record<ClassKey, number>;
	for (const { classKey } of found) {
		counts[classKey]++;
	}
	return counts;
}
