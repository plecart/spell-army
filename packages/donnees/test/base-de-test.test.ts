import { readFileSync } from "node:fs";
import { type SQL, sql } from "drizzle-orm";
import { describe, expect, inject, test, vi } from "vitest";
import { createClient } from "../src/client.ts";
import {
	createMigratedDatabase,
	UNREACHABLE_DATABASE_URL,
} from "./base-de-test.ts";
import setup from "./global-setup.ts";

const CONTAINER_START_TIMEOUT_MS = 120_000;
const MIGRATION_COUNT: number = JSON.parse(
	readFileSync(
		new URL("../migrations/meta/_journal.json", import.meta.url),
		"utf8",
	),
).entries.length;

async function query<Row extends Record<string, unknown>>(
	url: string,
	statement: SQL,
) {
	const client = createClient(url);
	try {
		const { rows } = await client.execute<Row>(statement);
		return rows;
	} finally {
		await client.$client.end();
	}
}

async function selectOne(url: string) {
	const [row] = await query<{ one: number }>(url, sql`select 1 as one`);
	return row?.one;
}

function appliedMigrations(url: string) {
	return query<{ applied: number }>(
		url,
		sql`select count(*)::int as applied from drizzle.__drizzle_migrations`,
	);
}

describe("base de test", () => {
	test("select 1 rend 1 sur la base du conteneur", async () => {
		expect(await selectOne(inject("testDatabaseUrl"))).toBe(1);
	});

	test("le harnais applique toutes les migrations du dossier avant la suite", async () => {
		expect(await appliedMigrations(inject("testDatabaseUrl"))).toEqual([
			{ applied: MIGRATION_COUNT },
		]);
	});

	test(
		"un DATABASE_URL posé dans le shell n'atteint pas les tests",
		async () => {
			vi.stubEnv("DATABASE_URL", UNREACHABLE_DATABASE_URL);
			const provided = new Map<string, string>();
			const stop = await setup({
				provide: (key, value) => provided.set(key, value),
			});
			try {
				expect(await selectOne(provided.get("testDatabaseUrl") ?? "")).toBe(1);
			} finally {
				await stop();
			}
		},
		CONTAINER_START_TIMEOUT_MS,
	);
});

describe("base migrée neuve", () => {
	test("elle a reçu toutes les migrations du dossier", async () => {
		const url = await createMigratedDatabase(inject("testDatabaseUrl"));
		expect(await appliedMigrations(url)).toEqual([
			{ applied: MIGRATION_COUNT },
		]);
	});

	test("deux bases migrées neuves sont indépendantes", async () => {
		const server = inject("testDatabaseUrl");
		const first = await createMigratedDatabase(server);
		const second = await createMigratedDatabase(server);
		await query(first, sql`create table ecrite_dans_la_premiere ()`);
		expect(
			await query(
				second,
				sql`select to_regclass('ecrite_dans_la_premiere') as found`,
			),
		).toEqual([{ found: null }]);
	});
});
