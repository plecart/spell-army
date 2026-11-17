import { drizzle } from "drizzle-orm/node-postgres";

/**
 * Client Drizzle de la base désignée par `url`, sur un pool `pg` (node-postgres) : le même pilote
 * contre la base de test et contre Neon. L'appelant ferme le pool par `client.$client.end()`.
 */
export function createClient(url: string) {
	return drizzle(url);
}
