import { DrizzleQueryError } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { DatabaseError } from "pg";

/**
 * Client Drizzle de la base désignée par `url`, sur un pool `pg` (node-postgres) : le même pilote
 * contre la base de test et contre Neon. L'appelant ferme le pool par `closeClient`.
 */
export function createClient(url: string) {
	return drizzle(url);
}

// L'attente maximale de la fermeture du pool. Une fermeture saine se résout sans attendre ses
// sockets : pg-pool 3.14.0 la conclut dès que sa liste de clients est vide (`_pulseQueue`), et elle
// a pris 0,1 ms au plus sur la base de test (5 mesures, le 2026-11-26). Seule une fermeture
// bloquée attend ce délai, une fois, à la sortie d'une commande en échec.
const POOL_CLOSE_TIMEOUT_MS = 1000;

/**
 * Ferme le pool de `client` et rend toujours la main : à la fermeture du pool, sinon au bout de
 * `POOL_CLOSE_TIMEOUT_MS`. Une fermeture peut ne jamais se résoudre : pg-pool 3.14.0 (pg 8.23.1)
 * garde dans sa liste le client dont la connexion a levé sans rappeler (`newClient`) — un port de
 * l'adresse ou de `PGPORT` qui n'est pas un port —, et Node, sa boucle vide, sortait alors en 13
 * sans raison (#55). Le minuteur tient la boucle jusqu'à son terme ; il est annulé dès la
 * fermeture, sans retarder la sortie.
 */
export async function closeClient(
	client: ReturnType<typeof createClient>,
): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			client.$client.end(),
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, POOL_CLOSE_TIMEOUT_MS);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

/** Le refus d'une commande du dépôt lancée sans base : `DATABASE_URL` absente ou vide. */
export const EMPTY_DATABASE_URL =
	"DATABASE_URL est vide : renseigne-la dans le shell ou dans le fichier .env de la racine.";

/** Le client que rend `createClient`, ou une transaction ouverte sur lui. */
export type Executor = PgDatabase<NodePgQueryResultHKT>;

/**
 * Le code et la contrainte de l'erreur que Postgres a renvoyée, nue ou sous l'erreur de requête
 * dont Drizzle l'enveloppe, qui la porte en cause (`DrizzleQueryError`, drizzle-orm 0.45.4,
 * `pg-core/session.js`) ; `undefined` pour toute autre erreur. Rien d'autre : le message de
 * l'enveloppe recopie la requête et ses paramètres, celui de Postgres et son détail peuvent citer
 * une valeur de la ligne.
 */
export function postgresErrorCode(
	error: unknown,
): Pick<DatabaseError, "code" | "constraint"> | undefined {
	const cause = error instanceof DrizzleQueryError ? error.cause : error;
	return cause instanceof DatabaseError
		? { code: cause.code, constraint: cause.constraint }
		: undefined;
}
