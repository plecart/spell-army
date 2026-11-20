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
	run(executor: Executor, input: z.output<Input>): Promise<ToolOutcome>;
	/**
	 * L'entrée telle que l'audit la garde, quand elle ne doit pas l'être brute : appliquée à l'entrée
	 * brute avant chaque ligne d'audit de l'outil, entrée refusée comprise. Elle ne doit pas lever.
	 */
	auditInput?(input: Record<string, unknown>): unknown;
}

/** Message d'un appel refusé sans message propre : une ligne d'audit en erreur en porte toujours un. */
const UNNAMED_ERROR = "Erreur sans message";

/**
 * Message rendu quand la ligne en erreur ne s'écrit pas, à la place de l'erreur de Drizzle, qui
 * recopie la requête et l'entrée.
 */
const AUDIT_FAILED = "Audit impossible : l'appel n'a pas été enregistré.";

/**
 * `tools/list` : chaque outil, avec les schémas JSON tirés de ses schémas Zod. Celui d'un
 * `ZodObject` est un schéma `object`, que le type de Zod ne sait pas dire en valeurs JSON : d'où la
 * conversion.
 */
export function listTools(tools: readonly McpTool[]): Tool[] {
	return tools.map(
		({ name, title, description, annotations, input, output }) => ({
			name,
			title,
			description,
			annotations,
			inputSchema: z.toJSONSchema(input) as Tool["inputSchema"],
			outputSchema: z.toJSONSchema(output) as Tool["outputSchema"],
		}),
	);
}

/**
 * `tools/call` : valide l'entrée, exécute l'outil et écrit exactement une ligne d'audit.
 *
 * - Outil inconnu : ligne en erreur, puis erreur de protocole `InvalidParams`, comme `McpServer`.
 * - Entrée invalide : ligne en erreur, outil jamais appelé, résultat `isError`.
 * - Entrée valide : l'outil, sa ligne en succès et la validation de sa sortie par son schéma dans
 *   une même transaction. Le résultat porte la sortie validée en `structuredContent` et la répète en
 *   texte JSON, comme la spécification le demande. Si l'une des trois étapes échoue, la transaction
 *   s'annule, la ligne en erreur s'écrit hors d'elle et le résultat est `isError`, sans
 *   `structuredContent`.
 *
 * L'entrée auditée est l'entrée brute, `{}` quand `args` manque, passée par l'`auditInput` de l'outil
 * quand il en a un. Si la ligne en erreur ne peut pas s'écrire, une erreur de protocole
 * `InternalError` au message court remonte : rien n'a été validé.
 *
 * Limite : une requête que le SDK refuse comme malformée n'atteint pas cette fonction, et n'a donc
 * ni exécution ni ligne d'audit. Ainsi d'`arguments` qui n'est pas un objet : le SDK 2.4.0 répond
 * l'erreur `-32602` « Invalid tools/call request ».
 */
export async function callTool(
	tools: readonly McpTool[],
	executor: Executor,
	name: string,
	args: Record<string, unknown> | undefined,
): Promise<CallToolResult> {
	const input = args ?? {};
	const tool = tools.find((candidate) => candidate.name === name);
	if (!tool) {
		const message = `Tool ${name} not found`;
		await auditError(executor, name, input, message);
		throw new ProtocolError(ProtocolErrorCode.InvalidParams, message);
	}
	const audited = tool.auditInput ? tool.auditInput(input) : input;
	const parsed = tool.input.safeParse(input);
	if (!parsed.success) {
		return refuse(executor, name, audited, errorMessage(parsed.error));
	}
	try {
		const validated = await executor.transaction(async (tx) => {
			const { output, before, after } = await tool.run(tx, parsed.data);
			await writeAuditEntry(tx, { tool: name, input: audited, before, after });
			return tool.output.parse(output);
		});
		return {
			content: [{ type: "text", text: JSON.stringify(validated) }],
			structuredContent: validated,
		};
	} catch (error) {
		return refuse(executor, name, audited, errorMessage(error));
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
