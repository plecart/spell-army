import { auditLog, type Executor } from "donnees";

/** Un appel d'outil à auditer : réussi sans `error`, échoué avec. */
export interface AuditEntry {
	tool: string;
	/** L'entrée reçue, avant toute validation : brute, ou passée par l'`auditInput` de l'outil. */
	input: unknown;
	error?: string;
	before?: unknown;
	after?: unknown;
}

// Ce que le client glisse dans le nom d'outil, l'entrée et donc le message, et que la ligne d'audit
// ne saurait stocker : U+0000, que refusent `text` et `jsonb`, et un surrogate isolé, que refuse
// `jsonb`. `toWellFormed` remplace le second par U+FFFD ; le premier l'est ensuite.
const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);

// Imbrication gardée d'une entrée, au-delà de laquelle un sous-arbre est remplacé. Mesuré le
// 2026-11-17 (Node 24, Postgres 18) : la récursion de JS déborde entre 3 000 et 4 000 niveaux,
// `jsonb` refuse entre 10 000 et 100 000, et le corps de 4 Mio que le SDK admet en porte plus de
// 2 000 000. Les entrées des outils sont plates.
const MAX_DEPTH = 100;
const TRUNCATED = "[imbrication tronquée]";

/** Une chaîne que `text` et `jsonb` admettent. */
function storableText(text: string): string {
	return text.toWellFormed().replaceAll(NUL, REPLACEMENT);
}

/**
 * Une valeur JSON que `jsonb` admet : chaque chaîne, clés comprises, rendue stockable, et ce qui
 * dépasse `MAX_DEPTH` remplacé par `TRUNCATED`.
 *
 * Limite : deux clés distinctes d'un même objet qui ne diffèrent que par ce que `storableText`
 * remplace deviennent la même clé, et la dernière écrase l'autre dans la ligne. L'une des deux porte
 * U+0000 ou un surrogate isolé, qu'aucun nom de champ d'outil ne porte : le schéma strict refuse
 * de toute façon l'appel.
 */
function storableJson(value: unknown, depth = 0): unknown {
	if (typeof value === "string") {
		return storableText(value);
	}
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (depth === MAX_DEPTH) {
		return TRUNCATED;
	}
	if (Array.isArray(value)) {
		return value.map((item) => storableJson(item, depth + 1));
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			storableText(key),
			storableJson(item, depth + 1),
		]),
	);
}

/** Écrit la ligne d'audit d'un appel d'outil, sur le client ou dans une transaction. */
export async function writeAuditEntry(
	executor: Executor,
	{ tool, input, error, before, after }: AuditEntry,
): Promise<void> {
	await executor.insert(auditLog).values({
		tool: storableText(tool),
		input: storableJson(input),
		succeeded: error === undefined,
		error: error === undefined ? undefined : storableText(error),
		before,
		after,
	});
}
