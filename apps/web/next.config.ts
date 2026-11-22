import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Le seul `.env` local est celui de la racine du dépôt, que lit aussi `pnpm --filter donnees run
// migrate` ; Next.js ne lit que celui de `apps/web`. Une variable déjà posée par l'environnement
// l'emporte sur le fichier. `node --env-file-if-exists` ne convient pas : `next dev` recopie les
// options de Node dans le `NODE_OPTIONS` de son processus enfant, où Node les refuse.
const ROOT_ENV = new URL("../../.env", import.meta.url);
if (existsSync(ROOT_ENV)) {
	process.loadEnvFile(ROOT_ENV);
}

// Les pages du site, servies par le CDN de Vercel : une réponse y reste fraîche 30 min, puis y est
// servie périmée 30 min de plus pendant qu'il la revalide. Aucune n'a donc plus d'une heure : une
// recrue importée au tic horaire (ADR 0002) apparaît dans l'heure, et une recrue retirée disparaît
// dans l'heure de l'annuaire comme de sa fiche. `Vercel-CDN-Cache-Control` ne règle que ce CDN,
// sans toucher au `Cache-Control` que reçoit le navigateur (doc Vercel « CDN cache », citée au
// briefing de la PR #39).
const CDN_CACHED_PAGES = ["/", "/informations", "/recrues/:identifiant"];
const CDN_CACHE = {
	key: "Vercel-CDN-Cache-Control",
	value: "max-age=1800, stale-while-revalidate=1800",
};

const nextConfig: NextConfig = {
	// Les paquets du dépôt exposent leurs sources TypeScript : Next.js les compile avec l'application.
	transpilePackages: ["combat", "donnees", "joueurs", "personnages"],
	// Sans cela, `next dev` écrit un `AGENTS.md` quand il détecte un agent IA : les consignes des
	// agents du dépôt vivent dans `CLAUDE.md`.
	agentRules: false,
	async headers() {
		return CDN_CACHED_PAGES.map((source) => ({ source, headers: [CDN_CACHE] }));
	},
};

export default nextConfig;
