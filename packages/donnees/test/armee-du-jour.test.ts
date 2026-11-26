import { describe, expect, test } from "vitest";
import {
	dailyArrivals,
	type Executor,
	listArmy,
	type ParisDay,
	parisCalendar,
	players,
} from "../src/index.ts";
import { freshDatabase } from "./base-neuve.ts";

// Les instants s'écrivent à l'heure de Paris, leur décalage en clair : +01:00 l'hiver, +02:00 l'été.
// En 2026, l'heure d'été commence le 29 mars et finit le 25 octobre.

/** Inscrit, pour chaque `[instant, nombre]`, ce nombre de joueurs arrivés à cet instant. */
async function arrive(
	db: Executor,
	schedule: [at: string, count: number][],
): Promise<void> {
	const rows = schedule.flatMap(([at, count]) =>
		Array.from({ length: count }, () => new Date(at)),
	);
	if (rows.length === 0) return;
	await db.insert(players).values(
		rows.map((arrivedAt, index) => ({
			instagramId: String(1000 + index),
			username: `joueur_${index}`,
			spellNumber: 1,
			arrivedAt,
		})),
	);
}

describe("calendrier Europe/Paris", () => {
	test.each<[string, string, ParisDay]>([
		[
			"23 h 59 un soir d'hiver",
			"2026-01-15T23:59:00+01:00",
			{
				date: "2026-01-15",
				lastMidnight: new Date("2026-01-15T00:00:00+01:00"),
			},
		],
		[
			"minuit pile en hiver",
			"2026-01-16T00:00:00+01:00",
			{
				date: "2026-01-16",
				lastMidnight: new Date("2026-01-16T00:00:00+01:00"),
			},
		],
		[
			"00 h 01 une nuit d'hiver",
			"2026-01-16T00:01:00+01:00",
			{
				date: "2026-01-16",
				lastMidnight: new Date("2026-01-16T00:00:00+01:00"),
			},
		],
		[
			"23 h 59 un soir d'été",
			"2026-07-15T23:59:00+02:00",
			{
				date: "2026-07-15",
				lastMidnight: new Date("2026-07-15T00:00:00+02:00"),
			},
		],
		[
			"00 h 01 une nuit d'été",
			"2026-07-16T00:01:00+02:00",
			{
				date: "2026-07-16",
				lastMidnight: new Date("2026-07-16T00:00:00+02:00"),
			},
		],
		[
			"l'après-midi du passage à l'heure d'été, minuit encore à l'heure d'hiver",
			"2026-03-29T14:00:00+02:00",
			{
				date: "2026-03-29",
				lastMidnight: new Date("2026-03-29T00:00:00+01:00"),
			},
		],
		[
			"l'après-midi du retour à l'heure d'hiver, minuit encore à l'heure d'été",
			"2026-10-25T14:00:00+01:00",
			{
				date: "2026-10-25",
				lastMidnight: new Date("2026-10-25T00:00:00+02:00"),
			},
		],
	])("%s : la date de Paris et son dernier minuit", async (_, at, day) => {
		expect(await parisCalendar(await freshDatabase(), new Date(at))).toEqual(
			day,
		);
	});
});

