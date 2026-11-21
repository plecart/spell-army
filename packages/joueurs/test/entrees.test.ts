import {
	LONG_ID,
	LONGEST_USERNAME,
	MALFORMED_IDS,
	MALFORMED_USERNAMES,
} from "donnees/test/formes-instagram";
import { describe, expect, test } from "vitest";
import { screenEntries } from "../src/index.ts";

describe("tri des entrées d'une page", () => {
	test("une entrée bien formée est gardée telle que reçue, aux bornes de la forme comprises", () => {
		const entries = [
			{ id: "12", username: "a" },
			{ id: LONG_ID, username: LONGEST_USERNAME },
		];
		expect(screenEntries(entries)).toEqual({
			entries,
			invalidIds: 0,
			invalidUsernames: 0,
		});
	});

	test.each(MALFORMED_IDS)(
		"%s : écarté et compté comme identifiant invalide",
		(_, id) => {
			expect(screenEntries([{ id, username: "douze" }])).toEqual({
				entries: [],
				invalidIds: 1,
				invalidUsernames: 0,
			});
		},
	);

	test.each(MALFORMED_USERNAMES)(
		"%s : écarté et compté comme pseudo invalide",
		(_, username) => {
			expect(screenEntries([{ id: "12", username }])).toEqual({
				entries: [],
				invalidIds: 0,
				invalidUsernames: 1,
			});
		},
	);

	test("l'identifiant se juge d'abord : une entrée aux deux champs invalides compte comme identifiant invalide", () => {
		expect(screenEntries([{ id: "007", username: "a b" }])).toEqual({
			entries: [],
			invalidIds: 1,
			invalidUsernames: 0,
		});
	});

	test("un identifiant en double ne garde que sa première entrée bien formée", () => {
		expect(
			screenEntries([
				{ id: "12", username: "a b" },
				{ id: "12", username: "premier" },
				{ id: "13", username: "treize" },
				{ id: "12", username: "second" },
			]),
		).toEqual({
			entries: [
				{ id: "12", username: "premier" },
				{ id: "13", username: "treize" },
			],
			invalidIds: 0,
			invalidUsernames: 1,
		});
	});

	test("chaque entrée écartée compte, même répétée", () => {
		expect(
			screenEntries([
				{ id: "abc", username: "douze" },
				{ id: "abc", username: "douze" },
			]),
		).toMatchObject({ invalidIds: 2 });
	});
});
