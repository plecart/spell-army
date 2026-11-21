import { database, followerProvider } from "../../environment.ts";
import { createRegistry } from "../../mcp/registry.ts";
import { createMcpEndpoint } from "../../mcp/server.ts";

// La durée maximale d'une fonction sur Hobby (ADR 0002, « Verrou à bail ») : une relance de passe
// court jusqu'à 240 s. Un littéral : `next build` le lit dans l'arbre syntaxique de la route, sans
// l'exécuter (Next.js 16.4.6, `build/analysis/get-page-static-info.js`,
// `extractExportedConstValue`).
export const maxDuration = 300;

const endpoint = createMcpEndpoint({
	token: () => process.env.MCP_TOKEN,
	database,
	tools: createRegistry(followerProvider),
});

// Toutes les méthodes qu'une route peut servir : toute requête sans jeton reçoit le même `401`.
export {
	endpoint as DELETE,
	endpoint as GET,
	endpoint as HEAD,
	endpoint as OPTIONS,
	endpoint as PATCH,
	endpoint as POST,
	endpoint as PUT,
};
