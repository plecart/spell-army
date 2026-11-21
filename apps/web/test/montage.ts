// Le montage commun des tests du serveur MCP : le client officiel branché sur un point d'entrée ou
// sur le registre réel, et le journal d'audit d'une base.
import {
	type CallToolResult,
	Client,
	type ClientOptions,
	type FetchLike,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { auditLog, type Executor } from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
import type { FollowerProvider } from "joueurs";
import { FakeFollowerProvider } from "joueurs/test/faux-fournisseur";
import { expect, onTestFinished } from "vitest";
import { createRegistry } from "../app/mcp/registry.ts";
import { createMcpEndpoint } from "../app/mcp/server.ts";
import { listTools } from "../app/mcp/tool.ts";

/** Le registre réel, sur un faux fournisseur d'une liste vide : de quoi le lister ou l'appeler. */
export const registry = createRegistry(() => new FakeFollowerProvider([]));

// Jeton factice de 32 octets, le minimum admis.
export const TOKEN = "t".repeat(32);
export const AUTHORIZATION = `Bearer ${TOKEN}`;
export const ENDPOINT_URL = "http://wizard-army.test/api/mcp";
// Le client de Claude Code négocie la spécification 2026-07-28 (ADR 0005, « Conséquences »).
const NEGOTIATING: ClientOptions = { versionNegotiation: { mode: "auto" } };

export type Serve = (request: Request) => Promise<Response>;

/** Le `fetch` d'un client branché sur `serve`, sans réseau. */
export const fetchFrom =
	(serve: Serve): FetchLike =>
	(url, init) =>
		serve(new Request(url, init));

/** Le `Client` officiel, branché sur `serve` par l'option `fetch` de son transport. */
export async function connectClient(
	serve: Serve,
	headers: Record<string, string> = { authorization: AUTHORIZATION },
	options: ClientOptions = NEGOTIATING,
) {
	const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT_URL), {
		fetch: fetchFrom(serve),
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

/**
 * `serve`, devant lequel le corps de chaque POST passe par `rewrite` : la voie d'un corps que le
 * client, qui sérialise par `JSON.stringify`, ne sait pas écrire.
 */
export function rewritingBodies(
	serve: Serve,
	rewrite: (body: string) => string,
): Serve {
	return async (request) =>
		request.method === "POST"
			? serve(new Request(request, { body: rewrite(await request.text()) }))
			: serve(request);
}

export function auditRows(db: Executor) {
	return db.select().from(auditLog);
}

// `JSON.stringify` écrit un nombre infini `null` : le corps brut porte `1e999` à la place de cette
// chaîne, que `JSON.parse` lit `Infinity`.
export const INFINITE = "__infini__";

/**
 * Le point d'entrée du registre réel, sur une base migrée neuve et le fournisseur `provider` — un
 * faux d'une liste vide par défaut —, et cette base.
 */
export async function registryEndpoint(
	provider: FollowerProvider = new FakeFollowerProvider([]),
) {
	const db = await freshDatabase();
	const endpoint = createMcpEndpoint({
		token: () => TOKEN,
		database: () => db,
		tools: createRegistry(() => provider),
	});
	return { db, endpoint };
}

/**
 * Le client officiel, branché sur le point d'entrée du registre réel, une base migrée neuve et le
 * fournisseur `provider`. Il liste les outils d'abord : il valide alors le `structuredContent` de
 * chaque appel contre le `outputSchema` publié.
 */
export async function connectToRegistry(provider?: FollowerProvider) {
	const { db, endpoint } = await registryEndpoint(provider);
	const client = await connectClient(
		rewritingBodies(endpoint, (body) =>
			body.replaceAll(`"${INFINITE}"`, "1e999"),
		),
	);
	await client.listTools();
	return { db, client };
}

/** Ce que publie `tools/list` des outils `names`, dans l'ordre du registre réel. */
export function publishedTools(names: readonly string[]) {
	return listTools(registry).filter(({ name }) => names.includes(name));
}

/** La sortie d'un appel réussi : son `structuredContent`, que son texte JSON répète. */
export function outputOf({
	content,
	structuredContent,
	isError,
}: CallToolResult): unknown {
	const [block] = content;
	if (isError || block?.type !== "text") {
		throw new Error(`Appel en échec : ${JSON.stringify(content)}`);
	}
	expect(structuredContent).toEqual(JSON.parse(block.text));
	return structuredContent;
}
