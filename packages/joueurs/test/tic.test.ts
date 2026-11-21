import {
	type Executor,
	type FullPassTrigger,
	importPasses,
	players,
} from "donnees";
import { freshDatabase, injectFailure } from "donnees/test/base-neuve";
import { describe, expect, test } from "vitest";
import {
	acquireImportLock,
	type FollowerEntry,
	type ImportOptions,
	listPasses,
	relaunchPass,
	runTick,
	writePage,
} from "../src/index.ts";
import {
	type FakeFollowerProvider,
	followers,
	heldProvider,
	pacedProvider,
} from "./faux-fournisseur.ts";
import { after, DAY_MS, HOUR_MS, LEASE_MS, T0 } from "./horloge.ts";

/**
 * Un tic sur `db` et un faux fournisseur de `list`, en pages de `pageSize` : son horloge part de
 * `start` et avance de `pageMs` à chaque page lue, sous le budget du tic.
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
	const { provider, clock } = pacedProvider(list, { pageSize, start, pageMs });
	return { provider, options: { db, provider, clock } };
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
		const report = await runTick(options);
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
			const report = await runTick(options);
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
		expect((await runTick(options))?.passes).toMatchObject([
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
		// et 160 s ; sa page 3 commencerait à 240 s, l'échéance du budget.
		const first = tickOver(db, list, { pageSize: 2, pageMs: 80_000 });
		expect(await runTick(first.options)).toMatchObject({
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
		expect((await runTick(next.options))?.passes).toMatchObject([
			{ kind: "full", status: "done", pages: 5 },
			{ kind: "quick", status: "done" },
		]);
		expect(next.provider.cursors[0]).toBe(next.provider.cursorOf(3));
	});

	test("une complète reprise s'arrête 60 s avant l'échéance du tic : la passe rapide qui la suit lit sa première page", async () => {
		const db = await freshDatabase();
		const list = followers(40);
		await writePage(db, list);
		// 25 s par page lue : la reprise lit ses pages 3 à 10 à 0 s, 25 s… 175 s ; sa page 11
		// commencerait à 200 s, au-delà de son échéance de 180 s. La passe rapide lit alors sa page à
		// 200 s, avant les 240 s du budget.
		const { provider, options } = tickOver(db, list, {
			pageSize: 2,
			pageMs: 25_000,
		});
		await db.insert(importPasses).values({
			kind: "full",
			trigger: "weekly",
			status: "interrupted",
			startedAt: after(-HOUR_MS),
			finishedAt: after(-HOUR_MS),
			pages: 2,
			cursor: provider.cursorOf(3),
		});
		expect((await runTick(options))?.passes).toMatchObject([
			{
				kind: "full",
				status: "interrupted",
				finishedAt: after(200_000),
				pages: 10,
			},
			{ kind: "quick", status: "done", pages: 1 },
		]);
		expect(provider.cursors.at(-1)).toBe(provider.cursorOf(1));
	});

	test("une complète partie sans budget s'ouvre et s'arrête interrompue à 0 page ; le tic suivant la reprend du haut de la liste", async () => {
		const db = await freshDatabase();
		const list = followers(4);
		await writePage(db, list);
		// La page de la passe rapide consomme les 240 s du budget.
		const first = tickOver(db, list, { pageSize: 2, pageMs: 240_000 });
		expect((await runTick(first.options))?.passes).toMatchObject([
			{ kind: "quick", status: "done" },
			{ kind: "full", status: "interrupted", pages: 0, error: null },
		]);
		const next = tickOver(db, list, { pageSize: 2, start: after(HOUR_MS) });
		expect((await runTick(next.options))?.passes).toMatchObject([
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
			const report = await runTick(options);
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
			const report = await runTick(options);
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

	test("auto-contrôle : autant de joueurs que d'abonnés affichés, aucune complète ne part, le nombre lu une fois", async () => {
		const db = await freshDatabase();
		const list = followers(100);
		await writePage(db, list);
		await finishedFullPass(db, after(-HOUR_MS));
		const { provider, options } = tickOver(db, list);
		provider.followerCount = 100;
		const report = await runTick(options);
		expect(report?.passes.map(({ kind }) => kind)).toEqual(["quick"]);
		expect(provider.followerCountReads).toBe(1);
	});

	test("une lecture du nombre d'abonnés qui échoue : compte rendu en échec, l'erreur composée par le code, aucune complète partie ni ligne au journal pour elle", async () => {
		const db = await freshDatabase();
		const list = followers(3);
		await writePage(db, list);
		await finishedFullPass(db, after(-DAY_MS));
		const { provider, options } = tickOver(db, list);
		provider.failingFollowerCount = true;
		expect(await runTick(options)).toMatchObject({
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
		expect(await runTick(first.options)).toMatchObject({
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
		expect(await runTick(next.options)).toMatchObject({
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
		const held = heldProvider(followers(3));
		const first = runTick({ db, provider: held.provider, clock: () => T0 });
		await held.reading;
		const second = tickOver(db, followers(3));
		expect(await runTick(second.options)).toBeNull();
		expect(second.provider.cursors).toEqual([]);
		held.release();
		const report = await first;
		expect(await listPasses(db, 10)).toEqual(report?.passes.toReversed());
		expect(await runTick(tickOver(db, followers(3)).options)).not.toBeNull();
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
		const tickAt = (start: Date) =>
			runTick(tickOver(db, [], { start }).options);
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
		const repair = await injectFailure(db, {
			event: "insert",
			table: "import_passes",
		});
		await expect(runTick(tickOver(db, []).options)).rejects.toMatchObject({
			cause: { code: "P0001" },
		});
		await repair();
		expect(await runTick(tickOver(db, []).options)).not.toBeNull();
	});

	test.each([
		["après une passe en erreur : l'erreur de la passe remonte", true, "P0001"],
		["après un tic réussi : son erreur remonte", false, "P0004"],
	])("un rendu du verrou qui échoue %s", async (_, failingPass, code) => {
		const db = await freshDatabase();
		if (failingPass) {
			await injectFailure(db, { event: "insert", table: "import_passes" });
		}
		await injectFailure(db, {
			event: "delete",
			table: "import_lock",
			code: "P0004",
		});
		await expect(runTick(tickOver(db, []).options)).rejects.toMatchObject({
			cause: { code },
		});
	});
});

describe("relance d'une passe", () => {
	test("rapide : une passe rapide part, sous le déclencheur du MCP", async () => {
		const db = await freshDatabase();
		const { options } = tickOver(db, followers(3));
		expect(await relaunchPass(options, "quick")).toMatchObject({
			kind: "quick",
			trigger: "mcp",
			status: "done",
			added: 3,
		});
		expect(await db.$count(importPasses)).toBe(1);
	});

	test("complète : sans complète non terminée, une part sous le déclencheur du MCP ; interrompue par le budget après sa page 2 sur 5, la relance suivante la reprend à la page 3, sans rendre son curseur", async () => {
		const db = await freshDatabase();
		const list = followers(10);
		// 120 s par page lue : la page 3 commencerait à 240 s, l'échéance du budget.
		const first = tickOver(db, list, { pageSize: 2, pageMs: 120_000 });
		const interrupted = await relaunchPass(first.options, "full");
		expect(interrupted).toMatchObject({
			kind: "full",
			trigger: "mcp",
			status: "interrupted",
			pages: 2,
		});
		expect(interrupted).not.toHaveProperty("cursor");
		const next = tickOver(db, list, { pageSize: 2, start: after(HOUR_MS) });
		expect(await relaunchPass(next.options, "full")).toMatchObject({
			kind: "full",
			trigger: "mcp",
			status: "done",
			pages: 5,
			added: 10,
		});
		expect(next.provider.cursors).toEqual(
			[3, 4, 5].map((page) => next.provider.cursorOf(page)),
		);
		expect(await db.$count(importPasses)).toBe(1);
	});

	test.each([
		["rapide", "quick"],
		["complète", "full"],
	] as const)(
		"verrou pris : la relance %s rend « passe en cours » sans attendre, sans rien lire ni rien ajouter au journal",
		async (_, kind) => {
			const db = await freshDatabase();
			await acquireImportLock(db, T0);
			const { provider, options } = tickOver(db, followers(3));
			expect(await relaunchPass(options, kind)).toBeNull();
			expect(provider.cursors).toEqual([]);
			expect(await db.$count(importPasses)).toBe(0);
		},
	);
});
