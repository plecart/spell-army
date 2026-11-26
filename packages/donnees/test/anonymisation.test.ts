import { describe, expect, test } from "vitest";
import {
	anonymizeCombatLogs,
	type Executor,
	findCombat,
	insertCombat,
	insertMonster,
	type NewCombat,
	readSeasonState,
} from "../src/index.ts";
import { freshDatabase, waitForOneLockWaiter } from "./base-neuve.ts";
import { GOLEM } from "./golem.ts";

// Le joueur retiré, et « 100 », dont il n'est qu'un préfixe.
const TARGET = "10";
const PREFIXED = "100";

/**
 * Un journal où `id` est tiré, joue une action, est forcé pour `reason` et n'est pas atteint, aux
 * côtés de « 100 », que le joueur retiré ne fait que préfixer ; un nombre 10 et des textes qui
 * contiennent « 10 » sans l'être ne sont pas des identifiants, le motif d'un autre forcé compris.
 */
function logOf(id: string, reason = "Gagnant du concours 10") {
	return {
		header: {
			seed: "a10b",
			forced: [
				{ id, position: "first", reason },
				{ id: PREFIXED, position: "last", reason: "Parrain du 10" },
			],
		},
		actions: [
			{ number: 1, fighter: { id, characterClass: "golem" }, damage: 10 },
			{ number: 2, fighter: { id: PREFIXED, characterClass: "wizard" } },
		],
		summary: {
			drawn: [id, PREFIXED],
			unreachedForced: [{ id, position: "middle" }],
		},
	};
}

/** Une base neuve où un monstre est rangé, et une fonction qui y range un combat à la date `on`. */
async function databaseWithMonster() {
	const db = await freshDatabase();
	const { id: monsterId } = await insertMonster(db, GOLEM);
	const fight = (db: Executor, day: number, log: NewCombat["log"]) =>
		insertCombat(db, {
			foughtOn: `2026-01-${10 + day}`,
			season: 1,
			chapter: 1,
			day,
			attempt: day,
			monsterId,
			outcome: "defeat",
			log,
		});
	return { db, fight };
}

describe("anonymisation des journaux", () => {
	test("chaque texte égal à l'identifiant devient « retiré » : tirés, actions, forcés, forcés non atteints ; le reste intact", async () => {
		const { db, fight } = await databaseWithMonster();
		await fight(db, 1, logOf(TARGET));
		expect(await anonymizeCombatLogs(db, TARGET)).toBe(1);
		expect((await findCombat(db, 1, 1))?.log).toEqual(
			logOf("retiré", "retiré"),
		);
	});

	test("seuls les journaux qui le portent sont réécrits ; rejouée, l'anonymisation ne réécrit rien", async () => {
		const { db, fight } = await databaseWithMonster();
		await fight(db, 1, logOf(TARGET));
		await fight(db, 2, logOf("11"));
		expect(await anonymizeCombatLogs(db, TARGET)).toBe(1);
		expect((await findCombat(db, 1, 2))?.log).toEqual(logOf("11"));
		expect(await anonymizeCombatLogs(db, TARGET)).toBe(0);
	});

	test("l'identifiant qu'un autre ne fait que préfixer, ou un nombre égal, ne touche aucun journal", async () => {
		const { db, fight } = await databaseWithMonster();
		await fight(db, 1, logOf("11"));
		expect(await anonymizeCombatLogs(db, "1")).toBe(0);
		expect(await anonymizeCombatLogs(db, TARGET)).toBe(0);
		expect((await findCombat(db, 1, 1))?.log).toEqual(logOf("11"));
	});

	test("pendant un lancement, l'anonymisation attend sa fin, puis réécrit le journal qu'il vient d'écrire", async () => {
		const { db, fight } = await databaseWithMonster();
		let anonymized: Promise<number> | undefined;
		await db.transaction(async (tx) => {
			await readSeasonState(tx, { forUpdate: true });
			anonymized = anonymizeCombatLogs(db, TARGET);
			await waitForOneLockWaiter(db);
			await fight(tx, 1, logOf(TARGET));
		});
		expect(await anonymized).toBe(1);
		expect((await findCombat(db, 1, 1))?.log).toEqual(
			logOf("retiré", "retiré"),
		);
	});
});
