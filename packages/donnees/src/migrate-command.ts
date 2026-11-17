// Commande `pnpm --filter donnees run migrate` : applique les migrations à la base de
// `DATABASE_URL`, posée dans le shell ou dans le fichier `.env` de la racine. Fichier d'entrée à
// part, sans garde de module principal : `import.meta.main` n'arrive qu'en Node 24.2 (24.3 pour un
// fichier `.ts`), quand `engines` admet tout Node 24.
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
