import { type Executor, importPasses } from "donnees";
import { freshDatabase } from "donnees/test/base-neuve";
import { acquireImportLock, type FollowerProvider, listPasses } from "joueurs";
import { FakeFollowerProvider, followers } from "joueurs/test/faux-fournisseur";
import { describe, expect, test, vi } from "vitest";
import { followerProvider } from "../app/environment.ts";
import { createTickEndpoint } from "../app/tick.ts";
import { TICK_SECRET, tickRequest } from "./montage.ts";

const INSTANT = expect.stringMatching(
	/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/,
);
const NONE_DISCARDED = { identifiant_invalide: 0, pseudo_invalide: 0 };

/** Le tic sur `db` et le fournisseur `provider`, sous le secret `TICK_SECRET`. */
function tickOn(db: Executor, provider: () => FollowerProvider) {
	return createTickEndpoint({
		secret: () => TICK_SECRET,
		database: () => db,
		provider,
	});
}

/** Le statut et le corps JSON d'une réponse. */
async function read(response: Response) {
	return { status: response.status, body: await response.json() };
}

describe("tic de l'import, sur la base de test", () => {
	test("sans CRON_SECRET valide : 401, sans rien lire chez le fournisseur ni rien écrire au journal", async () => {
		const db = await freshDatabase();
		const provider = new FakeFollowerProvider(followers(3));
		const response = await tickOn(
			db,
			() => provider,
		)(tickRequest({ authorization: `Bearer ${"u".repeat(32)}` }));
		expect(response.status).toBe(401);
		expect(provider.cursors).toEqual([]);
		expect(await db.$count(importPasses)).toBe(0);
	});

	test("avec le secret : 200, et le corps rend les passes du tic, celles du journal, sous le vocabulaire des outils, sans curseur ni identifiant", async () => {
		const db = await freshDatabase();
		const provider = new FakeFollowerProvider(followers(3), { pageSize: 2 });
		const { status, body } = await read(
			await tickOn(db, () => provider)(tickRequest()),
		);
		expect({ status, body }).toEqual({
			status: 200,
			body: {
				passes: [
					{
						type: "rapide",
						declencheur: "tic",
						etat: "terminee",
						debut: INSTANT,
						fin: INSTANT,
						pages: 2,
						ajouts: 3,
						ecartes: NONE_DISCARDED,
						erreur: null,
					},
					{
						type: "complete",
						declencheur: "hebdomadaire",
						etat: "terminee",
						debut: INSTANT,
						fin: INSTANT,
						pages: 2,
						ajouts: 0,
						ecartes: NONE_DISCARDED,
						erreur: null,
					},
				],
				erreur_nombre_abonnes: null,
			},
		});
		const journal = (await listPasses(db, 10)).toReversed();
		expect(body.passes.map(({ debut }: { debut: string }) => debut)).toEqual(
			journal.map(({ startedAt }) => startedAt.toISOString()),
		);
	});

	test("le fournisseur en échec : 500, et le corps rend les passes en erreur sans le curseur que la complète garde au journal", async () => {
		const db = await freshDatabase();
		const provider = new FakeFollowerProvider(followers(4), { pageSize: 2 });
		provider.failingPage = 2;
		const response = await tickOn(db, () => provider)(tickRequest());
		const text = await response.text();
		expect(response.status).toBe(500);
		expect(JSON.parse(text)).toMatchObject({
			passes: [
				{
					type: "rapide",
					etat: "en_erreur",
					pages: 1,
					erreur: "panne injectée à la page 2",
				},
				{
					type: "complete",
					etat: "en_erreur",
					pages: 1,
					erreur: "panne injectée à la page 2",
				},
			],
			erreur_nombre_abonnes: null,
		});
		const cursors = await db
			.select({ cursor: importPasses.cursor })
			.from(importPasses);
		expect(cursors).toContainEqual({ cursor: provider.cursorOf(2) });
		expect(text).not.toContain(String(provider.cursorOf(2)));
	});

	test("la lecture du nombre d'abonnés en échec : 500, et le corps rend son erreur", async () => {
		const db = await freshDatabase();
		const provider = new FakeFollowerProvider(followers(3));
		// Le premier tic part en complète de la semaine ; le second, sous les 7 jours, lit le nombre
		// d'abonnés pour l'auto-contrôle.
		expect((await tickOn(db, () => provider)(tickRequest())).status).toBe(200);
		provider.failingFollowerCount = true;
		const { status, body } = await read(
			await tickOn(db, () => provider)(tickRequest()),
		);
		expect(status).toBe(500);
		expect(body).toMatchObject({
			passes: [{ type: "rapide", etat: "terminee" }],
			erreur_nombre_abonnes: "panne injectée au nombre d'abonnés",
		});
	});

	test("le verrou pris par une autre passe : 200, le corps le dit, et rien n'est lu ni écrit au journal", async () => {
		const db = await freshDatabase();
		await acquireImportLock(db, new Date());
		const provider = new FakeFollowerProvider(followers(3));
		expect(await read(await tickOn(db, () => provider)(tickRequest()))).toEqual(
			{
				status: 200,
				body: { message: "passe en cours : ce tic n'a rien fait" },
			},
		);
		expect(provider.cursors).toEqual([]);
		expect(await db.$count(importPasses)).toBe(0);
	});

	// Une configuration que l'adaptateur refuse, par réglage : la clé absente, le compte absent ou hors
	// de sa forme. Les formes refusées se dénombrent dans `joueurs` (`test/hikerapi.test.ts`).
	test.each<[string, string | undefined, string | undefined]>([
		["sans clé HikerAPI", undefined, "17841400000000000"],
		["sans compte lu", "cle-factice", undefined],
		["un compte à zéro de tête", "cle-factice", "017841400000000000"],
	])(
		"%s : 500 au message fixe, sans aucune valeur, et rien d'écrit au journal",
		async (_, accessKey, accountId) => {
			vi.stubEnv("HIKERAPI_ACCESS_KEY", accessKey);
			vi.stubEnv("INSTAGRAM_ACCOUNT_ID", accountId);
			const serverLog = vi.spyOn(console, "error").mockReturnValue();
			const db = await freshDatabase();
			expect(
				await read(await tickOn(db, followerProvider)(tickRequest())),
			).toEqual({
				status: 500,
				body: { message: "configuration de l'import incomplète" },
			});
			expect(await db.$count(importPasses)).toBe(0);
			expect(serverLog).toHaveBeenCalledWith(
				"Tic : configuration de l'import incomplète",
				expect.objectContaining({
					message: expect.stringMatching(/^configuration HikerAPI : /),
				}),
			);
		},
	);

	test("une erreur de la base : 500 au message fixe, jamais celui de l'erreur, journalisée côté serveur", async () => {
		const db = await freshDatabase();
		await db.$client.query("drop table import_passes");
		const serverLog = vi.spyOn(console, "error").mockReturnValue();
		const response = await tickOn(
			db,
			() => new FakeFollowerProvider(followers(3)),
		)(tickRequest());
		const text = await response.text();
		expect({ status: response.status, body: JSON.parse(text) }).toEqual({
			status: 500,
			body: { message: "tic interrompu par une erreur" },
		});
		expect(text).not.toContain("import_passes");
		expect(serverLog).toHaveBeenCalledWith(
			"Tic : tic interrompu par une erreur",
			expect.objectContaining({
				cause: expect.objectContaining({
					message: 'relation "import_passes" does not exist',
				}),
			}),
		);
	});
});
