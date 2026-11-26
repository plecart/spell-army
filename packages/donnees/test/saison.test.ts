import { describe, expect, test } from "vitest";
import {
	type ForcedRecord,
	players,
	readForced,
	readSeasonState,
	replaceForced,
	type SeasonStateRecord,
	seasonState,
	writeSeasonState,
} from "../src/index.ts";
import { freshDatabase, waitForOneLockWaiter } from "./base-neuve.ts";
import { MALFORMED_IDS } from "./formes-instagram.ts";

// Posé par la migration `0009_saison` : la saison 1 commence (issue #21).
const SEASON_START: SeasonStateRecord = {
	season: 1,
	chapter: 1,
	attempt: 1,
	combatsPlayed: 0,
	defeatStreak: 0,
	budget: null,
	lastOutcome: null,
	endDay: null,
};

// Une saison en cours, après une défaite : `donnees` ne lit pas le budget, que `combat` construit.
const ONGOING: SeasonStateRecord = {
	season: 1,
	chapter: 12,
	attempt: 2,
	combatsPlayed: 14,
	defeatStreak: 1,
	budget: {
		kind: "formula",
		army: { life: 100, strength: 100, magic: 100, speed: 100 },
		referenceRecruits: 20,
		averageRecruit: { life: 7.6, strength: 7.6, magic: 7.5, speed: 7.3 },
		recruitShare: 0.30000000000000004,
	},
	lastOutcome: "defeat",
	endDay: null,
};

describe("état de la saison", () => {
	test("une base migrée neuve porte le début de la saison 1", async () => {
		expect(await readSeasonState(await freshDatabase())).toEqual(SEASON_START);
	});

	test("l'état écrit se relit à l'identique, budget compris", async () => {
		const db = await freshDatabase();
		expect(await writeSeasonState(db, ONGOING)).toEqual(ONGOING);
		expect(await readSeasonState(db)).toEqual(ONGOING);
	});

	test("la saison terminée se relit, sans budget, son jour de fin et sa victoire", async () => {
		const db = await freshDatabase();
		const ended: SeasonStateRecord = {
			...ONGOING,
			chapter: 30,
			attempt: 1,
			combatsPlayed: 34,
			defeatStreak: 0,
			budget: null,
			lastOutcome: "victory",
			endDay: 34,
		};
		await writeSeasonState(db, ended);
		expect(await readSeasonState(db)).toEqual(ended);
	});

	test("la table n'admet qu'une ligne", async () => {
		const db = await freshDatabase();
		await expect(
			db.insert(seasonState).values({ id: 2, ...SEASON_START }),
		).rejects.toMatchObject({
			cause: { code: "23514", constraint: "season_state_id_check" },
		});
	});

	// Les bornes, côté refusé ; le côté accepté est dans le début de la saison (1 et 0) et dans la
	// saison terminée (le jour de fin).
	test.each<[string, Partial<SeasonStateRecord>, string]>([
		["la saison 0", { season: 0 }, "season_state_season_check"],
		["le chapitre 0", { chapter: 0 }, "season_state_chapter_check"],
		["la tentative 0", { attempt: 0 }, "season_state_attempt_check"],
		[
			"-1 combat joué",
			{ combatsPlayed: -1 },
			"season_state_combats_played_check",
		],
		[
			"-1 défaite de suite",
			{ defeatStreak: -1 },
			"season_state_defeat_streak_check",
		],
		["le jour de fin 0", { endDay: 0 }, "season_state_end_day_check"],
		[
			"une issue inconnue",
			{ lastOutcome: "draw" as SeasonStateRecord["lastOutcome"] },
			"season_state_last_outcome_check",
		],
	])("la base refuse %s, l'état inchangé", async (_, change, constraint) => {
		const db = await freshDatabase();
		await expect(
			writeSeasonState(db, { ...ONGOING, ...change }),
		).rejects.toMatchObject({ cause: { code: "23514", constraint } });
		expect(await readSeasonState(db)).toEqual(SEASON_START);
	});

	test("la lecture et l'écriture lèvent une erreur claire quand la ligne manque", async () => {
		const db = await freshDatabase();
		await db.delete(seasonState);
		await expect(readSeasonState(db)).rejects.toThrow(
			"État de la saison absent",
		);
		await expect(writeSeasonState(db, ONGOING)).rejects.toThrow(
			"État de la saison absent",
		);
	});

	test("une lecture verrouillée fait attendre la suivante, qui lit l'état écrit par la première", async () => {
		const db = await freshDatabase();
		let concurrent: ReturnType<typeof readSeasonState> | undefined;
		await db.transaction(async (tx) => {
			await readSeasonState(tx, { forUpdate: true });
			concurrent = readSeasonState(db, { forUpdate: true });
			await waitForOneLockWaiter(db);
			await writeSeasonState(tx, ONGOING);
		});
		expect(await concurrent).toEqual(ONGOING);
	});
});

