/**
 * La saison en base (game design § 6 et § 7 ; issue #21) : son état, ses combats, les forcés du
 * prochain combat, et ce que le lancement lit des joueurs — l'armée du jour et les arrivées par
 * date, au calendrier Europe/Paris. `donnees` ne dépend d'aucun paquet (ADR 0001, « Paquets ») : le
 * budget et le journal s'y rangent en JSON sans être lus, et l'appelant fait la correspondance avec
 * les types de `combat`.
 */
import { and, eq, getTableColumns, lt, sql } from "drizzle-orm";
import { type Executor, seededRow } from "./client.ts";
import { combats, nextCombatForced, players, seasonState } from "./schema.ts";

/**
 * L'état de la saison tel que `season_state` le porte, sans `id` : les champs de `SeasonState`
 * (`packages/combat/src/season.ts`), le budget en JSON tel quel, que l'appelant valide.
 */
export type SeasonStateRecord = Omit<typeof seasonState.$inferSelect, "id">;

// Colonnes lues et rendues : celles de `SeasonStateRecord`.
const { id: _id, ...stateColumns } = getTableColumns(seasonState);

function stateRow(rows: SeasonStateRecord[]): SeasonStateRecord {
	return seededRow(rows, "État de la saison absent");
}

/**
 * Lit l'état de la saison. `forUpdate` verrouille sa ligne jusqu'à la fin de la transaction de
 * `executor` : la lecture du lancement d'un combat, qu'aucun autre lancement ni aucun choix des
 * forcés (`replaceForced`) ne croise.
 *
 * @throws {Error} si la ligne manque (base non migrée).
 */
export async function readSeasonState(
	executor: Executor,
	{ forUpdate = false }: { forUpdate?: boolean } = {},
): Promise<SeasonStateRecord> {
	const query = executor.select(stateColumns).from(seasonState);
	return stateRow(await (forUpdate ? query.for("update") : query));
}

/**
 * Écrit l'état de la saison en entier et le rend tel que la base l'a écrit. Ses bornes sont celles
 * des contraintes de la table, dont la violation remonte telle quelle, sans rien écrire.
 *
 * @throws {Error} si la ligne manque (base non migrée).
 */
export async function writeSeasonState(
	executor: Executor,
	state: SeasonStateRecord,
): Promise<SeasonStateRecord> {
	return stateRow(
		await executor.update(seasonState).set(state).returning(stateColumns),
	);
}

/**
 * Un combat tel que la table `combats` le porte : `foughtOn`, sa date `AAAA-MM-JJ` au calendrier
 * Europe/Paris ; `log`, le journal stocké (`SeasonLog` de `combat`) en JSON tel quel.
 */
export type CombatRecord = typeof combats.$inferSelect;

/** Un combat à ranger : son identifiant et l'instant de son écriture viennent de la base. */
export type NewCombat = Omit<CombatRecord, "id" | "recordedAt">;

/** Ce qu'un combat dit d'un monstre qu'il a affronté : saison, jour et date. */
export type MonsterCombat = Pick<CombatRecord, "season" | "day" | "foughtOn">;

/**
 * Range `combat` et le rend tel qu'écrit. Une date déjà prise lève la violation d'unicité
 * `COMBAT_DATE_UNIQUE`, que l'appelant reconnaît par `postgresErrorCode` : c'est elle qui refuse un
 * second lancement le même jour, concurrent compris, l'insertion concurrente attendant le commit de
 * la première. Un jour déjà pris dans la saison, un monstre inconnu et les bornes des contraintes de
 * la table remontent de même en erreur de la base, sans rien écrire.
 */
export async function insertCombat(
	executor: Executor,
	combat: NewCombat,
): Promise<CombatRecord> {
	const [row] = await executor.insert(combats).values(combat).returning();
	return row as CombatRecord;
}

/** Le combat du jour `day` de la saison `season`, ou `undefined` quand il n'a pas eu lieu. */
export async function findCombat(
	executor: Executor,
	season: number,
	day: number,
): Promise<CombatRecord | undefined> {
	const [found] = await executor
		.select()
		.from(combats)
		.where(and(eq(combats.season, season), eq(combats.day, day)));
	return found;
}

/**
 * Les combats qui ont affronté le monstre `monsterId`, par saison puis par jour : ce qui empêche de
 * le retirer, et que le refus nomme.
 */
export async function listCombatsOfMonster(
	executor: Executor,
	monsterId: number,
): Promise<MonsterCombat[]> {
	return executor
		.select({
			season: combats.season,
			day: combats.day,
			foughtOn: combats.foughtOn,
		})
		.from(combats)
		.where(eq(combats.monsterId, monsterId))
		.orderBy(combats.season, combats.day);
}

/**
 * Un forcé du prochain combat : l'identifiant du joueur, sa position et son motif, les champs de
 * `Forced` (`packages/combat/src/log.ts`), l'identifiant sous son nom de `players`.
 */
export type ForcedRecord = Omit<typeof nextCombatForced.$inferSelect, "rank">;

// Colonnes lues et rendues : celles de `ForcedRecord`.
const { rank: _rank, ...forcedColumns } = getTableColumns(nextCombatForced);

/** Les forcés du prochain combat, dans l'ordre où ils ont été choisis. */
export async function readForced(executor: Executor): Promise<ForcedRecord[]> {
	return executor
		.select(forcedColumns)
		.from(nextCombatForced)
		.orderBy(nextCombatForced.rank);
}

