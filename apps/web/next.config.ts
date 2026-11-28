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

/**
 * Les en-têtes de sécurité de toutes les pages (ADR 0004, « Protections Vercel », ligne
 * « En-têtes »). La CSP est sans jeton : une CSP à jetons rendrait toutes les pages dynamiques et
 * leur retirerait le cache du CDN (ADR 0002). `'unsafe-inline'` admet le script de thème du gabarit
 * racine et les attributs `style=` ; `data:` et `blob:`, les fonds SVG des cartes, les vignettes et
 * les textures de la scène 3D. En développement seulement, React évalue du code pour ses piles
 * d'erreurs : `'unsafe-eval'` s'ajoute aux scripts (guide Next.js « Content Security Policy »).
 */
function securityHeaders() {
	const scripts =
		process.env.NODE_ENV === "development"
			? "'self' 'unsafe-inline' 'unsafe-eval'"
			: "'self' 'unsafe-inline'";
	const csp = [
		"default-src 'self'",
		`script-src ${scripts}`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"connect-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join("; ");
	return [
		// Deux ans, sous-domaines compris, sans `preload` (briefing de la PR #76).
		{
			key: "Strict-Transport-Security",
			value: "max-age=63072000; includeSubDomains",
		},
		{ key: "Content-Security-Policy", value: csp },
		{ key: "X-Content-Type-Options", value: "nosniff" },
		{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
		{
			key: "Permissions-Policy",
			value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
		},
	];
}

const nextConfig: NextConfig = {
	// Les paquets du dépôt exposent leurs sources TypeScript : Next.js les compile avec l'application.
	transpilePackages: ["combat", "donnees", "joueurs", "personnages"],
	// Sans cela, `next dev` écrit un `AGENTS.md` quand il détecte un agent IA : les consignes des
	// agents du dépôt vivent dans `CLAUDE.md`.
	agentRules: false,
	async headers() {
		return [
			...CDN_CACHED_PAGES.map((source) => ({ source, headers: [CDN_CACHE] })),
			// `/:path*` couvre aussi `/`.
			{ source: "/:path*", headers: securityHeaders() },
		];
	},
	// L'adresse `.vercel.app` de production redirigée vers le domaine du projet (ADR 0004, « Adresse
	// `.vercel.app` ») : 308, chemin gardé, la requête passant d'elle-même (doc Next.js
	// « redirects »). Lue au build, sur deux variables système de Vercel (doc « System environment
	// variables ») : `VERCEL_ENV`, et `VERCEL_PROJECT_PRODUCTION_URL`, le plus court des domaines
	// personnalisés de production, sans schéma. Un projet sans domaine personnalisé y reçoit son
	// `.vercel.app`, où la redirection bouclerait : elle n'est pas posée, pas plus que sur une
	// prévisualisation.
	//
	// La route du tic n'est pas redirigée (ni `/api/tic/…`) : Vercel Schedules l'appelle sur un
	// déploiement de production, et sa doc ne dit ni sur quel hôte ni s'il suit une redirection — un
	// 308 non suivi n'y lancerait aucun tic. Le filet, lui, l'appelle sur le domaine du projet. La
	// `source` exclut le chemin par une assertion négative, forme de « Regex Path Matching » (doc
	// Next.js « redirects »).
	async redirects() {
		const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
		if (
			process.env.VERCEL_ENV !== "production" ||
			!domain ||
			domain.endsWith(".vercel.app")
		) {
			return [];
		}
		return [
			{
				source: "/:path((?!api/tic(?:/|$)).*)",
				has: [{ type: "host", value: ".*\\.vercel\\.app" }],
				destination: `https://${domain}/:path`,
				permanent: true,
			},
		];
	},
};

export default nextConfig;
