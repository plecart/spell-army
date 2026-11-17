import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createClient } from "./client.ts";

const MIGRATIONS_FOLDER = fileURLToPath(
	new URL("../migrations", import.meta.url),
);

/**
 * Applique à la base désignée par `url` les migrations de `migrations/` qu'elle n'a pas encore
 * reçues. Appelée par la commande `migrate` ci-dessous.
 */
export async function applyMigrations(url: string): Promise<void> {
	const client = createClient(url);
	try {
		await migrate(client, { migrationsFolder: MIGRATIONS_FOLDER });
	} finally {
		await client.$client.end();
	}
}

// Commande `pnpm --filter donnees run migrate` : la base cible vient de `DATABASE_URL`, posée dans
// le shell ou dans le fichier `.env` de la racine.
if (import.meta.main) {
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error(
			"DATABASE_URL est vide : renseigne-la dans le shell ou dans le fichier .env de la racine.",
		);
		process.exit(1);
	}
	await applyMigrations(url);
	console.log("Migrations appliquées.");
}
