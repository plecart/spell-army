import {
	type CallToolResult,
	ProtocolError,
	ProtocolErrorCode,
	type Tool,
	type ToolAnnotations,
} from "@modelcontextprotocol/server";
import type { Executor } from "donnees";
import { z } from "zod";
import { writeAuditEntry } from "./audit.ts";
import { servedTool } from "./confirmation.ts";

/** Ce que rend un outil : sa sortie et, pour un changement, l'état avant et après. */
export interface ToolOutcome {
	output: unknown;
	before?: unknown;
	after?: unknown;
}

/** Un outil du serveur MCP (ADR 0005, « Conséquences »). */
export interface McpTool<Input extends z.ZodObject = z.ZodObject> {
	name: string;
	/** Le nom d'affichage. */
	title: string;
	description: string;
	/**
	 * Les quatre indices, tous explicites : pour la spécification MCP, un `destructiveHint` ou un
	 * `openWorldHint` absent vaut `true`.
	 */
	annotations: Required<Omit<ToolAnnotations, "title">>;
	/** Schéma d'entrée strict, `z.strictObject(…)` : un champ inconnu est refusé. */
	input: Input;
	/** Schéma de sortie strict, `z.strictObject(…)` : la sortie y passe avant d'être rendue. */
	output: z.ZodObject;
	/**
	 * Vrai pour un outil qui gère ses propres transactions (ADR 0005, « Conséquences ») : `run`
	 * reçoit le client racine, jamais une transaction, et la ligne d'audit s'écrit après l'appel.
	 * Faux ou absent : `run` reçoit la transaction de l'enrobage.
	 */
	ownsTransactions?: boolean;
	/**
	 * Présente pour un outil destructeur au sens de l'ADR 0004 (« Durcissement MCP ») : ce que fera
	 * l'appel confirmé, dit pour le mainteneur d'après l'état présent, sans rien changer. L'enrobage
	 * exige alors un code de confirmation avant `run` (`servedTool`) et ajoute à l'entrée un champ
	 * `code` : l'entrée de l'outil n'en déclare donc pas, sans quoi `servedTool` lève.
	 */
	confirmation?(executor: Executor, input: z.output<Input>): Promise<string>;
	run(executor: Executor, input: z.output<Input>): Promise<ToolOutcome>;
}

/**
 * Refuse l'appel d'un outil par les messages de `errors`, un par ligne, s'il y en a : `callTool` en
 * fait un refus audité.
 */
export function refuseIfAny(errors: string[]): void {
	if (errors.length > 0) {
		throw new Error(errors.join("\n"));
	}
}

/** Message d'un appel refusé sans message propre : une ligne d'audit en erreur en porte toujours un. */
const UNNAMED_ERROR = "Erreur sans message";

/**
 * Message rendu quand la ligne en erreur ne s'écrit pas, à la place de l'erreur de Drizzle, qui
 * recopie la requête et l'entrée.
 */
const AUDIT_FAILED = "Audit impossible : l'appel n'a pas été enregistré.";

/**
 * `tools/list` : chaque outil tel que l'enrobage le sert (`servedTool`) — un outil confirmable avec
 * sa description, son entrée et sa sortie de confirmation —, avec les schémas JSON tirés de ses
 * schémas Zod. Celui d'un `ZodObject` est un schéma `object`, que le type de Zod ne sait pas dire en
 * valeurs JSON : d'où la conversion.
 */
export function listTools(tools: readonly McpTool[]): Tool[] {
	return tools
		.map((tool) => servedTool(tool))
		.map(({ name, title, description, annotations, input, output }) => ({
			name,
			title,
			description,
			annotations,
			inputSchema: z.toJSONSchema(input) as Tool["inputSchema"],
			outputSchema: z.toJSONSchema(output) as Tool["outputSchema"],
		}));
}

