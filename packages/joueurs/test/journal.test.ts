import { importPasses } from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
import { describe, expect, test } from "vitest";
import { listPasses } from "../src/index.ts";

const T0 = new Date("2026-11-21T10:00:00Z");
const MINUTE_MS = 60_000;

/** L'instant `minutes` minutes après `T0`. */
function at(minutes: number): Date {
	return new Date(T0.getTime() + minutes * MINUTE_MS);
}

describe("journal des passes", () => {
	test("rend les N dernières passes, la dernière d'abord, chacune sans son curseur", async () => {
		const db = await freshDatabase();
		await db.insert(importPasses).values([
			{
				kind: "quick",
				trigger: "tick",
				status: "done",
				startedAt: at(0),
				finishedAt: at(1),
				pages: 1,
			},
			{
				kind: "full",
				trigger: "self_check",
				status: "failed",
				startedAt: at(10),
				finishedAt: at(14),
				pages: 3,
				added: 7,
				invalidIds: 2,
				invalidUsernames: 1,
				error: "panne injectée à la page 4",
				cursor: "curseur-du-fournisseur",
			},
			{ kind: "quick", trigger: "mcp", status: "running", startedAt: at(20) },
		]);
		expect(await listPasses(db, 2)).toStrictEqual([
			{
				kind: "quick",
				trigger: "mcp",
				status: "running",
				startedAt: at(20),
				finishedAt: null,
				pages: 0,
				added: 0,
				invalidIds: 0,
				invalidUsernames: 0,
				error: null,
			},
			{
				kind: "full",
				trigger: "self_check",
				status: "failed",
				startedAt: at(10),
				finishedAt: at(14),
				pages: 3,
				added: 7,
				invalidIds: 2,
				invalidUsernames: 1,
				error: "panne injectée à la page 4",
			},
		]);
	});
});