describe("armée du jour", () => {
	// Le lancement à 9 h, l'arrivée de la veille à 23 h 59 et celle de la nuit à 00 h 01.
	test.each([
		[
			"d'hiver",
			"2026-01-16T09:00:00+01:00",
			"2026-01-15T23:59:00+01:00",
			"2026-01-16T00:01:00+01:00",
		],
		[
			"d'été",
			"2026-07-16T09:00:00+02:00",
			"2026-07-15T23:59:00+02:00",
			"2026-07-16T00:01:00+02:00",
		],
	])(
		"un jour %s, un joueur arrivé la veille à 23 h 59 (Paris) en fait partie, un joueur arrivé à 00 h 01 non",
		async (_, launch, eve, night) => {
			const db = await freshDatabase();
			await db.insert(players).values([
				{
					instagramId: "1",
					username: "veille",
					spellNumber: 1,
					arrivedAt: new Date(eve),
				},
				{
					instagramId: "2",
					username: "nuit",
					spellNumber: 1,
					arrivedAt: new Date(night),
				},
			]);
			const { lastMidnight } = await parisCalendar(db, new Date(launch));
			expect(await listArmy(db, lastMidnight)).toEqual([
				{ instagramId: "1", spellNumber: 1 },
			]);
		},
	);

	test("l'armée rend l'identifiant et le sort de chacun, rangés par identifiant", async () => {
		const db = await freshDatabase();
		const before = new Date("2026-01-16T00:00:00+01:00");
		const arrivedAt = new Date("2026-01-10T12:00:00+01:00");
		await db.insert(players).values([
			{ instagramId: "9", username: "neuf", spellNumber: 2, arrivedAt },
			{ instagramId: "100", username: "cent", spellNumber: 3, arrivedAt },
			{ instagramId: "10", username: "dix", spellNumber: 1, arrivedAt },
		]);
		expect(await listArmy(db, before)).toEqual([
			{ instagramId: "10", spellNumber: 1 },
			{ instagramId: "100", spellNumber: 3 },
			{ instagramId: "9", spellNumber: 2 },
		]);
	});
});

describe("arrivées par date", () => {
	// Le dernier minuit d'un combat lancé le 16 janvier : la fenêtre de 3 dates va du 13 au 15.
	const MIDNIGHT = new Date("2026-01-16T00:00:00+01:00");

	test("10, 20 et 30 arrivées sur les trois dates de la fenêtre, dans l'ordre ; rien autour ne compte", async () => {
		const db = await freshDatabase();
		await arrive(db, [
			["2026-01-12T12:00:00+01:00", 4],
			["2026-01-13T12:00:00+01:00", 10],
			["2026-01-14T12:00:00+01:00", 20],
			["2026-01-15T12:00:00+01:00", 30],
			["2026-01-16T00:00:00+01:00", 5],
		]);
		expect(await dailyArrivals(db, MIDNIGHT, 3)).toEqual([10, 20, 30]);
	});

	test("une date sans arrivée vaut 0", async () => {
		const db = await freshDatabase();
		await arrive(db, [
			["2026-01-13T12:00:00+01:00", 5],
			["2026-01-15T12:00:00+01:00", 2],
		]);
		expect(await dailyArrivals(db, MIDNIGHT, 3)).toEqual([5, 0, 2]);
	});

	test("une fenêtre sans aucune arrivée vaut 0 à chaque date", async () => {
		expect(await dailyArrivals(await freshDatabase(), MIDNIGHT, 3)).toEqual([
			0, 0, 0,
		]);
	});

	test("chaque arrivée compte à sa date de Paris, de minuit pile à 23 h 59", async () => {
		const db = await freshDatabase();
		await arrive(db, [
			["2026-01-14T00:00:00+01:00", 1],
			["2026-01-15T00:30:00+01:00", 1],
			["2026-01-15T23:59:00+01:00", 1],
		]);
		expect(await dailyArrivals(db, MIDNIGHT, 3)).toEqual([0, 1, 2]);
	});

	test("une fenêtre qui franchit le passage à l'heure d'été compte chaque date de Paris", async () => {
		const db = await freshDatabase();
		await arrive(db, [
			["2026-03-28T23:59:00+01:00", 1],
			["2026-03-29T00:30:00+01:00", 1],
			["2026-03-29T23:59:00+02:00", 1],
			["2026-03-30T00:30:00+02:00", 1],
		]);
		expect(
			await dailyArrivals(db, new Date("2026-03-30T00:00:00+02:00"), 2),
		).toEqual([1, 2]);
	});

	test("la fenêtre a la longueur demandée", async () => {
		expect(await dailyArrivals(await freshDatabase(), MIDNIGHT, 5)).toEqual([
			0, 0, 0, 0, 0,
		]);
	});
});
