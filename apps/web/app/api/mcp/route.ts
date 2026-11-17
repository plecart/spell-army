import { createClient } from "donnees";
import { registry } from "../../mcp/registry.ts";
import { createMcpEndpoint } from "../../mcp/server.ts";

let client: ReturnType<typeof createClient> | undefined;

/**
 * Le client de la base, créé au premier appel d'outil sur `DATABASE_URL`, puis réutilisé. Rien ne
 * se lit ni ne se connecte à l'import : `next build` importe la route.
 */
function database() {
	if (!client) {
		const url = process.env.DATABASE_URL;
		if (!url) {
			throw new Error("DATABASE_URL absent : le serveur MCP n'a pas de base.");
		}
		client = createClient(url);
	}
	return client;
}

const endpoint = createMcpEndpoint({
	token: () => process.env.MCP_TOKEN,
	database,
	tools: registry,
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
