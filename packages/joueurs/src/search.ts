import { type Executor, players, spells } from "donnees";
import { eq, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { type ClassKey, characterOf } from "personnages";

/** Le nombre de joueurs que rend au plus une recherche. */
export const MAX_FOUND_PLAYERS = 20;

/** Un joueur trouvé : de quoi le désigner et le reconnaître, aucun autre texte. */
export interface FoundPlayer {
	instagramId: string;
	username: string;
	/** Sa classe, calculée depuis l'identifiant par `characterOf`, jamais stockée. */
	class: ClassKey;
	/** Son sort, dans la réserve. */
	spell: { number: number; name: string };
}

/** Ce que rend une recherche : les joueurs trouvés, et si d'autres correspondaient aussi. */
export interface PlayerSearch {
	players: FoundPlayer[];
	/** Vrai quand plus de `MAX_FOUND_PLAYERS` joueurs correspondent : la liste est tronquée. */
	truncated: boolean;
}

/**
 * Les joueurs dont le pseudo contient `fragment`, pris littéralement, sans tenir compte des
 * majuscules (`containsIgnoringCase`).
 *
 * Tri par pseudo dans l'ordre des octets (`collate "C"`, majuscules avant minuscules), le même sur
 * toute base quelle que soit sa collation, puis par identifiant : deux joueurs peuvent porter le
 * même pseudo, celui d'un abonné renommé depuis son inscription, que l'import ne réécrit pas.
 *
 * @param executor le client, ou la transaction de l'appelant.
 * @param fragment la partie de pseudo cherchée, non vide pour un sens utile : vide, elle rend tout
 * joueur.
 * @returns au plus `MAX_FOUND_PLAYERS` joueurs, les premiers dans cet ordre, chacun avec son
 * identifiant, son pseudo, sa classe, le numéro et le nom de son sort ; et `truncated`, vrai quand
 * d'autres correspondaient. Une liste vide quand aucun ne correspond.
 * @throws toute erreur de la base, telle quelle.
 */
export async function searchPlayers(
	executor: Executor,
	fragment: string,
): Promise<PlayerSearch> {
	const rows = await executor
		.select({
			instagramId: players.instagramId,
			username: players.username,
			spell: { number: spells.number, name: spells.name },
		})
		.from(players)
		.innerJoin(spells, eq(players.spellNumber, spells.number))
		.where(containsIgnoringCase(players.username, fragment))
		.orderBy(sql`${players.username} collate "C"`, players.instagramId)
		// Une ligne de plus que la limite dit si la liste est tronquée.
		.limit(MAX_FOUND_PLAYERS + 1);
	return {
		players: rows.slice(0, MAX_FOUND_PLAYERS).map((row) => ({
			...row,
			class: characterOf(row.instagramId).class,
		})),
		truncated: rows.length > MAX_FOUND_PLAYERS,
	};
}

/**
 * Le prédicat SQL « `text` contient `fragment`, sans tenir compte des majuscules ».
 *
 * Par `strpos` et jamais par `like` : `fragment` est pris littéralement, sans échappement, et ses
 * `_`, `%` et `\` n'agissent pas en métacaractères. Un `fragment` vide est contenu dans tout texte.
 */
export function containsIgnoringCase(text: SQLWrapper, fragment: string): SQL {
	return sql`strpos(lower(${text}), lower(${fragment})) > 0`;
}
