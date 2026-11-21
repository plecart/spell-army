import { database, followerProvider } from "../../environment.ts";
import { createRegistry } from "../../mcp/registry.ts";
import { createMcpEndpoint } from "../../mcp/server.ts";

// La durée maximale d'une fonction sur Hobby (ADR 0002, « Verrou à bail ») : une relance de passe
// court jusqu'à 240 s. Un littéral, que `next build` lit sans exécuter la route.
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
