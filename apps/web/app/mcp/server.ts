import {
	createMcpHandler,
	originValidationResponse,
	Server,
} from "@modelcontextprotocol/server";
import type { Executor } from "donnees";
import { requireBearer } from "../token.ts";
import { confirmationKey } from "./confirmation.ts";
import { callTool, listTools, type McpTool } from "./tool.ts";

const SERVER_INFO = { name: "spell-army", version: "1.0.0" };

export interface McpEndpointOptions {
	/**
	 * Le jeton configuré, lu à chaque requête, puis à chaque appel d'outil, une fois la requête
	 * admise, pour en dériver la clé des codes de confirmation (`confirmationKey`).
	 */
	token: () => string | undefined;
	/** Le client de la base, demandé à chaque appel d'outil. */
	database: () => Executor;
	tools: readonly McpTool[];
}

/**
 * Le point d'entrée HTTP du serveur MCP (ADR 0005). L'en-tête `Origin` se contrôle d'abord, comme
 * la spécification MCP le demande au transport HTTP : aucun client navigateur n'est prévu, et tout
 * `Origin` non vide reçoit `403` (`originValidationResponse` du SDK, sur une liste vide) ; sans
 * `Origin`, la requête de Claude Code passe. Le jeton se contrôle ensuite, avant le SDK et avant
 * toute base : tout refus rend le même `401`, sans dire si c'est le jeton ou la configuration qui
 * manque. Le gestionnaire du SDK, créé une fois, sert enfin la seule spécification 2026-07-28, sans
 * SSE ni état.
 */
export function createMcpEndpoint({
	token,
	database,
	tools,
}: McpEndpointOptions): (request: Request) => Promise<Response> {
	const handler = createMcpHandler(
		() => {
			const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });
			server.setRequestHandler("tools/list", () => ({
				tools: listTools(tools),
			}));
			server.setRequestHandler("tools/call", ({ params }) => {
				const configured = token();
				return callTool(
					tools,
					database(),
					params.name,
					params.arguments,
					configured === undefined ? undefined : confirmationKey(configured),
				);
			});
			return server;
		},
		{ responseMode: "json", legacy: "reject", maxSubscriptions: 0 },
	);
	const authorized = requireBearer(token, (request) => handler.fetch(request));
	return async (request) =>
		originValidationResponse(request, []) ?? authorized(request);
}
