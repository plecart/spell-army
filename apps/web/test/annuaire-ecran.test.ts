import type { VisiblePlayersPage } from "joueurs";
import { BACKDROPS } from "personnages";
import { createElement } from "react";
import { describe, expect, test } from "vitest";
import type { DirectoryQuery } from "../app/annuaire/address.ts";
import { Directory } from "../app/annuaire/directory.tsx";
import { classCounts, emptyPage, NO_QUERY, recruit } from "./annuaire.ts";
import { elementsOf, linksOf, render, textOf } from "./balisage.ts";

function renderDirectory(
	query: DirectoryQuery,
	result: Partial<VisiblePlayersPage>,
): string {
	return render(createElement(Directory, { query, result: emptyPage(result) }));
}

// Une armée de 1 284 recrues des huit classes, dont 12 golems.
const ARMY = classCounts({
	wizard: 160,
	golem: 12,
	warrior: 170,
	dwarf: 165,
	vampire: 190,
	druid: 187,
	peasant: 200,
	fairy: 200,
});

// La recherche « arm », le filtre Golem, la page 2.
const FILTERED: DirectoryQuery = { search: "arm", classKey: "golem", page: 2 };

// Le séparateur des milliers en français : l'espace fine insécable (Intl, locale « fr-FR »).
const THIN = "\u202f";

describe("en-tête de l'annuaire", () => {
	test("la banderole et le chapeau, textes fixes, avant le titre puis après", () => {
		expect(textOf(renderDirectory(NO_QUERY, {}))).toMatch(
			/^SAISON 1 · L'ARMÉE SE RASSEMBLE L'armée Chaque abonné du compte est une recrue, avec sa classe, ses stats et son sort\. Trouve la tienne\. /,
		);
	});
});

describe("recherche", () => {
	// Le formulaire de la zone de recherche (`<search>`).
	const searchFormOf = (html: string) =>
		elementsOf(html, "search", "search")[0]?.match(
			/<form [\s\S]*<\/form>/,
		)?.[0];

	test("un formulaire GET vers l'annuaire, au champ « q » prérempli, qui garde la classe du filtre et revient à la page 1", () => {
		const form = searchFormOf(
			renderDirectory(FILTERED, { total: 12, classCounts: ARMY }),
		);
		const opening = form?.match(/^<form [^>]*>/)?.[0];
		expect(opening).toContain('action="/"');
		expect(opening).toContain('method="get"');
		expect(form).toMatch(/<input [^>]*name="q"[^>]*value="arm"/);
		expect(form).toMatch(/<input [^>]*placeholder="Ton pseudo Instagram"/);
		expect(form).toContain(
			'<input type="hidden" name="classe" value="golem"/>',
		);
		expect(form).not.toContain('name="page"');
	});

	test("sans filtre, la recherche ne porte aucune classe", () => {
		const form = searchFormOf(renderDirectory(NO_QUERY, {}));
		expect(form).toMatch(/<input [^>]*name="q"/);
		expect(form).not.toContain('name="classe"');
	});
});

describe("feuille du filtre", () => {
	test("« Toutes les classes » puis les huit classes, chacune avec son nombre ; chaque lien garde la recherche et revient à la page 1", () => {
		const html = renderDirectory(FILTERED, {
			total: 12,
			classCounts: ARMY,
			page: 2,
			pageCount: 2,
		});
		const [sheet = ""] = elementsOf(html, "dialog", "sheet");
		expect(linksOf(sheet)).toEqual([
			{ href: "/?q=arm", text: `Toutes les classes 1${THIN}284` },
			{ href: "/?q=arm&classe=magicien", text: "Magicien 160" },
			{ href: "/?q=arm&classe=golem", text: "Golem 12" },
			{ href: "/?q=arm&classe=guerrier", text: "Guerrier 170" },
			{ href: "/?q=arm&classe=nain", text: "Nain 165" },
			{ href: "/?q=arm&classe=vampire", text: "Vampire 190" },
			{ href: "/?q=arm&classe=druide", text: "Druide 187" },
			{ href: "/?q=arm&classe=paysan", text: "Paysan 200" },
			{ href: "/?q=arm&classe=fee", text: "Fée 200" },
		]);
	});

	// Le texte des liens marqués comme courants.
	const currentLinks = (html: string) =>
		[...html.matchAll(/<a [^>]*aria-current="true"[^>]*>([\s\S]*?)<\/a>/g)].map(
			([, inner = ""]) => textOf(inner),
		);

	test.each<[string, DirectoryQuery, string]>([
		[
			"sans filtre, « Toutes les classes »",
			NO_QUERY,
			`Toutes les classes 1${THIN}284`,
		],
		["sous le filtre Golem, « Golem »", FILTERED, "Golem 12"],
	])("%s est marquée comme courante", (_, query, current) => {
		expect(currentLinks(renderDirectory(query, { classCounts: ARMY }))).toEqual(
			[current],
		);
	});

	test("un dialogue nommé, ouvert par un bouton qui dit ce qu'il ouvre, et qu'un bouton « Fermer » referme", () => {
		const html = renderDirectory(NO_QUERY, {});
		expect(html).toMatch(
			/<button type="button" class="icon-button" aria-label="Filtrer par classe" aria-haspopup="dialog">/,
		);
		const [sheet = ""] = elementsOf(html, "dialog", "sheet");
		const label = sheet.match(/^<dialog [^>]*aria-labelledby="([^"]+)"/)?.[1];
		expect(sheet).toContain(`<h2 id="${label}">Filtrer par classe</h2>`);
		expect(sheet).toMatch(
			/<form method="dialog"><button [^>]*aria-label="Fermer"[^>]*>/,
		);
	});
});

