import {
	type Executor,
	type FullPassTrigger,
	importPasses,
	players,
} from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import {
	acquireImportLock,
	type FollowerEntry,
	type ImportOptions,
	listPasses,
	runTic,
	writePage,
} from "../src/index.ts";
import { FakeFollowerProvider, followers } from "./faux-fournisseur.ts";

const T0 = new Date("2026-11-21T10:00:00Z");
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
// Le bail du verrou : 300 s (ADR 0002, « Verrou à bail »).
const LEASE_MS = 300_000;

/** L'instant `ms` millisecondes après `T0`. */
function after(ms: number): Date {
	return new Date(T0.getTime() + ms);
}

/**
 * Un tic sur `db` et un faux fournisseur de `list`, en pages de `pageSize` : son horloge part de
 * `start` et avance de `pageMs` à chaque page lue, sous le budget par défaut.
 */
function tickOver(
	db: Executor,
	list: readonly FollowerEntry[],
	{
		pageSize,
		start = T0,
		pageMs = 0,
	}: { pageSize?: number; start?: Date; pageMs?: number } = {},
): { provider: FakeFollowerProvider; options: ImportOptions } {
	let now = start.getTime();
	const provider = new FakeFollowerProvider(list, {
		pageSize,
		onPageRead: () => {
			now += pageMs;
		},
	});
	return { provider, options: { db, provider, clock: () => new Date(now) } };
}

/** Inscrit au journal une passe complète terminée, partie à `startedAt`. */
async function finishedFullPass(
	db: Executor,
	startedAt: Date,
	trigger: FullPassTrigger = "weekly",
): Promise<void> {
	await db.insert(importPasses).values({
		kind: "full",
		trigger,
		status: "done",
		startedAt,
		finishedAt: startedAt,
	});
}