/**
 * `tools/call` : valide l'entrée, exécute l'outil et écrit exactement une ligne d'audit.
 *
 * - Outil inconnu : ligne en erreur, puis erreur de protocole `InvalidParams`, comme `McpServer`.
 * - Entrée invalide : ligne en erreur, outil jamais appelé, résultat `isError`.
 * - Entrée valide : l'outil, la validation de sa sortie par son schéma et sa ligne en succès, dans
 *   une même transaction. Le résultat porte la sortie validée en `structuredContent` et la répète en
 *   texte JSON, comme la spécification le demande. Si l'une des trois étapes échoue, la transaction
 *   s'annule, la ligne en erreur s'écrit hors d'elle et le résultat est `isError`, sans
 *   `structuredContent`.
 * - Un outil qui gère ses transactions (`ownsTransactions`) suit les mêmes trois étapes sur le
 *   client racine, hors de toute transaction de l'enrobage : sa ligne en succès s'écrit après
 *   l'appel, une fois sa sortie validée. Si une étape échoue, la ligne en erreur s'écrit de même ; ce
 *   que l'outil a déjà validé dans ses transactions reste.
 * - Un outil confirmable (`confirmation`) suit les mêmes étapes tel que `servedTool` le sert sous
 *   `confirmationKey` : son `run` ne s'exécute que sur un code valide ; sans code valide, rien ne
 *   change, et la sortie rend la description de l'appel et un code. Sans `confirmationKey`, il est
 *   refusé comme un outil qui lève, `run` jamais appelé. S'il déclare un champ `code`, `servedTool`
 *   lève, et `callTool` avec lui, sans ligne d'audit : une erreur du registre, que `tools/list` lève
 *   de même.
 *
 * L'entrée auditée est l'entrée reçue, `{}` quand `args` manque, dont `writeAuditEntry` remplace
 * les octets par leur taille et leur empreinte. Si la ligne en erreur ne peut pas s'écrire, une
 * erreur de protocole `InternalError` au message court remonte : rien n'a été validé.
 *
 * Limite : une requête que le SDK refuse comme malformée n'atteint pas cette fonction, et n'a donc
 * ni exécution ni ligne d'audit. Ainsi d'`arguments` qui n'est pas un objet : le SDK 2.4.0 répond
 * l'erreur `-32602` « Invalid tools/call request ».
 *
 * @param confirmationKey la clé des codes de confirmation (`confirmationKey`), dérivée du jeton ;
 * absente, tout outil confirmable est refusé.
 */
export async function callTool(
	tools: readonly McpTool[],
	executor: Executor,
	name: string,
	args: Record<string, unknown> | undefined,
	confirmationKey?: Uint8Array,
): Promise<CallToolResult> {
	const input = args ?? {};
	const registered = tools.find((candidate) => candidate.name === name);
	if (!registered) {
		const message = `Tool ${name} not found`;
		await auditError(executor, name, input, message);
		throw new ProtocolError(ProtocolErrorCode.InvalidParams, message);
	}
	const tool = servedTool(registered, confirmationKey);
	const parsed = tool.input.safeParse(input);
	if (!parsed.success) {
		return refuse(executor, name, input, errorMessage(parsed.error));
	}
	const call = async (target: Executor) => {
		const { output, before, after } = await tool.run(target, parsed.data);
		const validated = tool.output.parse(output);
		await writeAuditEntry(target, { tool: name, input, before, after });
		return validated;
	};
	try {
		const validated = tool.ownsTransactions
			? await call(executor)
			: await executor.transaction(call);
		return {
			content: [{ type: "text", text: JSON.stringify(validated) }],
			structuredContent: validated,
		};
	} catch (error) {
		return refuse(executor, name, input, errorMessage(error));
	}
}

/** Écrit la ligne en erreur et rend le résultat d'erreur d'outil, convention de `McpServer`. */
async function refuse(
	executor: Executor,
	tool: string,
	input: unknown,
	message: string,
): Promise<CallToolResult> {
	await auditError(executor, tool, input, message);
	return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Écrit la ligne en erreur ; si elle ne s'écrit pas, journalise la cause côté serveur et lève
 * `InternalError` avec `AUDIT_FAILED`, sans la cause.
 */
async function auditError(
	executor: Executor,
	tool: string,
	input: unknown,
	message: string,
): Promise<void> {
	try {
		await writeAuditEntry(executor, { tool, input, error: message });
	} catch (cause) {
		// Le nom vient du client : `JSON.stringify` en échappe les sauts de ligne.
		console.error(
			`Audit impossible de l'appel de l'outil ${JSON.stringify(tool)} :`,
			cause,
		);
		throw new ProtocolError(ProtocolErrorCode.InternalError, AUDIT_FAILED);
	}
}

/**
 * Le message de la cause quand elle existe — l'erreur `pg` sous une erreur de requête Drizzle, dont
 * le message recopie la requête SQL —, sinon celui de l'erreur ; jamais une pile, jamais vide. Une
 * `ZodError`, d'une entrée invalide ou d'une sortie que son schéma refuse, rend le message lisible de
 * `z.prettifyError`, et non son tableau d'issues en JSON.
 */
function errorMessage(error: unknown): string {
	if (error instanceof z.ZodError) {
		return z.prettifyError(error);
	}
	const source =
		error instanceof Error && error.cause instanceof Error
			? error.cause
			: error;
	const message = source instanceof Error ? source.message : String(source);
	return message || UNNAMED_ERROR;
}
