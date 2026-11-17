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

// Ni `text` ni `jsonb` n'admettent U+0000, que le client peut glisser dans le nom d'outil, l'entrée
// et donc le message : remplacé par U+FFFD, il n'empêche plus la ligne d'audit de s'écrire.
const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);

function withoutNul(text: string): string {
	return text.replaceAll(NUL, REPLACEMENT);
}

/** Une valeur JSON dont chaque chaîne, clés comprises, a perdu ses U+0000. */
function jsonWithoutNul(value: unknown): unknown {
	if (typeof value === "string") {
		return withoutNul(value);
	}
	if (Array.isArray(value)) {
		return value.map(jsonWithoutNul);
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				withoutNul(key),
				jsonWithoutNul(item),
			]),
		);
	}
	return value;
}

/** Écrit la ligne d'audit d'un appel d'outil, sur le client ou dans une transaction. */
export async function writeAuditEntry(
	executor: Executor,
	{ tool, input, error, before, after }: AuditEntry,
): Promise<void> {
	await executor.insert(auditLog).values({
		tool: withoutNul(tool),
		input: jsonWithoutNul(input),
		succeeded: error === undefined,
		error: error === undefined ? undefined : withoutNul(error),
		before,
		after,
	});
}
