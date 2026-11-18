import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * Client Drizzle de la base désignée par `url`, sur un pool `pg` (node-postgres) : le même pilote
 * contre la base de test et contre Neon. L'appelant ferme le pool par `client.$client.end()`.
 */
export function createClient(url: string) {
	return drizzle(url);
}

/** Le client que rend `createClient`, ou une transaction ouverte sur lui. */
export type Executor = PgDatabase<NodePgQueryResultHKT>;