describe("étiquette du filtre", () => {
	test("le filtre actif s'affiche en étiquette, dont le lien le retire en gardant la recherche", () => {
		const html = renderDirectory(FILTERED, { total: 12, classCounts: ARMY });
		expect(elementsOf(html, "a", "chip")).toEqual([
			'<a class="chip" href="/?q=arm" aria-label="Retirer le filtre Golem">Golem<span aria-hidden="true">×</span></a>',
		]);
	});

	test("sans filtre, pas d'étiquette", () => {
		expect(elementsOf(renderDirectory(NO_QUERY, {}), "a", "chip")).toEqual([]);
	});
});

describe("compteur", () => {
	test.each<[string, string, DirectoryQuery, Partial<VisiblePlayersPage>]>([
		[
			"toutes les classes",
			`1${THIN}284 recrues · 8 classes`,
			NO_QUERY,
			{ total: 1284, classCounts: ARMY },
		],
		[
			"sous le filtre Golem",
			"12 recrues · 1 classe",
			FILTERED,
			{ total: 12, classCounts: ARMY },
		],
		[
			"une seule recrue",
			"1 recrue · 1 classe",
			NO_QUERY,
			{ total: 1, classCounts: classCounts({ fairy: 1 }) },
		],
		[
			"deux recrues de deux classes",
			"2 recrues · 2 classes",
			NO_QUERY,
			{ total: 2, classCounts: classCounts({ fairy: 1, golem: 1 }) },
		],
	])("%s : « %s »", (_, counter, query, result) => {
		expect(
			elementsOf(renderDirectory(query, result), "p", "counter").map(textOf),
		).toEqual([counter]);
	});
});

describe("cartes", () => {
	test("une carte par recrue, dans l'ordre : la vignette au décor de sa classe, @pseudo, pastille et nom de la classe", () => {
		const cards = elementsOf(
			renderDirectory(NO_QUERY, {
				players: [
					recruit("1", "noahbois", "fairy"),
					recruit("2", "nina_lit", "golem"),
				],
				total: 2,
				classCounts: classCounts({ fairy: 1, golem: 1 }),
			}),
			"li",
			"card",
		);
		expect(cards.map(textOf)).toEqual(["@noahbois Fée", "@nina_lit Golem"]);
		expect(cards[0]).toContain("--class-color:#3f9c95");
		expect(cards[0]).toContain(encodeURIComponent(BACKDROPS.fairy));
		expect(cards[1]).toContain("--class-color:#857c6c");
		expect(cards[1]).toContain(encodeURIComponent(BACKDROPS.golem));
	});
});

describe("pages", () => {
	test.each<[number, (string | null)[]]>([
		[1, [null, "/?q=arm&classe=golem&page=2"]],
		[2, ["/?q=arm&classe=golem", "/?q=arm&classe=golem&page=3"]],
		[3, ["/?q=arm&classe=golem&page=2", null]],
	])(
		"page %i sur 3 : « Précédente » et « Suivante » mènent aux pages voisines, sous la même recherche et le même filtre, et se désactivent aux bornes",
		(page, [previous, next]) => {
			const [nav = ""] = elementsOf(
				renderDirectory(FILTERED, {
					total: 60,
					classCounts: ARMY,
					page,
					pageCount: 3,
				}),
				"nav",
				"pagination",
			);
			expect(textOf(nav)).toBe(`Précédente Page ${page} sur 3 Suivante`);
			expect(linksOf(nav)).toEqual(
				[
					previous && { href: previous, text: "Précédente" },
					next && { href: next, text: "Suivante" },
				].filter(Boolean),
			);
		},
	);
});

describe("états vides", () => {
	test.each<[string, string, DirectoryQuery]>([
		[
			"ni recherche ni filtre",
			"L'armée attend ses premières recrues.",
			NO_QUERY,
		],
		[
			"une recherche",
			"Aucune recrue ne porte ce pseudo.",
			{ ...NO_QUERY, search: "zzz" },
		],
		[
			"un filtre",
			"Aucune recrue ne porte ce pseudo.",
			{ ...NO_QUERY, classKey: "golem" },
		],
	])(
		"aucune recrue, sous %s : « %s », sans compteur ni pages",
		(_, message, query) => {
			const html = renderDirectory(query, {});
			expect(elementsOf(html, "p", "empty").map(textOf)).toEqual([message]);
			expect(elementsOf(html, "p", "counter")).toEqual([]);
			expect(elementsOf(html, "nav", "pagination")).toEqual([]);
		},
	);

	test("des recrues : aucun message d'état vide", () => {
		const html = renderDirectory(NO_QUERY, {
			players: [recruit("1", "noahbois", "fairy")],
			total: 1,
			classCounts: classCounts({ fairy: 1 }),
		});
		expect(elementsOf(html, "p", "empty")).toEqual([]);
	});
});
