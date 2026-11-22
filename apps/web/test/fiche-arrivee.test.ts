import { expect, test } from "vitest";
import { arrivalOf } from "../app/fiche/arrival.ts";

test.each([
	[
		"se lit au fuseau de Paris : 23 h 30 UTC le 8 y est le 9",
		"2026-11-08T23:30:00Z",
		"Recrue depuis le 9 novembre 2026",
	],
	[
		"le premier du mois s'écrit « 1er »",
		"2026-12-01T10:00:00Z",
		"Recrue depuis le 1er décembre 2026",
	],
	[
		"porte l'année de Paris : 23 h 30 UTC le 31 décembre y est le 1er janvier",
		"2026-12-31T23:30:00Z",
		"Recrue depuis le 1er janvier 2027",
	],
])("la date d'arrivée %s", (_, instant, arrival) => {
	expect(arrivalOf(new Date(instant))).toBe(arrival);
});
