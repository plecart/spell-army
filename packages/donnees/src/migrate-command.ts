// Commande `pnpm --filter donnees run migrate` : applique les migrations à la base de
// `DATABASE_URL`, posée dans le shell ou dans le fichier `.env` de la racine.
import { applyMigrations } from "./migrate.ts";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error(
		"DATABASE_URL est vide : renseigne-la dans le shell ou dans le fichier .env de la racine.",
	);
	process.exit(1);
}
await applyMigrations(url);
console.log("Migrations appliquées.");
