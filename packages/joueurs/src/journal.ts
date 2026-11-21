import { type Executor, importPasses } from "donnees";
import { desc } from "drizzle-orm";
import type { ImportPass } from "./passes.ts";

/**
 * Une passe telle que le journal la rend (ADR 0003, « Journal ») : type, déclencheur, état, début,
 * fin, pages, ajouts, écartés par motif et erreur. Jamais son curseur, texte opaque reçu du
 * fournisseur, que le MCP renverrait à Claude (ADR 0003, « Pseudos, données non fiables ») ; ni son
 * identifiant, propre à la base.
 */
export type PassLogEntry = Omit<ImportPass, "id" | "cursor">;

/**
 * Lit le journal des passes : les `limit` dernières ouvertes, la dernière d'abord.
 *
 * @param executor le client.
 * @param limit le nombre de passes au plus, que l'appelant borne.
 */
export async function listPasses(
	executor: Executor,
	limit: number,
): Promise<PassLogEntry[]> {
	const passes = await executor
		.select()
		.from(importPasses)
		.orderBy(desc(importPasses.id))
		.limit(limit);
	return passes.map(logEntry);
}

/** La passe telle que le journal la rend : sans son identifiant ni son curseur. */
export function logEntry({ id, cursor, ...entry }: ImportPass): PassLogEntry {
	return entry;
}
