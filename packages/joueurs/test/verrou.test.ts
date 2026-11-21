import { importLock } from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
import { describe, expect, test } from "vitest";
import { acquireImportLock, releaseImportLock } from "../src/index.ts";

// Le bail : 300 s, la durée maximale d'une fonction (ADR 0002, « Verrou à bail »).
const LEASE_MS = 300_000;
const T0 = new Date("2026-11-21T10:00:00Z");

/** L'instant `ms` millisecondes après `T0`. */
function after(ms: number): Date {
	return new Date(T0.getTime() + ms);
}

describe("verrou à bail de l'import", () => {
	test("deux prises simultanées : une seule réussit, pour un bail de 300 s", async () => {
		const db = await freshDatabase();
		const holders = await Promise.all([
			acquireImportLock(db, T0),
			acquireImportLock(db, T0),
		]);
		const taken = holders.filter((holder) => holder !== null);
		expect(taken).toEqual([expect.any(String)]);
		expect(await db.select().from(importLock)).toEqual([
			{ id: 1, holder: taken[0], expiresAt: after(LEASE_MS) },
		]);
	});

	test("un bail qui court n'est pas repris ; échu, au bout de 300 s, il l'est par un porteur neuf", async () => {
		const db = await freshDatabase();
		const first = await acquireImportLock(db, T0);
		expect(await acquireImportLock(db, after(LEASE_MS - 1))).toBeNull();
		const second = await acquireImportLock(db, after(LEASE_MS));
		expect(second).toEqual(expect.any(String));
		expect(second).not.toBe(first);
	});

	test("un verrou rendu par son porteur se reprend aussitôt", async () => {
		const db = await freshDatabase();
		await releaseImportLock(db, (await acquireImportLock(db, T0)) as string);
		expect(await acquireImportLock(db, T0)).toEqual(expect.any(String));
	});

	test("un porteur dont le bail a été repris ne libère pas le verrou de son successeur", async () => {
		const db = await freshDatabase();
		const first = (await acquireImportLock(db, T0)) as string;
		const second = (await acquireImportLock(db, after(LEASE_MS))) as string;
		await releaseImportLock(db, first);
		expect(await acquireImportLock(db, after(LEASE_MS + 1))).toBeNull();
		await releaseImportLock(db, second);
		expect(await acquireImportLock(db, after(LEASE_MS + 1))).toEqual(
			expect.any(String),
		);
	});
});
