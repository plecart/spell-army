import { describe, expect, test } from "vitest";
import {
	COMBAT_DATE_UNIQUE,
	deleteMonsterByName,
	type Executor,
	findCombat,
	insertCombat,
	insertMonster,
	listCombatsOfMonster,
	listMonsters,
	type NewCombat,
	type NewMonster,
	postgresErrorCode,
} from "../src/index.ts";
import { freshDatabase, waitForOneLockWaiter } from "./base-neuve.ts";

// Un monstre du bestiaire : `donnees` ne lit ni le profil ni les attaques.
const GOLEM: NewMonster = {
	season: 1,
	chapter: 1,
	name: "Golem de lave",
	profile: { life: 1.5, strength: 1, magic: 1, speed: 0.5 },
	attacks: [],
	scaleFactor: 1.1653817482293547,
	trait: "Sa peau de lave brûle qui la frappe.",
};

// Un combat sans son monstre : `donnees` ne lit pas le journal, que `combat` construit.
const COMBAT: Omit<NewCombat, "monsterId"> = {
	foughtOn: "2026-01-16",
	season: 1,
	chapter: 1,
	day: 1,
	attempt: 1,
	outcome: "victory",
	log: {
		header: { seed: "4f2a", forced: [{ id: "10", position: "first" }] },
		actions: [{ number: 1, fighter: { id: "10" }, damage: 12.5 }],
		summary: { outcome: "victory", drawn: ["10"], unreachedForced: [] },
	},
};

/** Une base neuve où le golem est rangé, et son identifiant. */
async function databaseWithGolem(): Promise<{ db: Executor; golem: number }> {
	const db = await freshDatabase();
	const { id } = await insertMonster(db, GOLEM);
	return { db, golem: id };
}

