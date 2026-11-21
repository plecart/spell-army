import { DrizzleQueryError } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { DatabaseError } from "pg";

/**
 * Client Drizzle de la base désignée par `url`, sur un pool `pg` (node-postgres) : le même pilote
 * contre la base de test et contre Neon. L'appelant ferme le pool par `client.$client.end()`.
 */
export function createClient(url: string) {
	return drizzle(url);
}

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