/**
 * Remplace la liste entière des forcés du prochain combat par `forced`, dans cet ordre, et rend la
 * liste d'avant, l'avant de l'audit (issue #21, Décisions, 11 et 13). La liste vide la vide : c'est
 * ainsi que le combat la consomme. Les bornes sont celles des contraintes de la table, dont la
 * violation remonte telle quelle, la liste d'avant intacte ; l'appelant vérifie que chaque forcé est
 * un joueur.
 *
 * Ouvre sa propre transaction, un point de sauvegarde quand `executor` en est déjà une. Elle
 * verrouille d'abord l'état de la saison, comme le lancement d'un combat (`readSeasonState`,
 * `forUpdate`) : un choix des forcés attend la fin d'un lancement en cours, et sa liste reste au
 * combat suivant, au lieu d'être consommée par un lancement qui ne l'a pas lue.
 */
export async function replaceForced(
	executor: Executor,
	forced: readonly ForcedRecord[],
): Promise<ForcedRecord[]> {
	return executor.transaction(async (tx) => {
		await readSeasonState(tx, { forUpdate: true });
		const before = await readForced(tx);
		await tx.delete(nextCombatForced);
		if (forced.length > 0) {
			await tx
				.insert(nextCombatForced)
				.values(forced.map((entry, index) => ({ ...entry, rank: index + 1 })));
		}
		return before;
	});
}

/**
 * Le fuseau du calendrier du jeu (ADR 0002, « Une seule tâche ») : celui du dernier minuit, de la
 * date d'un combat et des arrivées par date.
 */
const TIME_ZONE = "Europe/Paris";

/** Un instant en paramètre de requête : son texte ISO 8601, `timestamptz` pour la base. */
function instant(at: Date) {
	return sql`cast(${at.toISOString()} as timestamptz)`;
}

/**
 * Un jour du calendrier Europe/Paris : `date`, sa date `AAAA-MM-JJ` ; `lastMidnight`, l'instant de
 * son minuit, le début de la date.
 */
export interface ParisDay {
	date: string;
	lastMidnight: Date;
}

/**
 * Le jour du calendrier Europe/Paris où tombe `at` : sa date et son dernier minuit, `at` lui-même à
 * minuit pile. La base le calcule avec sa table des fuseaux, heure d'été comprise ; l'heure vient
 * toujours de l'appelant, jamais de `now()`.
 *
 * @example à 9 h le 16 janvier 2026 à Paris : `{ date: "2026-01-16", lastMidnight }`, minuit étant
 * le 15 janvier à 23 h UTC.
 */
export async function parisCalendar(
	executor: Executor,
	at: Date,
): Promise<ParisDay> {
	type Row = { date: string; last_midnight: string };
	const { rows } = await executor.execute<Row>(
		sql`select (${instant(at)} at time zone ${TIME_ZONE})::date as date,
			date_trunc('day', ${instant(at)}, ${TIME_ZONE}) as last_midnight`,
	);
	// Un `select` sans table rend une ligne, toujours.
	const { date, last_midnight } = rows[0] as Row;
	return { date, lastMidnight: new Date(last_midnight) };
}

/** Un joueur de l'armée : ce qu'il faut pour bâtir son personnage, son identifiant et son sort. */
export type ArmyMember = Pick<
	typeof players.$inferSelect,
	"instagramId" | "spellNumber"
>;

/**
 * L'armée d'un combat (cadrage, « Conception de l'import », point 6) : les joueurs arrivés avant
 * `arrivedBefore`, le dernier minuit (`parisCalendar`), un retiré n'y figurant jamais, sa ligne
 * supprimée. Rangée par identifiant : à mêmes joueurs, même liste, et le combat, qui tire dans
 * l'ordre de l'armée (`lineupOf` de `combat`), reste le même.
 */
export async function listArmy(
	executor: Executor,
	arrivedBefore: Date,
): Promise<ArmyMember[]> {
	return executor
		.select({
			instagramId: players.instagramId,
			spellNumber: players.spellNumber,
		})
		.from(players)
		.where(lt(players.arrivedAt, arrivedBefore))
		.orderBy(players.instagramId);
}

/**
 * Les arrivées par date (game design § 6, « Recrues de référence » ; issue #21, Décisions, 7) : le
 * nombre de joueurs arrivés chacune des `days` dates complètes du calendrier Europe/Paris qui
 * précèdent `lastMidnight`, de la plus ancienne à la veille ; une date sans arrivée vaut 0. Un
 * retiré n'y compte pas, sa ligne supprimée.
 *
 * @example au minuit du 16 janvier, 3 dates : les arrivées du 13, du 14 et du 15 janvier.
 */
export async function dailyArrivals(
	executor: Executor,
	lastMidnight: Date,
	days: number,
): Promise<number[]> {
	const { rows } = await executor.execute<{ arrivals: number }>(
		sql`select count(${players.instagramId})::int as arrivals
			from generate_series(1, ${days}::int) as back(days)
			left join ${players}
				on (${players.arrivedAt} at time zone ${TIME_ZONE})::date
					= (${instant(lastMidnight)} at time zone ${TIME_ZONE})::date - back.days
			group by back.days
			order by back.days desc`,
	);
	return rows.map(({ arrivals }) => arrivals);
}
