import { sql } from "drizzle-orm";
import { expect, inject, onTestFinished, vi } from "vitest";
import { createClient, type Executor } from "../src/client.ts";
import { createMigratedDatabase } from "./base-de-test.ts";

/**
 * Le client d'une base migrée neuve, fermé à la fin du test. Pour les suites dont le `globalSetup`
 * est le harnais de `donnees` (`test/global-setup.ts`).
 */
export async function freshDatabase() {
	const client = createClient(
		await createMigratedDatabase(inject("testDatabaseUrl")),
	);
	onTestFinished(() => client.$client.end());
	return client;
}

/**
 * Fait échouer, par un déclencheur, toute ligne que `event` touche dans `table` et qui remplit
 * `when`, une condition SQL sur `new` ou `old` — toutes sans condition —, sous le code Postgres
 * `code`, P0001 par défaut, au nom de la contrainte `constraint` s'il est donné, et le message
 * « panne injectée ». Rend de quoi retirer la panne.
 */
export async function injectFailure(
	db: Executor,
	{
		event,
		table,
		when,
		code = "P0001",
		constraint,
	}: {
		event: "insert" | "update" | "delete";
		table: string;
		when?: string;
		code?: string;
		constraint?: string;
	},
): Promise<() => Promise<unknown>> {
	const name = `fail_on_${event}_${table}`;
	const constraintClause =
		constraint === undefined ? "" : `, constraint = '${constraint}'`;
	await db.execute(
		sql.raw(`create function ${name}() returns trigger language plpgsql
			as $$ begin raise exception 'panne injectée' using errcode = '${code}'${constraintClause}; end $$`),
	);
	await db.execute(
		sql.raw(`create trigger ${name} before ${event} on ${table} for each row
			${when === undefined ? "" : `when (${when})`} execute function ${name}()`),
	);
	return () => db.execute(sql.raw(`drop trigger ${name} on ${table}`));
}

/** Attend qu'une requête, et une seule, de la base de `db` attende un verrou. */
export async function waitForOneLockWaiter(db: Executor): Promise<void> {
	await vi.waitFor(async () => {
		const { rows } = await db.execute(
			sql`select count(*)::int as waiting from pg_stat_activity
				where datname = current_database() and wait_event_type = 'Lock'`,
		);
		expect(rows).toEqual([{ waiting: 1 }]);
	});
}
