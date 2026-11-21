import {
	type Executor,
	excludedPlayers,
	importPasses,
	players,
	spells,
} from "donnees";
import { freshDatabase, injectFailure } from "donnees/test/base-neuve";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import {
	closeStalePasses,
	type FollowerEntry,
	type FollowerProvider,
	type PassContext,
	resumeFullPass,
	runQuickPass,
	startFullPass,
	writePage,
} from "../src/index.ts";
import {
	type FakeFollowerProvider,
	followers,
	pacedProvider,
	UNTRUSTED_PAGE,
} from "./faux-fournisseur.ts";
import { after, HOUR_MS, MINUTE_MS, T0 } from "./horloge.ts";

/**
 * Un faux fournisseur de `list`, en pages de `pageSize`, et le contexte d'une passe sur `db` : son
 * horloge part de `start` et avance d'une minute à chaque page lue ; son budget court jusqu'à
 * `deadline`, une heure après `start` par défaut.
 */
function passOver(
	db: Executor,
	list: readonly FollowerEntry[],
	{
		pageSize,
		start = T0,
		deadline = after(HOUR_MS, start),
	}: { pageSize?: number; start?: Date; deadline?: Date } = {},
): { provider: FakeFollowerProvider; context: PassContext } {
	const { provider, clock } = pacedProvider(list, {
		pageSize,
		start,
		pageMs: MINUTE_MS,
	});
	return { provider, context: { db, provider, clock, deadline } };
}

/** Le journal des passes, dans l'ordre où elles ont commencé. */
function readPasses(db: Executor) {
	return db.select().from(importPasses).orderBy(importPasses.id);
}

/**
 * Vérifie que la ligne du journal, toutes colonnes lues en texte, ne porte aucune valeur reçue de
 * `page`. Les identifiants d'un ou deux chiffres restent de côté : un compteur peut les valoir.
 */
async function expectNoReceivedValue(
	db: Executor,
	page: readonly FollowerEntry[],
): Promise<void> {
	const { rows } = await db.execute<{ pass: string }>(
		sql`select p::text as pass from import_passes p`,
	);
	expect(rows).toHaveLength(1);
	const received = page
		.flatMap(({ id, username }) => [id, username])
		.filter((value) => !/^[0-9]{1,2}$/.test(value));
	for (const value of received) {
		expect(rows[0]?.pass).not.toContain(value);
	}
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
			finishedAt: after(2 * MINUTE_MS),
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
		const { provider, context } = passOver(db, followers(4, 10), {
			pageSize: 2,
		});
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
		const { provider, context } = passOver(db, followers(3), { pageSize: 2 });
		expect(await runQuickPass(context, "tick")).toMatchObject({
			status: "done",
			pages: 2,
			added: 3,
		});
		expect(provider.cursors).toEqual([null, provider.cursorOf(2)]);
	});
});