describe("combats", () => {
	test("un combat rangé se relit par sa saison et son jour, journal compris, horodaté par la base", async () => {
		const { db, golem } = await databaseWithGolem();
		const stored = await insertCombat(db, { ...COMBAT, monsterId: golem });
		expect(stored).toEqual({
			id: 1,
			...COMBAT,
			monsterId: golem,
			recordedAt: expect.any(Date),
		});
		expect(await findCombat(db, 1, 1)).toEqual(stored);
	});

	test.each([
		["un autre jour", 1, 2],
		["une autre saison", 2, 1],
	])("%s sans combat ne trouve rien", async (_, season, day) => {
		const { db, golem } = await databaseWithGolem();
		await insertCombat(db, { ...COMBAT, monsterId: golem });
		expect(await findCombat(db, season, day)).toBeUndefined();
	});

	test("un second combat à la même date est refusé par l'unicité de la date, que postgresErrorCode reconnaît ; rien n'est écrit", async () => {
		const { db, golem } = await databaseWithGolem();
		await insertCombat(db, { ...COMBAT, monsterId: golem });
		const error = await insertCombat(db, {
			...COMBAT,
			day: 2,
			monsterId: golem,
		}).catch((caught: unknown) => caught);
		expect(postgresErrorCode(error)).toEqual({
			code: "23505",
			constraint: COMBAT_DATE_UNIQUE,
		});
		expect(await findCombat(db, 1, 2)).toBeUndefined();
	});

	test("un second lancement concurrent à la même date attend le premier, puis est refusé par l'unicité de la date", async () => {
		const { db, golem } = await databaseWithGolem();
		let concurrent: Promise<unknown> | undefined;
		await db.transaction(async (tx) => {
			await insertCombat(tx, { ...COMBAT, monsterId: golem });
			concurrent = insertCombat(db, {
				...COMBAT,
				day: 2,
				monsterId: golem,
			}).catch((caught: unknown) => caught);
			await waitForOneLockWaiter(db);
		});
		expect(postgresErrorCode(await concurrent)).toEqual({
			code: "23505",
			constraint: COMBAT_DATE_UNIQUE,
		});
	});

	test("un second combat au même jour de la même saison, à une autre date : refusé par la base", async () => {
		const { db, golem } = await databaseWithGolem();
		await insertCombat(db, { ...COMBAT, monsterId: golem });
		await expect(
			insertCombat(db, { ...COMBAT, foughtOn: "2026-01-17", monsterId: golem }),
		).rejects.toMatchObject({
			cause: { code: "23505", constraint: "combats_season_day_unique" },
		});
	});

	test("le même jour d'une autre saison, à une autre date : accepté", async () => {
		const { db, golem } = await databaseWithGolem();
		await insertCombat(db, { ...COMBAT, monsterId: golem });
		const next = { ...COMBAT, foughtOn: "2026-06-01", season: 2 };
		await insertCombat(db, { ...next, monsterId: golem });
		expect(await findCombat(db, 2, 1)).toMatchObject(next);
	});

	// Les bornes, côté refusé ; le côté accepté (1) est dans le combat de référence.
	test.each<[string, Partial<NewCombat>, string]>([
		["la saison 0", { season: 0 }, "combats_season_check"],
		["le chapitre 0", { chapter: 0 }, "combats_chapter_check"],
		["le jour 0", { day: 0 }, "combats_day_check"],
		["la tentative 0", { attempt: 0 }, "combats_attempt_check"],
		[
			"une issue inconnue",
			{ outcome: "draw" as NewCombat["outcome"] },
			"combats_outcome_check",
		],
	])(
		"la base refuse %s, et rien n'est écrit",
		async (_, change, constraint) => {
			const { db, golem } = await databaseWithGolem();
			await expect(
				insertCombat(db, { ...COMBAT, monsterId: golem, ...change }),
			).rejects.toMatchObject({ cause: { code: "23514", constraint } });
			expect(await listCombatsOfMonster(db, golem)).toEqual([]);
		},
	);

	test("un monstre inconnu est refusé par la clé étrangère", async () => {
		const db = await freshDatabase();
		await expect(
			insertCombat(db, { ...COMBAT, monsterId: 999 }),
		).rejects.toMatchObject({
			cause: { code: "23503", constraint: "combats_monster_id_monsters_id_fk" },
		});
	});

	test("les combats d'un monstre, par saison puis par jour, sans ceux d'un autre", async () => {
		const { db, golem } = await databaseWithGolem();
		const { id: slug } = await insertMonster(db, {
			...GOLEM,
			chapter: 2,
			name: "Limace",
		});
		const fought = [
			{ foughtOn: "2026-06-01", season: 2, day: 1, monsterId: golem },
			{ foughtOn: "2026-01-17", season: 1, day: 2, monsterId: slug },
			{ foughtOn: "2026-01-18", season: 1, day: 3, monsterId: golem },
			{ foughtOn: "2026-01-16", season: 1, day: 1, monsterId: golem },
		];
		for (const combat of fought) {
			await insertCombat(db, { ...COMBAT, ...combat });
		}
		expect(await listCombatsOfMonster(db, golem)).toEqual([
			{ season: 1, day: 1, foughtOn: "2026-01-16" },
			{ season: 1, day: 3, foughtOn: "2026-01-18" },
			{ season: 2, day: 1, foughtOn: "2026-06-01" },
		]);
	});

	// `on delete restrict` lève `restrict_violation` (23001), pas la violation de clé étrangère (23503)
	// d'une insertion : mesuré sur Postgres 18 le 2026-11-25.
	test("un monstre affronté ne se retire plus : la clé étrangère le refuse, et il reste au bestiaire", async () => {
		const { db, golem } = await databaseWithGolem();
		await insertCombat(db, { ...COMBAT, monsterId: golem });
		await expect(deleteMonsterByName(db, GOLEM.name)).rejects.toMatchObject({
			cause: { code: "23001", constraint: "combats_monster_id_monsters_id_fk" },
		});
		expect(await listMonsters(db)).toMatchObject([{ id: golem }]);
	});
});
