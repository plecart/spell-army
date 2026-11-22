import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";

/**
 * L'erreur que lève une requête Drizzle quand Postgres la refuse sous le code `code` : un
 * `DrizzleQueryError` dont la cause est le `DatabaseError` de `pg`, que lit `postgresErrorCode`. De
 * quoi simuler un refus de la base sans base, à la frontière d'un lecteur injecté.
 */
export function refusedQuery(code: string): DrizzleQueryError {
	const cause = new DatabaseError(`refus simulé ${code}`, 0, "error");
	cause.code = code;
	return new DrizzleQueryError("select", [], cause);
}
