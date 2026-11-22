import { existsSync } from "node:fs";
import { createClient, EMPTY_DATABASE_URL, updateSpell } from "donnees";
import { createMigratedDatabase } from "donnees/test/base-de-test";
import { describe, expect, inject, onTestFinished, test } from "vitest";
import { runScript } from "./commande.ts";
import { filesOf, outputFolder } from "./wiki.ts";

/** Lance `wiki.ts` par Node, hors de Vitest : son code de sortie et ses deux flux. */
const runWiki = (args: string[], env: Record<string, string>) =>
	runScript("wiki.ts", args, env);

// La frontière que les tests en processus ne voient pas : Node, sans Vitest, charge la commande, ses
// paquets et le pilote de la base, lit la table `spells`, puis ferme le pool pour sortir.
describe("la commande wiki, lancée par Node", () => {
	test("sur une base migrée où le sort n° 6 a une image : sortie 0, le bilan, les 36 pages et l'image", async () => {
		const url = await createMigratedDatabase(inject("testDatabaseUrl"));
		const db = createClient(url);
		onTestFinished(() => db.$client.end());
		const bytes = [137, 80, 78, 71];
		await updateSpell(db, 6, {
			image: { bytes: new Uint8Array(bytes), type: "image/png" },
		});
		const folder = await outputFolder();
		expect(await runWiki([folder], { DATABASE_URL: url })).toEqual({
			code: 0,
			stdout: `Wiki écrit dans ${folder} : 36 pages, 1 image.\n`,
			stderr: "",
		});
		const files = await filesOf(folder);
		expect(files).toHaveLength(36 + 1);
		expect(files).toContain("images/sort-6.png");
	});

	test("DATABASE_URL vide : sortie 1, le message de la migration, et rien n'est écrit", async () => {
		const folder = await outputFolder();
		expect(await runWiki([folder], { DATABASE_URL: "" })).toEqual({
			code: 1,
			stdout: "",
			stderr: `${EMPTY_DATABASE_URL}\n`,
		});
		expect(existsSync(folder)).toBe(false);
	});

	test("sans dossier : sortie 1, l'usage", async () => {
		expect(await runWiki([], { DATABASE_URL: "" })).toEqual({
			code: 1,
			stdout: "",
			stderr: "Usage : pnpm --filter web wiki <dossier>\n",
		});
	});
});
