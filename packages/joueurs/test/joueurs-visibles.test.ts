import { type Executor, excludedPlayers, players } from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
import { type ClassKey, characterOf, perClass } from "personnages";
import { idsOf } from "personnages/test/identifiants";
import { describe, expect, test } from "vitest";
import { listVisiblePlayers } from "../src/index.ts";
import { after, MINUTE_MS } from "./horloge.ts";

interface Recruit {
	id: string;
	username: string;
}

/** Inscrit `recruits` dans l'ordre de la liste : chacun arrive une minute après le précédent. */
async function enlist(db: Executor, recruits: Recruit[]): Promise<void> {
	await db.insert(players).values(
		recruits.map(({ id, username }, index) => ({
			instagramId: id,
			username,
			spellNumber: 1,
			arrivedAt: after(index * MINUTE_MS),
		})),
	);
}

/** `count` recrues de `classKey`, aux pseudos `<prefix>_1`, `<prefix>_2`… */
function recruitsOf(
	classKey: ClassKey,
	count: number,
	prefix: string,
): Recruit[] {
	return idsOf(classKey, count).map((id, index) => ({
		id,
		username: `${prefix}_${index + 1}`,
	}));
}

/** Le nombre par classe, à zéro pour toute classe absente de `counts`. */
const classCounts = (counts: Partial<Record<ClassKey, number>>) =>
	perClass((classKey) => counts[classKey] ?? 0);

const usernames = (page: { players: { username: string }[] }) =>
	page.players.map(({ username }) => username);

describe("recherche", () => {
	// Arrivés dans cet ordre : le plus récent, « Charmant », vient en premier.
	const POPULATION = ["spell_army", "noahbois", "nina.lit", "Charmant"];

	test.each([
		[
			"« ARM » trouve les pseudos qui contiennent « arm », sans tenir compte de la casse",
			"ARM",
			["Charmant", "spell_army"],
		],
		[
			"« _ » ne trouve que les pseudos qui portent « _ », jamais un joker",
			"_",
			["spell_army"],
		],
		["« % » ne trouve rien : aucun pseudo ne le porte", "%", []],
		["« . » ne trouve que les pseudos qui portent « . »", ".", ["nina.lit"]],
		[
			"une recherche vide rend tout le monde",
			"",
			["Charmant", "nina.lit", "noahbois", "spell_army"],
		],
		[
			"une recherche blanche rend tout le monde",
			"   ",
			["Charmant", "nina.lit", "noahbois", "spell_army"],
		],
	])("%s", async (_, search, expected) => {
		const db = await freshDatabase();
		await enlist(
			db,
			POPULATION.map((username, index) => ({
				id: String(index + 1),
				username,
			})),
		);
		const page = await listVisiblePlayers(db, { search });
		expect(usernames(page)).toEqual(expected);
		expect(page.total).toBe(expected.length);
	});
});

describe("filtre de classe", () => {
	const POPULATION = [
		...recruitsOf("golem", 3, "golem"),
		...recruitsOf("wizard", 2, "magicien"),
		...recruitsOf("fairy", 1, "fee"),
	];

	test("le filtre golem ne rend que des golems, et compte les golems visibles", async () => {
		const db = await freshDatabase();
		await enlist(db, POPULATION);
		const page = await listVisiblePlayers(db, { classKey: "golem" });
		expect(usernames(page)).toEqual(["golem_3", "golem_2", "golem_1"]);
		expect(page.players.map(({ classKey }) => classKey)).toEqual([
			"golem",
			"golem",
			"golem",
		]);
		expect(page.total).toBe(3);
		expect(page.classCounts.golem).toBe(3);
	});

	test("les nombres par classe ne bougent pas avec le filtre de classe", async () => {
		const db = await freshDatabase();
		await enlist(db, POPULATION);
		const expected = classCounts({ golem: 3, wizard: 2, fairy: 1 });
		expect((await listVisiblePlayers(db, {})).classCounts).toEqual(expected);
		expect(
			(await listVisiblePlayers(db, { classKey: "golem" })).classCounts,
		).toEqual(expected);
	});

	test("les nombres par classe suivent la recherche, même quand le filtre ne laisse personne", async () => {
		const db = await freshDatabase();
		await enlist(db, POPULATION);
		const page = await listVisiblePlayers(db, {
			search: "MAGI",
			classKey: "golem",
		});
		expect(page.players).toEqual([]);
		expect(page.total).toBe(0);
		expect(page.classCounts).toEqual(classCounts({ wizard: 2 }));
	});
});

