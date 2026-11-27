// Lancé par `pnpm --filter web build`, après `next build` : applique les migrations sur un
// déploiement de production seulement (`migrateOnProductionDeploy`). Un `next build` en échec ne le
// lance pas : aucune base n'est migrée pour un déploiement qui n'aura pas lieu. Une migration en
// échec — dont `DATABASE_URL` absente, sur laquelle la commande sort en 1 — fait échouer le build,
// donc le déploiement. Chaque migration reste compatible avec le code déjà déployé
// (docs/exploitation.md, « Mise en ligne »).
//
// La migration ne tourne que sur le build Linux de Vercel : sous Windows, `execFileSync("pnpm")`,
// sans shell, ne trouve pas `pnpm.cmd` et lève `ENOENT` (mesuré le 2026-11-27, Node 24.3).
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
