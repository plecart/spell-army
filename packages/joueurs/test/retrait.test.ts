import {
	type Executor,
	excludedPlayers,
	findCombat,
	insertCombat,
	insertMonster,
	players,
} from "donnees";
import {
	freshDatabase,
	injectFailure,
	waitForOneLockWaiter,
} from "donnees/test/base-neuve";
import { describe, expect, test } from "vitest";
import {
	previewRemoval,
	type RemovalPreview,
	removePlayer,
	runQuickPass,
	writePage,
} from "../src/index.ts";
import { entry, FakeFollowerProvider } from "./faux-fournisseur.ts";
import { after, HOUR_MS, T0 } from "./horloge.ts";

// L'identifiant retiré, un témoin, joueur inscrit qui reste, et « 100 », que l'identifiant retiré
// ne fait que préfixer.
const TARGET = "10";
const WITNESS = "11";
const PREFIXED = "100";

/**
 * Un journal de combat où `id` est tiré, joue, est forcé et n'est pas atteint, avec le témoin et
 * « 100 ».
 */
function logOf(id: string) {
	return {
		header: { forced: [{ id, position: "first", reason: "Concours" }] },
		actions: [
			{ number: 1, fighter: { id } },
			{ number: 2, fighter: { id: WITNESS } },
			{ number: 3, fighter: { id: PREFIXED } },
		],
		summary: {
			drawn: [id, WITNESS, PREFIXED],
			unreachedForced: [{ id, position: "last" }],
		},
	};
}

/** Range au premier jour de la saison 1 un combat dont le journal porte `TARGET`. */
async function storeCombatOfTarget(db: Executor): Promise<void> {
	const { id: monsterId } = await insertMonster(db, {
		season: 1,
		chapter: 1,
		name: "Golem de lave",
		profile: {},
		attacks: [],
		scaleFactor: 1,
		trait: "Brûlant.",
	});
	await insertCombat(db, {
		foughtOn: "2026-01-16",
		season: 1,
		chapter: 1,
		day: 1,
		attempt: 1,
		monsterId,
		outcome: "victory",
		log: logOf(TARGET),
	});
}

/** Le journal du combat que range `storeCombatOfTarget`. */
async function storedLog(db: Executor): Promise<unknown> {
	return (await findCombat(db, 1, 1))?.log;
}

/** Les identifiants de `players` et ceux de `excluded_players`, par ordre croissant. */
async function stateOf(db: Executor) {
	const ids = await db
		.select({ id: players.instagramId })
		.from(players)
		.orderBy(players.instagramId);
	const excluded = await db
		.select({ id: excludedPlayers.instagramId })
		.from(excludedPlayers)
		.orderBy(excludedPlayers.instagramId);
	return {
		players: ids.map(({ id }) => id),
		excluded: excluded.map(({ id }) => id),
	};
}

// Chaque état de départ de `TARGET`, le témoin inscrit : ce qu'en annonce l'aperçu, et l'état après
// le retrait.
const CASES: [
	string,
	(db: Executor) => Promise<unknown>,
	RemovalPreview,
	Awaited<ReturnType<typeof stateOf>>,
][] = [
	[
		"un joueur",
		(db) => writePage(db, [entry(TARGET)]),
		{ effect: "removed", username: "joueur_10" },
		{ players: [WITNESS], excluded: [TARGET] },
	],
	[
		"un identifiant sans joueur",
		async () => {},
		{ effect: "excluded" },
		{ players: [WITNESS], excluded: [TARGET] },
	],
	[
		"un identifiant déjà exclu",
		(db) => db.insert(excludedPlayers).values({ instagramId: TARGET }),
		{ effect: "already_excluded" },
		{ players: [WITNESS], excluded: [TARGET] },
	],
];

/** Une base migrée neuve où le témoin est inscrit et `TARGET` dans l'état de `setup`. */
async function databaseWith(setup: (db: Executor) => Promise<unknown>) {
	const db = await freshDatabase();
	await writePage(db, [entry(WITNESS)]);
	await setup(db);
	return db;
}

