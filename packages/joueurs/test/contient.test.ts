import { freshDatabase } from "donnees/test/base-neuve";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { containsIgnoringCase } from "../src/search.ts";

describe("un texte contient un fragment, sans tenir compte des majuscules", () => {
	// Chaque métacaractère de `LIKE` avec son témoin : un texte qu'il rendrait s'il agissait.
	test.each<[string, string, boolean]>([
		["wizard_army", "ARM", true],
		["WIZARD_ARMY", "arm", true],
		["wizard", "arm", false],
		["a_b", "_", true],
		["axb", "_", false],
		["a%b", "%", true],
		["abc", "%", false],
		["a\\b", "\\", true],
		["ab", "\\", false],
	])("« %s » contient « %s » : %s", async (text, fragment, found) => {
		const db = await freshDatabase();
		const { rows } = await db.execute(
			sql`select ${containsIgnoringCase(sql`${text}`, fragment)} as found`,
		);
		expect(rows).toEqual([{ found }]);
	});
});
