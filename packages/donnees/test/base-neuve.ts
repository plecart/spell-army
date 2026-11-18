import { inject, onTestFinished } from "vitest";
import { createClient } from "../src/client.ts";
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