describe("tic de l'import", () => {
	test("sur une base vide, le premier tic fait la passe rapide, puis part en complète de la semaine sans lire le nombre d'abonnés ; son compte rendu est le journal", async () => {
		const db = await freshDatabase();
		const { provider, options } = tickOver(db, followers(3));
		const report = await runTic(options);
		expect(report).toMatchObject({
			passes: [
				{ kind: "quick", trigger: "tick", status: "done", added: 3 },
				{ kind: "full", trigger: "weekly", status: "done", added: 0 },
			],
			followerCountError: null,
			failed: false,
		});
		expect(provider.followerCountReads).toBe(0);
		expect(await listPasses(db, 10)).toEqual(report?.passes.toReversed());
	});

	test.each([
		[
			"de la semaine, commencée il y a 7 jours tout juste : aucune ne part",
			"weekly",
			0,
			["tick"],
		],
		[
			"de la semaine, commencée il y a 7 jours et 1 ms : une part",
			"weekly",
			1,
			["tick", "weekly"],
		],
		[
			"du MCP, commencée il y a 7 jours tout juste : aucune ne part",
			"mcp",
			0,
			["tick"],
		],
	] as const)(
		"la dernière complète est %s",
		async (_, trigger, extraMs, triggers) => {
			const db = await freshDatabase();
			const list = followers(3);
			await writePage(db, list);
			await finishedFullPass(db, after(-7 * DAY_MS - extraMs), trigger);
			const { options } = tickOver(db, list);
			const report = await runTic(options);
			expect(report?.passes.map((pass) => pass.trigger)).toEqual(triggers);
		},
	);

	test("une complète interrompue après sa page 2 sur 5 : au tic suivant, elle lit les pages 3 à 5 seulement, puis la passe rapide lit sa première page", async () => {
		const db = await freshDatabase();
		const list = followers(10);
		await writePage(db, list.slice(0, 4));
		const { provider, options } = tickOver(db, list, { pageSize: 2 });
		await db.insert(importPasses).values({
			kind: "full",
			trigger: "weekly",
			status: "interrupted",
			startedAt: after(-HOUR_MS),
			finishedAt: after(-HOUR_MS),
			pages: 2,
			added: 4,
			cursor: provider.cursorOf(3),
		});
		expect((await runTic(options))?.passes).toMatchObject([
			{ kind: "full", status: "done", pages: 5, added: 10 },
			{ kind: "quick", status: "done", pages: 1, added: 0 },
		]);
		expect(provider.cursors).toEqual(
			[3, 4, 5, 1].map((page) => provider.cursorOf(page)),
		);
	});

	test("une complète que le budget de 240 s épuise après sa page 2 sur 5 : notée interrompue, sans erreur ; le tic suivant la reprend à la page 3", async () => {
		const db = await freshDatabase();
		const list = followers(10);
		await writePage(db, list);
		// 80 s par page lue : la passe rapide lit sa page à 0 s, la complète ses pages 1 et 2 à 80 s
		// et 160 s ; sa page 3 commencerait à 240 s, l'échéance du budget par défaut.
		const first = tickOver(db, list, { pageSize: 2, pageMs: 80_000 });
		expect(await runTic(first.options)).toMatchObject({
			passes: [
				{ kind: "quick", status: "done" },
				{
					kind: "full",
					status: "interrupted",
					finishedAt: after(240_000),
					pages: 2,
					error: null,
				},
			],
			failed: false,
		});
		const next = tickOver(db, list, { pageSize: 2, start: after(HOUR_MS) });
		expect((await runTic(next.options))?.passes).toMatchObject([
			{ kind: "full", status: "done", pages: 5 },
			{ kind: "quick", status: "done" },
		]);
		expect(next.provider.cursors[0]).toBe(next.provider.cursorOf(3));
	});

	test("une complète partie sans budget s'ouvre et s'arrête interrompue à 0 page ; le tic suivant la reprend du haut de la liste", async () => {
		const db = await freshDatabase();
		const list = followers(4);
		await writePage(db, list);
		// La page de la passe rapide consomme les 240 s du budget.
		const first = tickOver(db, list, { pageSize: 2, pageMs: 240_000 });
		expect((await runTic(first.options))?.passes).toMatchObject([
			{ kind: "quick", status: "done" },
			{ kind: "full", status: "interrupted", pages: 0, error: null },
		]);
		const next = tickOver(db, list, { pageSize: 2, start: after(HOUR_MS) });
		expect((await runTic(next.options))?.passes).toMatchObject([
			{ kind: "full", status: "done", pages: 2 },
			{ kind: "quick", status: "done" },
		]);
		expect(next.provider.cursors).toEqual(
			[1, 2, 1].map((page) => next.provider.cursorOf(page)),
		);
	});

	test.each([
		[
			"se termine : la complète de la semaine part ensuite",
			null,
			["full done", "quick done", "full done"],
		],
		[
			"échoue : aucune autre complète ne part",
			3,
			["full failed", "quick done"],
		],
	])(
		"une complète commencée il y a 8 jours, reprise, qui %s",
		async (_, failingPage, passes) => {
			const db = await freshDatabase();
			const list = followers(10);
			await writePage(db, list);
			const { provider, options } = tickOver(db, list, { pageSize: 2 });
			provider.failingPage = failingPage;
			await db.insert(importPasses).values({
				kind: "full",
				trigger: "weekly",
				status: "interrupted",
				startedAt: after(-8 * DAY_MS),
				finishedAt: after(-8 * DAY_MS),
				cursor: provider.cursorOf(3),
			});
			const report = await runTic(options);
			expect(
				report?.passes.map(({ kind, status }) => `${kind} ${status}`),
			).toEqual(passes);
			expect(await db.$count(importPasses)).toBe(passes.length);
			expect(provider.followerCountReads).toBe(0);
		},
	);

	test("auto-contrôle : 100 abonnés affichés pour 90 joueurs, une complète part ; un second tic dans les 24 h n'en relance pas et ne lit pas le nombre d'abonnés ; au bout de 24 h, elle repart", async () => {
		const db = await freshDatabase();
		const list = followers(90);
		await writePage(db, list);
		// La complète de la semaine a commencé il y a une heure : la semaine n'en fait partir aucune, et
		// seule une complète d'auto-contrôle retient l'auto-contrôle.
		await finishedFullPass(db, after(-HOUR_MS));
		const tickAt = async (start: Date) => {
			const { provider, options } = tickOver(db, list, { start });
			provider.followerCount = 100;
			const report = await runTic(options);
			return {
				reads: provider.followerCountReads,
				started: report?.passes
					.filter(({ kind }) => kind === "full")
					.map(({ trigger }) => trigger),
			};
		};
		expect(await tickAt(T0)).toEqual({ reads: 1, started: ["self_check"] });
		expect(await tickAt(after(DAY_MS - 1))).toEqual({ reads: 0, started: [] });
		expect(await tickAt(after(DAY_MS))).toEqual({
			reads: 1,
			started: ["self_check"],
		});
	});

	test("une lecture du nombre d'abonnés qui échoue : compte rendu en échec, l'erreur composée par le code, aucune complète partie ni ligne au journal pour elle", async () => {
		const db = await freshDatabase();
		const list = followers(3);
		await writePage(db, list);
		await finishedFullPass(db, after(-DAY_MS));
		const { provider, options } = tickOver(db, list);
		provider.failingFollowerCount = true;
		expect(await runTic(options)).toMatchObject({
			passes: [{ kind: "quick", status: "done" }],
			followerCountError: "panne injectée au nombre d'abonnés",
			failed: true,
		});
		expect(provider.followerCountReads).toBe(1);
		expect(await db.$count(importPasses)).toBe(2);
	});

	test("échec du fournisseur à la page 3 d'une complète : rien n'est supprimé, l'erreur est au journal, le compte rendu en échec ; le tic suivant reprend au curseur", async () => {
		const db = await freshDatabase();
		const list = followers(10);
		await writePage(db, list.slice(0, 2));
		const first = tickOver(db, list, { pageSize: 2 });
		first.provider.failingPage = 3;
		expect(await runTic(first.options)).toMatchObject({
			passes: [
				{ kind: "quick", status: "done", added: 0 },
				{
					kind: "full",
					status: "failed",
					pages: 2,
					added: 2,
					error: "panne injectée à la page 3",
				},
			],
			followerCountError: null,
			failed: true,
		});
		expect(await db.$count(players)).toBe(4);

		const next = tickOver(db, list, { pageSize: 2, start: after(HOUR_MS) });
		expect(await runTic(next.options)).toMatchObject({
			passes: [
				{ kind: "full", status: "done", error: null, pages: 5, added: 8 },
				{ kind: "quick", status: "done" },
			],
			failed: false,
		});
		expect(next.provider.cursors[0]).toBe(next.provider.cursorOf(3));
		expect(await db.$count(players)).toBe(10);
	});
});