describe("retrait d'un joueur", () => {
	test.each(CASES)(
		"retirer %s : l'effet rendu, sa ligne supprimée s'il en a une, son identifiant exclu, le témoin inscrit ; sans erreur",
		async (_, setup, { effect }, expected) => {
			const db = await databaseWith(setup);
			expect(await removePlayer(db, TARGET)).toBe(effect);
			expect(await stateOf(db)).toEqual(expected);
		},
	);

	test.each(CASES)(
		"l'aperçu du retrait d'%s ne change rien, et annonce l'effet du retrait qui suit",
		async (_, setup, preview) => {
			const db = await databaseWith(setup);
			const before = await stateOf(db);
			expect(await previewRemoval(db, TARGET)).toEqual(preview);
			expect(await stateOf(db)).toEqual(before);
			expect(await removePlayer(db, TARGET)).toBe(preview.effect);
		},
	);

	test.each(CASES)(
		"retirer %s remplace son identifiant par « retiré » dans les journaux de combat, sans toucher au témoin ni à « 100 »",
		async (_, setup) => {
			const db = await databaseWith(setup);
			await storeCombatOfTarget(db);
			await removePlayer(db, TARGET);
			expect(await storedLog(db)).toEqual(logOf("retiré"));
		},
	);

	test("un retrait qui échoue n'anonymise rien, et ne change rien", async () => {
		const db = await databaseWith((db) => writePage(db, [entry(TARGET)]));
		await storeCombatOfTarget(db);
		const before = await stateOf(db);
		await injectFailure(db, { event: "delete", table: "players" });
		await expect(removePlayer(db, TARGET)).rejects.toMatchObject({
			cause: { code: "P0001" },
		});
		expect(await storedLog(db)).toEqual(logOf(TARGET));
		expect(await stateOf(db)).toEqual(before);
	});

	test("retiré puis toujours abonné : une passe rapide d'une liste qui le porte encore ne le recrée pas", async () => {
		const db = await freshDatabase();
		const list = [entry(TARGET), entry(WITNESS)];
		await writePage(db, list);
		await removePlayer(db, TARGET);
		const provider = new FakeFollowerProvider(list);
		await runQuickPass(
			{ db, provider, clock: () => T0, deadline: after(HOUR_MS) },
			"tick",
		);
		expect(provider.cursors).toEqual([null]);
		expect(await stateOf(db)).toEqual({
			players: [WITNESS],
			excluded: [TARGET],
		});
	});
});

describe("retrait et écriture d'une page de l'import", () => {
	test("une page ouverte dans une transaction non validée fait attendre le retrait de l'identifiant qu'elle inscrit ; après son commit, le joueur est supprimé et l'identifiant exclu", async () => {
		const db = await freshDatabase();
		let removal: ReturnType<typeof removePlayer> | undefined;
		await db.transaction(async (tx) => {
			expect(await writePage(tx, [entry(TARGET)])).toMatchObject({
				added: 1,
			});
			removal = removePlayer(db, TARGET);
			await waitForOneLockWaiter(db);
		});
		expect(await removal).toBe("removed");
		expect(await stateOf(db)).toEqual({ players: [], excluded: [TARGET] });
	});

	test("un retrait non validé fait attendre une page lancée après lui ; après son commit, la page voit l'exclusion et n'inscrit personne", async () => {
		const db = await freshDatabase();
		let page: ReturnType<typeof writePage> | undefined;
		await db.transaction(async (tx) => {
			await removePlayer(tx, TARGET);
			page = writePage(db, [entry(TARGET)]);
			await waitForOneLockWaiter(db);
		});
		expect(await page).toMatchObject({ added: 0 });
		expect(await stateOf(db)).toEqual({ players: [], excluded: [TARGET] });
	});
});
