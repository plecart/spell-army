import { readdirSync, readFileSync } from "node:fs";
import { excludedPlayers } from "donnees";
import { createMigratedDatabase } from "donnees/test/base-de-test";
import { writePage } from "joueurs";
import { idsOf } from "personnages/test/identifiants";
import {
	Children,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react";
import { describe, expect, inject, onTestFinished, test, vi } from "vitest";
import type { SheetClose } from "../app/fiche/sheet.tsx";
import { elementsOf, render, textOf } from "./balisage.ts";

// Les pages s'appellent ici comme des fonctions, hors d'une requête et du routeur de Next.js, où
// `connection()` et le `useRouter()` de la feuille lèveraient : l'un attend, l'autre rend un routeur
// vide, que le rendu au serveur n'appelle pas.
vi.mock(import("next/server.js"), () => ({
	connection: async () => undefined,
}));
vi.mock(import("next/navigation.js"), async (importOriginal) => ({
	...(await importOriginal()),
	useRouter: () => ({}) as never,
}));

// L'erreur de `notFound()` (next 16.4.6, `client/components/not-found.js`), que Next.js rend en 404.
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

/** Les deux pages de la fiche et le client qu'elles ouvrent, évalués à neuf sur une base migrée neuve. */
async function importPages() {
	vi.stubEnv(
		"DATABASE_URL",
		await createMigratedDatabase(inject("testDatabaseUrl")),
	);
	vi.resetModules();
	const [{ default: direct }, { default: intercepted }, { database }] =
		await Promise.all([
			import("../app/recrues/[identifiant]/page.tsx"),
			import("../app/@fiche/(.)recrues/[identifiant]/page.tsx"),
			import("../app/environment.ts"),
		]);
	onTestFinished(() => database().$client.end());
	return { pages: { direct, intercepted }, db: database() };
}

type Pages = Awaited<ReturnType<typeof importPages>>["pages"];

/** L'élément que rend la page `name` de la fiche de `identifiant`. */
function pageOf(pages: Pages, name: keyof Pages, identifiant: string) {
	return pages[name]({
		params: Promise.resolve({ identifiant }),
		searchParams: Promise.resolve({}),
	});
}

/** La page `name` de la fiche de `identifiant`, rendue. */
async function renderPage(
	pages: Pages,
	name: keyof Pages,
	identifiant: string,
) {
	return render(await pageOf(pages, name, identifiant));
}

/**
 * Les destinations de fermeture que porte l'élément `page`, lues sur la prop `onClose` de sa racine
 * et de ses enfants directs : la feuille de la fiche, seule ou dans le fragment de la page.
 */
function closesOf(page: ReactElement<{ children?: ReactNode }>): SheetClose[] {
	return [page, ...Children.toArray(page.props.children)]
		.filter(isValidElement<{ onClose?: SheetClose }>)
		.flatMap((element) => element.props.onClose ?? []);
}

/**
 * Les fichiers d'`app/` dont le balisage rend la feuille de la fiche, `<FicheSheet`, en chemins à
 * barres obliques.
 */
function fichePageFiles(): string[] {
	const app = new URL("../app/", import.meta.url);
	return readdirSync(app, { recursive: true, encoding: "utf8" })
		.map((path) => path.replaceAll("\\", "/"))
		.filter(
			(path) =>
				path.endsWith(".tsx") &&
				readFileSync(new URL(path, app), "utf8").includes("<FicheSheet"),
		)
		.sort();
}

// La recrue des tests, et une autre de l'annuaire.
const [RECRUIT = "", OTHER = ""] = idsOf("vampire", 2);

describe.each<[keyof Pages, string, SheetClose]>([
	["direct", "ouverte directement", "home"],
	["intercepted", "ouverte d'un clic", "back"],
])("fiche %s (%s)", (name, _, close) => {
	/**
	 * Où se referme la feuille : en arrière, à l'annuaire laissé dans son état (fiche ouverte d'un
	 * clic), ou vers `/` (fiche ouverte d'un lien partagé, sans annuaire derrière elle). Source : les
	 * pages qui rendent la feuille de la fiche, relevées par `git grep -n "onClose" apps/web/app` le
	 * 2026-11-22 : 2 recensées ; avant ce test, 2 restaient vertes, leur destination inversée
	 * (mutation de la passe 2 de relecture de l'issue #18). Le test « seules les deux pages de la
	 * table… » recompte la population à chaque exécution.
	 */
	test(`se referme vers « ${close} »`, async () => {
		const { pages, db } = await importPages();
		await writePage(db, [{ id: RECRUIT, username: "nathan_croque" }]);
		expect(closesOf(await pageOf(pages, name, RECRUIT))).toEqual([close]);
	});

	test("une recrue visible : sa fiche, dans une feuille que nomme son titre", async () => {
		const { pages, db } = await importPages();
		await writePage(db, [{ id: RECRUIT, username: "nathan_croque" }]);
		// Les feuilles qui portent une fiche ; la page directe porte aussi celle du filtre.
		const sheets = elementsOf(
			await renderPage(pages, name, RECRUIT),
			"dialog",
			"sheet",
		).filter((dialog) => dialog.includes('<article class="fiche"'));
		expect(sheets).toHaveLength(1);
		const [sheet = ""] = sheets;
		expect(sheet).toMatch(
			/^<dialog class="sheet" aria-labelledby="fiche-title"><div class="sheet-body"><button [^>]*aria-label="Fermer"/,
		);
		expect(sheet).toContain('<h2 id="fiche-title">@nathan_croque</h2>');
	});

	test.each<
		[
			string,
			(db: Awaited<ReturnType<typeof importPages>>["db"]) => Promise<unknown>,
			string,
		]
	>([
		[
			"retirée, dans excluded_players",
			(db) => db.insert(excludedPlayers).values({ instagramId: RECRUIT }),
			RECRUIT,
		],
		["absente de players", async () => undefined, OTHER],
		["à l'identifiant hors forme", async () => undefined, "abc"],
	])("une recrue %s : 404", async (_, setUp, identifiant) => {
		const { pages, db } = await importPages();
		await writePage(db, [{ id: RECRUIT, username: "nathan_croque" }]);
		await setUp(db);
		await expect(renderPage(pages, name, identifiant)).rejects.toMatchObject(
			NOT_FOUND,
		);
	});
});

test("seules les deux pages de la table rendent la feuille de la fiche", () => {
	expect(fichePageFiles()).toEqual([
		"@fiche/(.)recrues/[identifiant]/page.tsx",
		"recrues/[identifiant]/page.tsx",
	]);
});

test("ouverte directement, la fiche se pose sur l'annuaire à sa page 1, sans filtre", async () => {
	const { pages, db } = await importPages();
	await writePage(db, [
		{ id: RECRUIT, username: "nathan_croque" },
		{ id: OTHER, username: "autre_vampire" },
	]);
	const html = await renderPage(pages, "direct", RECRUIT);
	expect(elementsOf(html, "li", "card").map(textOf).sort()).toEqual([
		"@autre_vampire Vampire",
		"@nathan_croque Vampire",
	]);
	expect(elementsOf(html, "p", "counter").map(textOf)).toEqual([
		"2 recrues · 1 classe",
	]);
	expect(html.indexOf('<main class="directory">')).toBeLessThan(
		html.indexOf('<dialog class="sheet"'),
	);
});

test("ouverte d'un clic, la fiche vient seule : l'annuaire reste celui laissé derrière", async () => {
	const { pages, db } = await importPages();
	await writePage(db, [{ id: RECRUIT, username: "nathan_croque" }]);
	const html = await renderPage(pages, "intercepted", RECRUIT);
	expect(html).not.toContain('class="directory"');
});
