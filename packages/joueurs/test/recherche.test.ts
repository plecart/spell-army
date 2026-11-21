import { type Executor, listSpells, readDrawablePool } from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
import { characterOf, drawSpell } from "personnages";
import { describe, expect, test } from "vitest";
import { type FollowerEntry, searchPlayers, writePage } from "../src/index.ts";
import { entry } from "./faux-fournisseur.ts";

/** Une base migrée neuve où s'inscrivent les joueurs de `page`, dans cet ordre. */
async function databaseWith(page: readonly FollowerEntry[]): Promise<Executor> {
	const db = await freshDatabase();
	await writePage(db, page);
	return db;
}

/** Les pseudos que rend la recherche de `fragment`, dans l'ordre, et si la liste est tronquée. */
async function usernamesFound(db: Executor, fragment: string) {
	const { players, truncated } = await searchPlayers(db, fragment);
	return { usernames: players.map(({ username }) => username), truncated };
}

/**
 * `count` joueurs `match_00`, `match_01`… dans l'ordre des pseudos, d'identifiants « 200 »,
 * « 199 »… de même largeur : un tri par identifiant les rendrait dans l'autre sens.
 */
function matching(count: number): FollowerEntry[] {
	return Array.from({ length: count }, (_, rank) =>
		entry(String(200 - rank), `match_${String(rank).padStart(2, "0")}`),
	);
}

const usernames = (page: readonly FollowerEntry[]) =>
	page.map(({ username }) => username);

describe("recherche d'un joueur par une partie de son pseudo", () => {
	test("ARM rend armure.x puis wizard_army, sans tenir compte des majuscules : identifiant, pseudo, classe et sort de chacun", async () => {
		const wizard = entry("10", "wizard_army");
		const armure = entry("11", "armure.x");
		const db = await databaseWith([wizard, armure, entry("12", "zzz")]);
		const pool = await readDrawablePool(db);
		const names = new Map(
			(await listSpells(db)).map(({ number, name }) => [number, name]),
		);
		const found = ({ id, username }: FollowerEntry) => {
			const number = Number(drawSpell(id, pool));
			return {
				instagramId: id,
				username,
				class: characterOf(id).class,
				spell: { number, name: names.get(number) },
			};
		};
		expect(await searchPlayers(db, "ARM")).toEqual({
			players: [found(armure), found(wizard)],
			truncated: false,
		});
	});

	// Chaque métacaractère de `LIKE` pris littéralement, avec ses témoins : des joueurs qu'il
	// rendrait s'il agissait. Aucun pseudo ne peut porter `%` ni `\` (`players_username_check`).
	// `\` seul ne témoigne de rien : non échappé, le motif `%\%` cherche un `%` littéral et ne rend
	// personne non plus ; `a\b` non échappé cherche `ab`.
	test.each<[string, string, string[], string[]]>([
		["_", "a_b", ["a_b", "axb"], ["a_b"]],
		["%", "%", ["abc", "a_b"], []],
		["\\", "a\\b", ["ab", "a_b"], []],
	])(
		"%s est littéral : « %s » parmi %j rend %j",
		async (_, fragment, present, expected) => {
			const db = await databaseWith(
				present.map((username, rank) => entry(String(rank + 1), username)),
			);
			expect(await usernamesFound(db, fragment)).toEqual({
				usernames: expected,
				truncated: false,
			});
		},
	);

	test("25 correspondances rendent les 20 premières par pseudo, et la liste tronquée", async () => {
		const page = matching(25);
		const db = await databaseWith([...page.toReversed(), entry("1", "autre")]);
		expect(await usernamesFound(db, "match")).toEqual({
			usernames: usernames(page.slice(0, 20)),
			truncated: true,
		});
	});

	test("exactement 20 correspondances rendent la liste entière, non tronquée", async () => {
		const page = matching(20);
		const db = await databaseWith(page.toReversed());
		expect(await usernamesFound(db, "match")).toEqual({
			usernames: usernames(page),
			truncated: false,
		});
	});

	test("le tri suit l'ordre des octets, quelle que soit la collation de la base : Zoe avant azo", async () => {
		const db = await databaseWith([entry("1", "azo"), entry("2", "Zoe")]);
		expect((await usernamesFound(db, "z")).usernames).toEqual(["Zoe", "azo"]);
	});

	test("deux joueurs au même pseudo se départagent par identifiant", async () => {
		const db = await databaseWith([entry("2", "jumeau"), entry("1", "jumeau")]);
		const { players } = await searchPlayers(db, "jumeau");
		expect(players.map(({ instagramId }) => instagramId)).toEqual(["1", "2"]);
	});
});
