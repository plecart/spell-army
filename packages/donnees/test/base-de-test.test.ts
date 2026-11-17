import { readFileSync } from "node:fs";
import { type SQL, sql } from "drizzle-orm";
import { describe, expect, inject, test, vi } from "vitest";
import { createClient } from "../src/client.ts";
import setup from "./global-setup.ts";

// Port 9 (discard) : aucune base n'y répond, un test qui la joindrait échouerait.
const FOREIGN_DATABASE_URL = "postgres://piege:piege@127.0.0.1:9/piege";
const CONTAINER_START_TIMEOUT_MS = 120_000;

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

describe("base de test", () => {
	test("select 1 rend 1 sur la base du conteneur", async () => {
		expect(await selectOne(inject("testDatabaseUrl"))).toBe(1);
	});

	test("le harnais applique toutes les migrations du dossier avant la suite", async () => {
		const journal = JSON.parse(
			readFileSync(
				new URL("../migrations/meta/_journal.json", import.meta.url),
				"utf8",
			),
		);
		const rows = await query<{ applied: number }>(
			inject("testDatabaseUrl"),
			sql`select count(*)::int as applied from drizzle.__drizzle_migrations`,
		);
		expect(rows).toEqual([{ applied: journal.entries.length }]);
	});

	test(
		"un DATABASE_URL posé dans le shell n'atteint pas les tests",
		async () => {
			vi.stubEnv("DATABASE_URL", FOREIGN_DATABASE_URL);
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
