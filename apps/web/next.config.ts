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

const nextConfig: NextConfig = {
	// Les paquets du dépôt exposent leurs sources TypeScript : Next.js les compile avec l'application.
	transpilePackages: ["combat", "donnees"],
	// Sans cela, `next dev` écrit un `AGENTS.md` quand il détecte un agent IA : les consignes des
	// agents du dépôt vivent dans `CLAUDE.md`.
	agentRules: false,
};

export default nextConfig;
