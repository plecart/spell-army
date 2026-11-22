import { Socket } from "node:net";
import {
	createClient,
	type Executor,
	excludedPlayers,
	insertSpell,
	players,
	readSpell,
	updateSpell,
} from "donnees";
import { UNREACHABLE_DATABASE_URL } from "donnees/test/base-de-test";
import { freshDatabase } from "donnees/test/base-neuve";
import { characterOf } from "personnages";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { readVisiblePlayer } from "../src/index.ts";
import { T0 } from "./horloge.ts";

// La recrue des tests, qui porte le sort n° 3 de la réserve de départ.
const RECRUIT = {
	instagramId: "1234567890",
	username: "wizard_army",
	spellNumber: 3,
	arrivedAt: T0,
};

/** Une base migrée neuve où la recrue est inscrite. */
async function databaseWithRecruit(): Promise<Executor> {
	const db = await freshDatabase();
	await db.insert(players).values(RECRUIT);
	return db;
}

describe("un joueur visible par identifiant", () => {
	test("rend son pseudo, son arrivée, sa classe et son sort, sans image puis avec", async () => {
		const db = await databaseWithRecruit();
		const { number, name, effect, description } = await readSpell(
			db,
			RECRUIT.spellNumber,
		);
		const sheet = {
			instagramId: RECRUIT.instagramId,
			username: RECRUIT.username,
			classKey: characterOf(RECRUIT.instagramId).class,
			arrivedAt: RECRUIT.arrivedAt,
			spell: { number, name, effect, description, hasImage: false },
			poolSize: 24,
		};
		expect(await readVisiblePlayer(db, RECRUIT.instagramId)).toEqual(sheet);

		await updateSpell(db, number, {
			image: { bytes: new TextEncoder().encode("abc"), type: "image/png" },
		});
		expect(await readVisiblePlayer(db, RECRUIT.instagramId)).toEqual({
			...sheet,
			spell: { ...sheet.spell, hasImage: true },
		});
	});

	// Le critère « 3/24 → 3/25 » de #18 : la réserve, pas la réserve tirable.
	test("la taille de la réserve compte chaque sort, poids 0 compris : 24, puis 25", async () => {
		const db = await databaseWithRecruit();
		expect((await readVisiblePlayer(db, RECRUIT.instagramId))?.poolSize).toBe(
			24,
		);
		const { number, image, ...spell } = await readSpell(db, 1);
		await insertSpell(db, {
			...spell,
			key: "copie-de-poids-0",
			name: "Copie de poids 0",
			weight: 0,
		});
		expect((await readVisiblePlayer(db, RECRUIT.instagramId))?.poolSize).toBe(
			25,
		);
	});

	test("un joueur retiré, dans excluded_players, rend null", async () => {
		const db = await databaseWithRecruit();
		await db
			.insert(excludedPlayers)
			.values({ instagramId: RECRUIT.instagramId });
		expect(await readVisiblePlayer(db, RECRUIT.instagramId)).toBeNull();
	});

	test("un identifiant absent de players rend null", async () => {
		const db = await databaseWithRecruit();
		expect(await readVisiblePlayer(db, "42")).toBeNull();
	});

	test.each(["abc", "0123", ""])(
		"l'identifiant mal formé « %s » rend null, sans connexion à la base",
		async (instagramId) => {
			const connect = vi.spyOn(Socket.prototype, "connect");
			const client = createClient(UNREACHABLE_DATABASE_URL);
			onTestFinished(() => client.$client.end());
			expect(await readVisiblePlayer(client, instagramId)).toBeNull();
			expect(connect).not.toHaveBeenCalled();
		},
	);
});