describe("pages", () => {
	// 50 recrues, « recrue_1 » arrivée la première, « recrue_50 » la dernière.
	const FIFTY = Array.from({ length: 50 }, (_, index) => ({
		id: String(index + 1),
		username: `recrue_${index + 1}`,
	}));

	test("50 recrues : la page 1 sur 3 rend 24 joueurs, le plus récent d'abord", async () => {
		const db = await freshDatabase();
		await enlist(db, FIFTY);
		const page = await listVisiblePlayers(db, {});
		expect(page).toMatchObject({ page: 1, pageCount: 3, total: 50 });
		expect(usernames(page)).toEqual(
			Array.from({ length: 24 }, (_, index) => `recrue_${50 - index}`),
		);
		expect(page.players[0]).toEqual({
			instagramId: "50",
			username: "recrue_50",
			classKey: characterOf("50").class,
			arrivedAt: after(49 * MINUTE_MS),
		});
	});

	test("50 recrues : la page 3 rend les 2 plus anciennes", async () => {
		const db = await freshDatabase();
		await enlist(db, FIFTY);
		const page = await listVisiblePlayers(db, { page: 3 });
		expect(page).toMatchObject({ page: 3, pageCount: 3, total: 50 });
		expect(usernames(page)).toEqual(["recrue_2", "recrue_1"]);
	});

	test.each([
		[4, 3, ["recrue_2", "recrue_1"]],
		[0, 1, ["recrue_50", "recrue_49"]],
		[-2, 1, ["recrue_50", "recrue_49"]],
	])(
		"la page %i, hors bornes, est ramenée à la page %i",
		async (requested, page, firsts) => {
			const db = await freshDatabase();
			await enlist(db, FIFTY);
			const result = await listVisiblePlayers(db, { page: requested });
			expect(result.page).toBe(page);
			expect(usernames(result).slice(0, 2)).toEqual(firsts);
		},
	);

	test("sans personne : la page 1 sur 1, vide", async () => {
		const db = await freshDatabase();
		expect(await listVisiblePlayers(db, { page: 5 })).toEqual({
			players: [],
			total: 0,
			classCounts: classCounts({}),
			page: 1,
			pageCount: 1,
		});
	});

	test("des recrues arrivées au même instant se rangent par identifiant croissant", async () => {
		const db = await freshDatabase();
		await db.insert(players).values(
			["2", "3", "1"].map((id) => ({
				instagramId: id,
				username: `recrue_${id}`,
				spellNumber: 1,
				arrivedAt: after(0),
			})),
		);
		expect(usernames(await listVisiblePlayers(db, {}))).toEqual([
			"recrue_1",
			"recrue_2",
			"recrue_3",
		]);
	});
});

describe("joueurs retirés", () => {
	test("un joueur de la liste d'exclusion n'apparaît ni dans la page, ni dans le total, ni dans les nombres par classe", async () => {
		const db = await freshDatabase();
		const removed = recruitsOf("golem", 1, "retire");
		await enlist(db, [...recruitsOf("wizard", 1, "visible"), ...removed]);
		await db
			.insert(excludedPlayers)
			.values(removed.map(({ id }) => ({ instagramId: id })));
		const page = await listVisiblePlayers(db, {});
		expect(usernames(page)).toEqual(["visible_1"]);
		expect(page).toMatchObject({
			total: 1,
			classCounts: classCounts({ wizard: 1 }),
		});
		expect(
			await listVisiblePlayers(db, { search: "retire", classKey: "golem" }),
		).toMatchObject({ players: [], total: 0, classCounts: classCounts({}) });
	});
});
