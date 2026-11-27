// Lancé par `pnpm --filter web build`, avant `next build` : applique les migrations sur un
// déploiement de production seulement (`migrateOnProductionDeploy`). Une migration en échec — dont
// `DATABASE_URL` absente, sur laquelle la commande sort en 1 — fait échouer le build, et rien ne
// se déploie.
import { execFileSync } from "node:child_process";
import { migrateOnProductionDeploy } from "./migration-de-production.ts";

const migrated = migrateOnProductionDeploy(process.env, (command, args) => {
	execFileSync(command, args, { stdio: "inherit" });
});
console.log(
	migrated
		? "Migrations : appliquées au déploiement de production."
		: "Migrations : aucune, hors d'un déploiement de production.",
);
