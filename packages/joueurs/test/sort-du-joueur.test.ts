import { type Executor, players, updateSpell } from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
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

/** Un numéro de la réserve de départ (1 à 24) autre que `number`. */
const otherThan = (number: number) => (number === 1 ? 2 : 1);

describe("don d'un sort à un joueur", () => {
	test.each<[string, number | undefined]>([
		["un sort tirable", undefined],
		["un sort de poids 0, jamais tiré", 0],
	])(
		"%s remplace le sien, et rend l'ancien et le nouveau numéro ; le témoin garde le sien",
		async (_, weight) => {
			const db = await databaseWithPlayers();
			const before = await spellsOf(db);
			const previous = before.get(TARGET) ?? 0;
			const given = otherThan(previous);
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
});
