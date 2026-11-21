// Le montage commun des tests du serveur MCP et du tic : le client officiel branché sur un point
// d'entrée ou sur le registre réel, le journal d'audit d'une base, la requête du tic, et les codes
// de confirmation des outils destructeurs.
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
import { expect, onTestFinished, vi } from "vitest";
import { createRegistry } from "../app/mcp/registry.ts";
import { createMcpEndpoint } from "../app/mcp/server.ts";
import { listTools } from "../app/mcp/tool.ts";

/** Le registre réel, sur un faux fournisseur d'une liste vide : de quoi le lister ou l'appeler. */
export const registry = createRegistry(() => new FakeFollowerProvider([]));

// Jeton factice de 32 octets, le minimum admis.
export const TOKEN = "t".repeat(32);
export const AUTHORIZATION = `Bearer ${TOKEN}`;
export const ENDPOINT_URL = "http://wizard-army.test/api/mcp";

// Secret factice du tic, de 32 octets comme le jeton.
export const TICK_SECRET = "s".repeat(32);

/** Un `POST` du tic, avec les en-têtes `headers` : par défaut, celui qui présente `TICK_SECRET`. */
export function tickRequest(
	headers: Record<string, string> = { authorization: `Bearer ${TICK_SECRET}` },
): Request {
	return new Request("http://wizard-army.test/api/tic", {
		method: "POST",
		headers,
	});
}

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

/** Les lignes d'audit de l'outil `tool`. */
export async function auditOf(db: Executor, tool: string) {
	return (await auditRows(db)).filter((row) => row.tool === tool);
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

/**
 * Appelle `tool` avec `args` sur le registre réel, une base migrée neuve et le fournisseur
 * `provider` : refusé, une seule ligne d'audit de l'outil, en erreur, garde l'entrée reçue et le
 * message rendu. Rend la base et le client, pour vérifier que rien n'est écrit.
 */
export async function expectRefusal(
	tool: string,
	args: Record<string, unknown>,
	message: string,
	provider?: FollowerProvider,
) {
	const { db, client } = await connectToRegistry(provider);
	const result = await client.callTool({ name: tool, arguments: args });
	const rows = await auditOf(db, tool);
	expect(rows).toEqual([
		expect.objectContaining({ input: args, succeeded: false }),
	]);
	expect(rows[0]?.error).toContain(message);
	expect(result).toMatchObject({
		content: [{ type: "text", text: rows[0]?.error }],
		isError: true,
	});
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

// La durée de validité d'un code de confirmation, 5 minutes (issue #14), et le refus d'un code
// invalide, qui précède la description.
export const CODE_LIFETIME_MS = 5 * 60_000;
export const REFUSED_CODE =
	"Code refusé (périmé, modifié ou obtenu pour d'autres paramètres) : rien n'a été fait.";

const BASE64URL =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Ce que rend l'appel sans exécution d'un outil confirmable. */
export interface Confirmation {
	description: string;
	code: string;
	expiration: string;
}

/** La confirmation que rend un appel sans exécution, sa sortie `{ confirmation }`. */
export function confirmationOf(result: CallToolResult): Confirmation {
	return (outputOf(result) as { confirmation: Confirmation }).confirmation;
}

/** Le code que rend l'appel sans code de l'outil `name` avec `args`. */
export async function codeFor(
	client: Client,
	name: string,
	args: object,
): Promise<string> {
	return confirmationOf(await client.callTool({ name, arguments: { ...args } }))
		.code;
}

/**
 * `code`, le caractère d'index `index` — négatif, depuis la fin — remplacé par son voisin de
 * base64url, qui n'en diffère que par le bit de poids faible.
 */
export function flipLowBit(code: string, index: number): string {
	const at = index < 0 ? code.length + index : index;
	const digit = BASE64URL.indexOf(code.charAt(at));
	return code.slice(0, at) + BASE64URL.charAt(digit ^ 1) + code.slice(at + 1);
}

/** Arrête l'horloge de `Date` seule à `at` : `pg` et testcontainers gardent les vraies minuteries. */
export function freezeDate(at: number) {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(at);
	onTestFinished(() => {
		vi.useRealTimers();
	});
}
