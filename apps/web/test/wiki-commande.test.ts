import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createClient, EMPTY_DATABASE_URL, updateSpell } from "donnees";
import { createMigratedDatabase } from "donnees/test/base-de-test";
import { describe, expect, inject, onTestFinished, test } from "vitest";
import { runScript } from "./commande.ts";
import { emptyFolder, filesOf, IMAGE_BYTES, outputFolder } from "./wiki.ts";

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
		await updateSpell(db, 6, {
			image: { bytes: new Uint8Array(IMAGE_BYTES), type: "image/png" },
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

	// Une base qui ne répond pas, une URL illisible, un refus de Postgres : la raison s'affiche, nommée
	// par son code — le message de ces erreurs cite l'hôte, le port, le rôle ou la base —, et rien de
	// `DATABASE_URL` n'en sort, ni son mot de passe, ni sa base.
	const SECRET = "TEMOIN_SECRET";
	const ABSENT_BASE = "temoin_base_absente";
	test.each([
		{
			form: "une base injoignable",
			url: () => `postgres://u:${SECRET}@127.0.0.1:9/x`,
			reason: "connect ECONNREFUSED",
		},
		{
			form: "une URL illisible",
			url: () => `postgres://u:${SECRET}@127.0.0.1:99999/x`,
			reason: "code ERR_INVALID_URL",
		},
		{
			form: "une base absente du serveur",
			url: () => {
				const url = new URL(inject("testDatabaseUrl"));
				url.pathname = `/${ABSENT_BASE}`;
				return url.href;
			},
			reason: "code 3D000",
		},
		// pg 8.23.1 garde dans son pool le client dont la connexion a levé sur ce port : sans la
		// fermeture bornée, Node sortait en 13 sans raison (#55).
		{
			form: "un port qui n'est pas un nombre",
			url: () => `postgresql://u:${SECRET}@127.0.0.1/${ABSENT_BASE}?port=abc`,
			reason: "code ERR_SOCKET_BAD_PORT",
		},
		// L'erreur sans code de pg (connection-parameters.js, pg 8.23.1) cite entre guillemets la
		// valeur d'un paramètre de l'URL : le message est masqué du premier au dernier guillemet, même
		// quand la valeur en porte un.
		{
			form: "un paramètre d'URL refusé",
			url: () =>
				`postgres://u:${SECRET}@127.0.0.1:9/x?sslnegotiation=${ABSENT_BASE}`,
			reason: 'Invalid sslnegotiation value: "…"',
		},
		{
			form: "un paramètre d'URL refusé, à guillemet",
			url: () =>
				`postgres://u:${SECRET}@127.0.0.1:9/x?sslnegotiation=a%22${ABSENT_BASE}`,
			reason: 'Invalid sslnegotiation value: "…"',
		},
	])(
		"$form : sortie 1, la raison, rien de DATABASE_URL, et rien n'est écrit",
		async ({ url, reason }) => {
			const launch = await emptyFolder();
			const run = await runWiki(
				["wiki"],
				{ DATABASE_URL: url(), INIT_CWD: launch },
				launch,
			);
			expect(run).toEqual({
				code: 1,
				stdout: "",
				stderr: `La lecture des sorts a échoué : ${reason}.\n`,
			});
			for (const part of [SECRET, ABSENT_BASE]) {
				expect(run.stderr).not.toContain(part);
			}
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
