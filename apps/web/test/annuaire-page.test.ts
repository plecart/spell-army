import { excludedPlayers } from "donnees";
import { createMigratedDatabase } from "donnees/test/base-de-test";
import { writePage } from "joueurs";
import { idsOf } from "personnages/test/identifiants";
import { describe, expect, inject, onTestFinished, test, vi } from "vitest";
import { elementsOf, linksOf, render, textOf } from "./balisage.ts";

/** La page de l'annuaire et le client qu'elle ouvre, évalués à neuf sur une base migrée neuve. */
async function importPage() {
	vi.stubEnv(
		"DATABASE_URL",
		await createMigratedDatabase(inject("testDatabaseUrl")),
	);
	vi.resetModules();
	const [{ default: Home }, { database }] = await Promise.all([
		import("../app/page.tsx"),
		import("../app/environment.ts"),
	]);
	onTestFinished(() => database().$client.end());
	return { Home, db: database() };
}

describe("page de l'annuaire", () => {
	test("elle lit la recherche et le filtre de l'adresse, et ne rend que les recrues visibles qui les portent", async () => {
		const { Home, db } = await importPage();
		const [kept = "", removed = "", other = ""] = idsOf("golem", 3);
		const [wizard = ""] = idsOf("wizard", 1);
		await writePage(db, [
			{ id: kept, username: "arm_golem" },
			{ id: removed, username: "arm_retire" },
			{ id: other, username: "autre_golem" },
			{ id: wizard, username: "arm_mage" },
		]);
		await db.insert(excludedPlayers).values({ instagramId: removed });
		const html = render(
			await Home({
				params: Promise.resolve({}),
				searchParams: Promise.resolve({ q: "ARM", classe: "golem" }),
			}),
		);
		expect(elementsOf(html, "li", "card").map(textOf)).toEqual([
			"@arm_golem Golem",
		]);
		expect(elementsOf(html, "p", "counter").map(textOf)).toEqual([
			"1 recrue · 1 classe",
		]);
		const [sheet = ""] = elementsOf(html, "dialog", "sheet");
		expect(linksOf(sheet).slice(0, 3)).toEqual([
			{ href: "/?q=ARM", text: "Toutes les classes 2" },
			{ href: "/?q=ARM&classe=magicien", text: "Magicien 1" },
			{ href: "/?q=ARM&classe=golem", text: "Golem 1" },
		]);
	});
});
