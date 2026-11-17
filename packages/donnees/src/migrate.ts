import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createClient } from "./client.ts";

const MIGRATIONS_FOLDER = fileURLToPath(
	new URL("../migrations", import.meta.url),
);

/**
 * Applique à la base désignée par `url` les migrations de `migrations/` qu'elle n'a pas encore
 * reçues. Appelée par la commande `migrate` (`migrate-command.ts`).
 */
export async function applyMigrations(url: string): Promise<void> {
	const client = createClient(url);
	try {
		await migrate(client, { migrationsFolder: MIGRATIONS_FOLDER });
	} finally {
		await client.$client.end();
	}
}