// Trois forcés, un par position, dans l'ordre où le mainteneur les a choisis.
const LAST: ForcedRecord = {
	instagramId: "12",
	position: "last",
	reason: "Anniversaire",
};
const FIRST: ForcedRecord = {
	instagramId: "7",
	position: "first",
	reason: "Concours gagné",
};
const MIDDLE: ForcedRecord = {
	instagramId: "300",
	position: "middle",
	reason: "Fan art du mois",
};
const FORCED = [LAST, FIRST, MIDDLE];

describe("forcés du prochain combat", () => {
	test("une base migrée neuve n'a aucun forcé", async () => {
		expect(await readForced(await freshDatabase())).toEqual([]);
	});

	test("la liste remplacée se relit dans l'ordre donné ; le remplacement rend la liste d'avant", async () => {
		const db = await freshDatabase();
		expect(await replaceForced(db, FORCED)).toEqual([]);
		expect(await readForced(db)).toEqual(FORCED);
	});

	test("un second remplacement remplace la liste entière", async () => {
		const db = await freshDatabase();
		const next = [MIDDLE, { ...LAST, reason: "Autre motif" }];
		await replaceForced(db, FORCED);
		expect(await replaceForced(db, next)).toEqual(FORCED);
		expect(await readForced(db)).toEqual(next);
	});

	test("remplacée par la liste vide, la liste se vide : le combat la consomme", async () => {
		const db = await freshDatabase();
		await replaceForced(db, FORCED);
		expect(await replaceForced(db, [])).toEqual(FORCED);
		expect(await readForced(db)).toEqual([]);
	});

	test("un forcé qu'aucun joueur ne porte, ou plus, reste dans la liste : aucune clé étrangère ne l'en retire", async () => {
		const db = await freshDatabase();
		await db.insert(players).values({
			instagramId: "12",
			username: "douze",
			spellNumber: 1,
		});
		await replaceForced(db, FORCED);
		await db.delete(players);
		expect(await readForced(db)).toEqual(FORCED);
	});

	type Refusal = [string, ForcedRecord[], { code: string; constraint: string }];
	const forced = (change: Partial<ForcedRecord>): ForcedRecord[] => [
		{ ...LAST, ...change },
	];
	const check = (constraint: string) => ({ code: "23514", constraint });
	test.each<Refusal>([
		...MALFORMED_IDS.map(
			([name, instagramId]): Refusal => [
				name,
				forced({ instagramId }),
				check("next_combat_forced_instagram_id_check"),
			],
		),
		[
			"une position inconnue",
			forced({ position: "early" as ForcedRecord["position"] }),
			check("next_combat_forced_position_check"),
		],
		[
			"un motif vide",
			forced({ reason: "" }),
			check("next_combat_forced_reason_check"),
		],
		[
			"un motif blanc",
			forced({ reason: " \t\n" }),
			check("next_combat_forced_reason_check"),
		],
		[
			"le même joueur forcé deux fois",
			[LAST, { ...FIRST, instagramId: LAST.instagramId }],
			{ code: "23505", constraint: "next_combat_forced_instagram_id_unique" },
		],
	])(
		"%s : refusé par la base, la liste d'avant intacte",
		async (_, refused, cause) => {
			const db = await freshDatabase();
			await replaceForced(db, FORCED);
			await expect(replaceForced(db, refused)).rejects.toMatchObject({ cause });
			expect(await readForced(db)).toEqual(FORCED);
		},
	);

	test("un choix des forcés pendant un lancement attend sa fin : le lancement consomme l'ancienne liste, la nouvelle reste au combat suivant", async () => {
		const db = await freshDatabase();
		const previous = [LAST];
		await replaceForced(db, previous);
		let choice: ReturnType<typeof replaceForced> | undefined;
		const consumed = await db.transaction(async (tx) => {
			await readSeasonState(tx, { forUpdate: true });
			choice = replaceForced(db, FORCED);
			await waitForOneLockWaiter(db);
			const read = await readForced(tx);
			await replaceForced(tx, []);
			return read;
		});
		expect(consumed).toEqual(previous);
		expect(await choice).toEqual([]);
		expect(await readForced(db)).toEqual(FORCED);
	});
});
