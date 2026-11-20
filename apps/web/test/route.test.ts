import { Socket } from "node:net";
import { UNREACHABLE_DATABASE_URL } from "donnees/test/base-de-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
	AUTHORIZATION,
	connectClient,
	ENDPOINT_URL,
	TOKEN,
} from "./montage.ts";

// Les méthodes HTTP qu'une route de Next.js peut exporter (doc Next.js 16, `route.js`).
const METHODS = [
	"GET",
	"HEAD",
	"OPTIONS",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
] as const;

/** La route, évaluée à neuf : son import ne doit lire aucune variable ni ouvrir de connexion. */
async function importRoute() {
	vi.resetModules();
	return import("../app/api/mcp/route.ts");
}

describe("route /api/mcp", () => {
	beforeEach(() => {
		vi.stubEnv("MCP_TOKEN", undefined);
		vi.stubEnv("DATABASE_URL", UNREACHABLE_DATABASE_URL);
	});

	test.each(METHODS)("sans MCP_TOKEN, %s rend 401", async (method) => {
		const route = await importRoute();
		const response = await route[method](
			new Request(ENDPOINT_URL, {
				method,
				headers: { authorization: AUTHORIZATION },
			}),
		);
		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toBe("Bearer");
	});

	test("l'import puis un refus n'ouvrent aucune connexion", async () => {
		const connect = vi.spyOn(Socket.prototype, "connect");
		const { POST } = await importRoute();
		await POST(new Request(ENDPOINT_URL, { method: "POST" }));
		expect(connect).not.toHaveBeenCalled();
	});

	test("MCP_TOKEN se lit à la requête, pas à l'import", async () => {
		const { GET } = await importRoute();
		vi.stubEnv("MCP_TOKEN", TOKEN);
		const response = await GET(
			new Request(ENDPOINT_URL, { headers: { authorization: AUTHORIZATION } }),
		);
		// Admise, la requête atteint le gestionnaire du SDK, qui refuse un GET (ADR 0005, « Sans SSE »).
		expect(response.status).toBe(405);
	});

	// La base, injoignable, n'est demandée qu'au premier `tools/call`.
	test("avec MCP_TOKEN, tools/list rend les outils du registre, base injoignable", async () => {
		vi.stubEnv("MCP_TOKEN", TOKEN);
		const { POST } = await importRoute();
		const client = await connectClient(POST);
		const { tools } = await client.listTools();
		expect(tools.map(({ name }) => name)).toEqual([
			"lire_reglages",
			"modifier_reglages",
			"lister_sorts",
			"ajouter_sort",
			"modifier_sort",
		]);
	});
});
