import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("Vercel Schedules appelle /api/tic chaque heure à l'heure de Paris, en POST, sa méthode par défaut et la seule de la route", () => {
	const { schedules } = JSON.parse(
		readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
	);
	expect(schedules).toEqual({
		tic: { schedule: "0 * * * *", timezone: "Europe/Paris", path: "/api/tic" },
	});
});
