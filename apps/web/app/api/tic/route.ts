import { database, followerProvider } from "../../environment.ts";
import { createTickEndpoint } from "../../tick.ts";

// La durée maximale d'une fonction sur Hobby (ADR 0002, « Verrou à bail ») : le tic court jusqu'à
// 240 s. Un littéral : `next build` le lit dans l'arbre syntaxique de la route, sans l'exécuter
// (Next.js 16.4.6, `build/analysis/get-page-static-info.js`, `extractExportedConstValue`).
export const maxDuration = 300;

/**
 * Le tic horaire de l'import (ADR 0002, « Une seule tâche »), qu'appellent Vercel Schedules et le
 * filet GitHub Actions en `POST`, avec `Authorization: Bearer <CRON_SECRET>`.
 */
export const POST = createTickEndpoint({
	secret: () => process.env.CRON_SECRET,
	database,
	provider: followerProvider,
});
