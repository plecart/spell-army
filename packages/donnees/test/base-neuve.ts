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
