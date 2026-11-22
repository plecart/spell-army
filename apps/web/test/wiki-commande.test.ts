import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createClient, EMPTY_DATABASE_URL, updateSpell } from "donnees";
import { createMigratedDatabase } from "donnees/test/base-de-test";
import { describe, expect, inject, onTestFinished, test } from "vitest";
import { runScript } from "./commande.ts";
import { emptyFolder, filesOf, outputFolder } from "./wiki.ts";

/** Lance `wiki.ts` par Node, hors de Vitest, depuis `cwd` : son code de sortie et ses deux flux. */
const runWiki = (
	args: string[],
	env: Record<string, string | undefined>,
	cwd?: string,
) => runScript("wiki.ts", args, env, cwd);

const USAGE = "Usage : pnpm --filter web wiki <dossier>\n";
const EMPTY_URL = `${EMPTY_DATABASE_URL}\n`;

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

	// Lancée depuis un dossier vide, qui est aussi son `INIT_CWD` : rien ne doit y apparaître. Sous
	// `DATABASE_URL` vide, des arguments admis s'arrêtent au refus de la base.
	test.each([
		{ form: "sans dossier", args: [], url: "", stderr: USAGE },
		{ form: "deux dossiers", args: ["wiki", "autre"], url: "", stderr: USAGE },
		{ form: "un dossier vide", args: [""], url: "", stderr: USAGE },
		{
			form: "une option inconnue",
			args: ["--force", "wiki"],
			url: "",
			stderr: expect.stringContaining("'--force'"),
		},
		{
			form: "un dossier après « -- », admis jusqu'à la base",
			args: ["--", "wiki"],
			url: "",
			stderr: EMPTY_URL,
		},
		{ form: "DATABASE_URL vide", args: ["wiki"], url: "", stderr: EMPTY_URL },
		{
			form: "DATABASE_URL absente",
			args: ["wiki"],
			url: undefined,
			stderr: EMPTY_URL,
		},
	])(
		"$form : sortie 1, la raison, et rien n'est écrit",
		async ({ args, url, stderr }) => {
			const launch = await emptyFolder();
			expect(
				await runWiki(args, { DATABASE_URL: url, INIT_CWD: launch }, launch),
			).toEqual({ code: 1, stdout: "", stderr });
			expect(await readdir(launch)).toEqual([]);
		},
	);

	// pnpm pose `INIT_CWD` au dossier où la commande est lancée, et le dossier courant à celui du
	// paquet : un dossier relatif se lit depuis le premier, à défaut depuis le second.
	test.each([
		{
			form: "INIT_CWD posé : écrit depuis le dossier de lancement",
			initCwd: (launch: string) => launch,
			from: "launch",
		},
		{
			form: "sans INIT_CWD : écrit depuis le dossier courant",
			initCwd: () => undefined,
			from: "current",
		},
	] as const)("un dossier relatif, $form", async ({ initCwd, from }) => {
		const url = await createMigratedDatabase(inject("testDatabaseUrl"));
		const folders = {
			launch: await emptyFolder(),
			current: await emptyFolder(),
		};
		const target = join(folders[from], "wiki");
		expect(
			await runWiki(
				["wiki"],
				{ DATABASE_URL: url, INIT_CWD: initCwd(folders.launch) },
				folders.current,
			),
		).toEqual({
			code: 0,
			stdout: `Wiki écrit dans ${target} : 36 pages, 0 image.\n`,
			stderr: "",
		});
		expect(existsSync(join(target, "Home.md"))).toBe(true);
	});
});