describe("passe complète", () => {
	test("interrompue par le budget après la page 2 sur 5 : notée interrompue, sans erreur, à son curseur ; la reprise lit les pages 3 à 5 seulement et la termine, sur la même ligne du journal", async () => {
		const db = await freshDatabase();
		const list = followers(10);
		const first = passOver(db, list, {
			pageSize: 2,
			deadline: after(2 * MINUTE_MS),
		});
		const interrupted = await startFullPass(first.context, "weekly");
		expect(first.provider.cursors).toEqual([null, first.provider.cursorOf(2)]);
		expect(interrupted).toEqual({
			id: expect.any(Number),
			kind: "full",
			trigger: "weekly",
			status: "interrupted",
			startedAt: T0,
			finishedAt: after(2 * MINUTE_MS),
			pages: 2,
			added: 4,
			invalidIds: 0,
			invalidUsernames: 0,
			error: null,
			cursor: first.provider.cursorOf(3),
		});

		const next = passOver(db, list, { pageSize: 2, start: after(HOUR_MS) });
		const done = await resumeFullPass(next.context);
		expect(next.provider.cursors).toEqual(
			[3, 4, 5].map((page) => next.provider.cursorOf(page)),
		);
		expect(done).toEqual({
			...interrupted,
			status: "done",
			finishedAt: after(HOUR_MS + 3 * MINUTE_MS),
			pages: 5,
			added: 10,
			cursor: null,
		});
		expect(await readPasses(db)).toEqual([done]);
		expect(await db.$count(players)).toBe(10);
	});

	test("une complète restée en cours, sa fonction tuée, reprend à son curseur sous son déclencheur d'origine", async () => {
		const db = await freshDatabase();
		const { provider, context } = passOver(db, followers(10), { pageSize: 2 });
		await db.insert(importPasses).values({
			kind: "full",
			trigger: "self_check",
			status: "running",
			startedAt: T0,
			cursor: provider.cursorOf(4),
		});
		expect(await resumeFullPass(context)).toMatchObject({
			trigger: "self_check",
			status: "done",
			pages: 2,
			added: 4,
		});
		expect(provider.cursors).toEqual([
			provider.cursorOf(4),
			provider.cursorOf(5),
		]);
	});

	test("sans complète à reprendre — une terminée, une rapide en cours —, la reprise ne lit rien et rend null", async () => {
		const db = await freshDatabase();
		const { provider, context } = passOver(db, followers(1));
		await db.insert(importPasses).values([
			{
				kind: "full",
				trigger: "weekly",
				status: "done",
				startedAt: T0,
				finishedAt: T0,
			},
			{ kind: "quick", trigger: "tick", status: "running", startedAt: T0 },
		]);
		expect(await resumeFullPass(context)).toBeNull();
		expect(provider.cursors).toEqual([]);
	});

	test("une complète ne démarre pas tant qu'une autre n'est pas terminée", async () => {
		const db = await freshDatabase();
		const { context } = passOver(db, followers(1), { deadline: T0 });
		await startFullPass(context, "weekly");
		await expect(startFullPass(context, "mcp")).rejects.toMatchObject({
			cause: { code: "23505", constraint: "import_passes_one_unfinished_full" },
		});
		expect(await db.$count(importPasses)).toBe(1);
	});

	test("données non fiables : le journal compte les écartées par motif, et aucune colonne de sa ligne ne porte une valeur reçue", async () => {
		const db = await freshDatabase();
		// Une complète : son curseur est la colonne de texte qu'une page écrit.
		const { context } = passOver(db, UNTRUSTED_PAGE);
		expect(await startFullPass(context, "mcp")).toMatchObject({
			status: "done",
			added: 1,
			invalidIds: 3,
			invalidUsernames: 2,
		});
		await expectNoReceivedValue(db, UNTRUSTED_PAGE);
	});
});

describe("passes restées en cours", () => {
	test("closeStalePasses interrompt toute passe restée en cours, à l'instant donné, et ne touche pas les autres", async () => {
		const db = await freshDatabase();
		const running = { status: "running", startedAt: T0 } as const;
		const done = {
			kind: "quick",
			trigger: "tick",
			status: "done",
			startedAt: T0,
			finishedAt: T0,
		} as const;
		await db
			.insert(importPasses)
			.values([
				{ kind: "quick", trigger: "tick", ...running },
				{ kind: "full", trigger: "weekly", ...running, cursor: "c" },
				done,
			]);
		await closeStalePasses(db, after(10 * MINUTE_MS));
		expect(
			(await readPasses(db)).map(({ kind, status, finishedAt, cursor }) => ({
				kind,
				status,
				finishedAt,
				cursor,
			})),
		).toEqual([
			{
				kind: "quick",
				status: "interrupted",
				finishedAt: after(10 * MINUTE_MS),
				cursor: null,
			},
			{
				kind: "full",
				status: "interrupted",
				finishedAt: after(10 * MINUTE_MS),
				cursor: "c",
			},
			{ kind: "quick", status: "done", finishedAt: T0, cursor: null },
		]);
	});
});

