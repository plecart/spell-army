import { auditLog, type Executor } from "donnees";

/** Un appel d'outil à auditer : réussi sans `error`, échoué avec. */
export interface AuditEntry {
	tool: string;
	/** L'entrée brute reçue, avant toute validation. */
	input: unknown;
	error?: string;
	before?: unknown;
	after?: unknown;
}

/** Écrit la ligne d'audit d'un appel d'outil, sur le client ou dans une transaction. */
export async function writeAuditEntry(
	executor: Executor,
	{ tool, input, error, before, after }: AuditEntry,
): Promise<void> {
	await executor.insert(auditLog).values({
		tool,
		input,
		succeeded: error === undefined,
		error,
		before,
		after,
	});
}
