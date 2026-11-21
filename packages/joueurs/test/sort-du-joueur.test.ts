import { type Executor, players, updateSpell } from "donnees";
import { freshDatabase, waitForOneLockWaiter } from "donnees/test/base-neuve";
import { describe, expect, test } from "vitest";
import { giveSpell, writePage } from "../src/index.ts";
import { entry } from "./faux-fournisseur.ts";

// Le joueur qui reçoit, et un témoin qui garde son sort.
const TARGET = "10";
const WITNESS = "11";

/** Une base migrée neuve où sont inscrits le joueur qui reçoit et le témoin. */
async function databaseWithPlayers(): Promise<Executor> {
	const db = await freshDatabase();
	await writePage(db, [entry(TARGET), entry(WITNESS)]);
	return db;
}

/** Les joueurs, toutes colonnes, par identifiant croissant. */
function readPlayers(db: Executor) {
	return db.select().from(players).orderBy(players.instagramId);
}

/** Le sort de chaque joueur, par identifiant. */
async function spellsOf(db: Executor): Promise<Map<string, number>> {
	return new Map(
		(await readPlayers(db)).map(({ instagramId, spellNumber }) => [
			instagramId,
			spellNumber,
		]),
	);
}

/** Deux numéros distincts de la réserve de départ (1 à 24), autres que `number`. */
const otherThan = (number: number) =>
	[1, 2, 3].filter((other) => other !== number) as [number, number];

describe("don d'un sort à un joueur", () => {
	test.each<[string, number | undefined, (previous: number) => number]>([
		["un sort tirable", undefined, (previous) => otherThan(previous)[0]],
		[
			"un sort de poids 0, jamais tiré",
			0,
			(previous) => otherThan(previous)[0],
		],
		["le sort qu'il a déjà", undefined, (previous) => previous],
	])(
		"%s : le joueur l'a ensuite, l'ancien et le nouveau numéro sont rendus ; le témoin garde le sien",
		async (_, weight, choose) => {
			const db = await databaseWithPlayers();
			const before = await spellsOf(db);
			const previous = before.get(TARGET) ?? 0;
			const given = choose(previous);
			if (weight !== undefined) {
				await updateSpell(db, given, { weight });
			}
			expect(await giveSpell(db, TARGET, given)).toEqual({
				before: previous,
				after: given,
			});
			expect(await spellsOf(db)).toEqual(new Map([...before, [TARGET, given]]));
		},
	);

	test.each<[string, string, number, string]>([
		[
			"un joueur absent",
			"99",
			1,
			"Aucun joueur d'identifiant 99 : rien n'a changé.",
		],
		[
			"un sort inexistant",
			TARGET,
			999,
			"Aucun sort de numéro 999 : rien n'a changé.",
		],
		[
			"un joueur absent et un sort inexistant, le joueur d'abord",
			"99",
			999,
			"Aucun joueur d'identifiant 99 : rien n'a changé.",
		],
	])(
		"%s : refusé par une erreur qui le nomme, la base inchangée",
		async (_, instagramId, spellNumber, message) => {
			const db = await databaseWithPlayers();
			const before = await readPlayers(db);
			await expect(giveSpell(db, instagramId, spellNumber)).rejects.toThrow(
				message,
			);
			expect(await readPlayers(db)).toEqual(before);
		},
	);

	test("un don lancé pendant un autre, non validé, attend son commit, puis rend le sort donné par le premier comme numéro d'avant", async () => {
		const db = await databaseWithPlayers();
		const [first, second] = otherThan((await spellsOf(db)).get(TARGET) ?? 0);
		let concurrent: ReturnType<typeof giveSpell> | undefined;
		await db.transaction(async (tx) => {
			await giveSpell(tx, TARGET, first);
			concurrent = giveSpell(db, TARGET, second);
			await waitForOneLockWaiter(db);
		});
		expect(await concurrent).toEqual({ before: first, after: second });
		expect((await spellsOf(db)).get(TARGET)).toBe(second);
	});
});