describe("passe en échec", () => {
	test("le fournisseur échoue à la page 3 d'une complète : passe en échec, erreur au journal, pages 1 et 2 gardées ; la reprise relit la page 3, efface l'erreur et termine", async () => {
		const db = await freshDatabase();
		const { provider, context } = passOver(db, followers(10), { pageSize: 2 });
		provider.failingPage = 3;
		expect(await startFullPass(context, "weekly")).toMatchObject({
			status: "failed",
			finishedAt: after(3 * MINUTE_MS),
			error: "panne injectée à la page 3",
			pages: 2,
			added: 4,
			cursor: provider.cursorOf(3),
		});
		expect(await db.$count(players)).toBe(4);

		provider.failingPage = null;
		expect(await resumeFullPass(context)).toMatchObject({
			status: "done",
			error: null,
			pages: 5,
			added: 10,
		});
		expect(provider.cursors).toEqual(
			[1, 2, 3, 3, 4, 5].map((page) => provider.cursorOf(page)),
		);
	});

	test("une rapide dont le fournisseur échoue se clôt en échec, l'erreur au journal", async () => {
		const db = await freshDatabase();
		const { provider, context } = passOver(db, followers(3));
		provider.failingPage = 1;
		expect(await runQuickPass(context, "tick")).toMatchObject({
			status: "failed",
			error: "panne injectée à la page 1",
			pages: 0,
		});
		expect(await readPasses(db)).toHaveLength(1);
	});

	test("une erreur inattendue ne laisse au journal que son nom, jamais son message", async () => {
		const db = await freshDatabase();
		const { context } = passOver(db, []);
		const provider: FollowerProvider = {
			readPage: async () => {
				throw new TypeError("joueur_reçu");
			},
			readFollowerCount: async () => 0,
		};
		expect(await runQuickPass({ ...context, provider }, "tick")).toMatchObject({
			status: "failed",
			error: "TypeError",
		});
	});

	test("une réserve sans poids positif clôt la passe en échec, l'erreur du tirage au journal, sans rien écrire de la page", async () => {
		const db = await freshDatabase();
		await db.update(spells).set({ weight: 0 });
		const { context } = passOver(db, followers(3));
		expect(await runQuickPass(context, "tick")).toMatchObject({
			status: "failed",
			error:
				"la réserve tirable doit contenir au moins un sort de poids positif",
			pages: 0,
			added: 0,
		});
		expect(await db.$count(players)).toBe(0);
	});

	test.each<[string, (db: Executor) => Promise<unknown>, string]>([
		[
			"à l'insertion de ses joueurs",
			(db) =>
				injectFailure(db, {
					event: "insert",
					table: "players",
					when: "new.instagram_id = '90003'",
				}),
			"erreur Postgres P0001",
		],
		[
			"sur un contrôle de ses joueurs",
			(db) =>
				db.execute(
					sql`alter table players add constraint players_test_check
						check (instagram_id <> '90003')`,
				),
			"erreur Postgres 23514 (players_test_check)",
		],
		[
			"au journal de la page, ses joueurs insérés",
			(db) =>
				injectFailure(db, {
					event: "update",
					table: "import_passes",
					when: "new.pages <> old.pages",
				}),
			"erreur Postgres P0001",
		],
	])(
		"une panne de la base %s : la page n'est ni écrite ni comptée, et le journal porte le code Postgres, sans aucune valeur de la page",
		async (_, breakDatabase, error) => {
			const db = await freshDatabase();
			await breakDatabase(db);
			const page = followers(5, 90001);
			const { context } = passOver(db, page);
			expect(await runQuickPass(context, "tick")).toMatchObject({
				status: "failed",
				error,
				pages: 0,
				added: 0,
			});
			expect(await db.$count(players)).toBe(0);
			await expectNoReceivedValue(db, page);
		},
	);
});