describe("verrou du tic", () => {
	test("deux tics en même temps : le second, le premier retenu dans une lecture de page, rend « occupé » sans rien lire ni journaliser ; le premier fini, un troisième passe", async () => {
		const db = await freshDatabase();
		const reading = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const held = new FakeFollowerProvider(followers(3), {
			onPageRead: () => {
				reading.resolve();
				return release.promise;
			},
		});
		const first = runTic({ db, provider: held, clock: () => T0 });
		await reading.promise;
		const second = tickOver(db, followers(3));
		expect(await runTic(second.options)).toBeNull();
		expect(second.provider.cursors).toEqual([]);
		release.resolve();
		const report = await first;
		expect(await listPasses(db, 10)).toEqual(report?.passes.toReversed());
		expect(await runTic(tickOver(db, followers(3)).options)).not.toBeNull();
	});

	test("un tic tué pendant sa passe rapide : son verrou se reprend au bout des 300 s du bail, et le tic qui le reprend note la passe interrompue", async () => {
		const db = await freshDatabase();
		await acquireImportLock(db, T0);
		await db.insert(importPasses).values({
			kind: "quick",
			trigger: "tick",
			status: "running",
			startedAt: T0,
		});
		const tickAt = (start: Date) => runTic(tickOver(db, [], { start }).options);
		expect(await tickAt(after(LEASE_MS - 1))).toBeNull();
		expect(await tickAt(after(LEASE_MS))).not.toBeNull();
		expect((await listPasses(db, 10)).at(-1)).toMatchObject({
			kind: "quick",
			status: "interrupted",
			finishedAt: after(LEASE_MS),
		});
	});

	test("une erreur de la base remonte du tic, et le verrou est rendu", async () => {
		const db = await freshDatabase();
		await db.execute(
			sql.raw(`create function fail_on_pass() returns trigger language plpgsql
				as $$ begin raise exception 'panne injectée'; end $$`),
		);
		await db.execute(
			sql.raw(`create trigger fail_on_pass before insert on import_passes
				for each row execute function fail_on_pass()`),
		);
		await expect(runTic(tickOver(db, []).options)).rejects.toMatchObject({
			cause: { code: "P0001" },
		});
		await db.execute(sql.raw("drop trigger fail_on_pass on import_passes"));
		expect(await runTic(tickOver(db, []).options)).not.toBeNull();
	});
});
