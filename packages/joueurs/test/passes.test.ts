import { type Executor, excludedPlayers, importPasses, players } from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
import { describe, expect, test } from "vitest";
import {
	type FollowerEntry,
	type PassContext,
	runQuickPass,
	writePage,
} from "../src/index.ts";
import { FakeFollowerProvider } from "./faux-fournisseur.ts";

const T0 = new Date("2026-11-21T10:00:00Z");
const MINUTE_MS = 60_000;

/** L'instant `minutes` minutes après `T0`. */
function after(minutes: number): Date {
	return new Date(T0.getTime() + minutes * MINUTE_MS);
}

/** `count` abonnés bien formés, d'identifiants consécutifs à partir de `first`. */
function followers(count: number, first = 1): FollowerEntry[] {
	return Array.from({ length: count }, (_, index) => {
		const id = String(first + index);
		return { id, username: `joueur_${id}` };
	});
}

/**
 * Un faux fournisseur de `list`, et le contexte d'une passe sur `db` : son horloge part de `T0` et
 * avance d'une minute à chaque page lue.
 */
function passOver(
	db: Executor,
	list: readonly FollowerEntry[],
	pageSize?: number,
): { provider: FakeFollowerProvider; context: PassContext } {
	let now = T0.getTime();
	const provider = new FakeFollowerProvider(list, {
		pageSize,
		onPageRead: () => {
			now += MINUTE_MS;
		},
	});
	return { provider, context: { db, provider, clock: () => new Date(now) } };
}

/** Le journal des passes, dans l'ordre où elles ont commencé. */
function readPasses(db: Executor) {
	return db.select().from(importPasses).orderBy(importPasses.id);
}

describe("passe rapide", () => {
	test("3 pages de 50, 10 nouveaux en tête de liste : 2 pages lues, 10 ajouts, passe terminée au journal", async () => {
		const db = await freshDatabase();
		const list = followers(150);
		await writePage(db, list.slice(10));
		const { provider, context } = passOver(db, list);
		const pass = await runQuickPass(context, "tick");
		expect(provider.cursors).toEqual([null, provider.cursorOf(2)]);
		expect(pass).toEqual({
			id: expect.any(Number),
			kind: "quick",
			trigger: "tick",
			status: "done",
			startedAt: T0,
			finishedAt: after(2),
			pages: 2,
			added: 10,
			invalidIds: 0,
			invalidUsernames: 0,
			error: null,
			cursor: null,
		});
		expect(await readPasses(db)).toEqual([pass]);
		expect(await db.$count(players)).toBe(150);
	});

	test("une page entière de joueurs connus ou exclus arrête la passe rapide", async () => {
		const db = await freshDatabase();
		await writePage(db, followers(1, 10));
		await db.insert(excludedPlayers).values({ instagramId: "11" });
		const { provider, context } = passOver(db, followers(4, 10), 2);
		expect(await runQuickPass(context, "mcp")).toMatchObject({
			trigger: "mcp",
			status: "done",
			pages: 1,
			added: 0,
		});
		expect(provider.cursors).toEqual([null]);
		expect(await db.$count(players)).toBe(1);
	});

	test("la passe rapide s'arrête en fin de liste, même quand sa dernière page ajoute des joueurs", async () => {
		const db = await freshDatabase();
		const { provider, context } = passOver(db, followers(3), 2);
		expect(await runQuickPass(context, "tick")).toMatchObject({
			status: "done",
			pages: 2,
			added: 3,
		});
		expect(provider.cursors).toEqual([null, provider.cursorOf(2)]);
	});
});
