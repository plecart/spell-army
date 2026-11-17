// Le montage commun des tests du serveur MCP : le client officiel branché sur un point d'entrée,
// et la base migrée neuve d'un test.
import {
	Client,
	type ClientOptions,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { auditLog, createClient, type Executor } from "donnees";
import { createMigratedDatabase } from "donnees/test/base-de-test";
import { inject, onTestFinished } from "vitest";

// Jeton factice de 32 octets, le minimum admis.
export const TOKEN = "t".repeat(32);
export const AUTHORIZATION = `Bearer ${TOKEN}`;
export const ENDPOINT_URL = "http://wizard-army.test/api/mcp";
// Le client de Claude Code négocie la spécification 2026-07-28 (ADR 0005, « Conséquences »).
const NEGOTIATING: ClientOptions = { versionNegotiation: { mode: "auto" } };

export type Serve = (request: Request) => Promise<Response>;

/** Le `Client` officiel, branché sur `serve` par l'option `fetch` de son transport. */
export async function connectClient(
	serve: Serve,
	headers: Record<string, string> = { authorization: AUTHORIZATION },
	options: ClientOptions = NEGOTIATING,
) {
	const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT_URL), {
		fetch: (url, init) => serve(new Request(url, init)),
		requestInit: { headers },
	});
	const client = new Client(
		{ name: "client-de-test", version: "0.0.0" },
		options,
	);
	onTestFinished(() => client.close());
	await client.connect(transport);
	return client;
}

/** Une base migrée neuve, fermée à la fin du test. */
export async function freshDatabase() {
	const db = createClient(
		await createMigratedDatabase(inject("testDatabaseUrl")),
	);
	onTestFinished(() => db.$client.end());
	return db;
}

export function auditRows(db: Executor) {
	return db.select().from(auditLog);
}
