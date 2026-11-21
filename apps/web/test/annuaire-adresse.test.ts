import { describe, expect, test } from "vitest";
import {
	CLASS_NAMES,
	type DirectoryQuery,
	directoryHref,
	readDirectoryQuery,
} from "../app/annuaire/address.ts";

type SearchParams = Parameters<typeof readDirectoryQuery>[0];

// L'adresse de l'annuaire, sans recherche, sans filtre, à la page 1.
const NONE: DirectoryQuery = { search: "", page: 1 };

describe("lecture de l'adresse", () => {
	// Chaque champ (`q`, `classe`, `page`) balayé en une passe : absent, vide, répété, hors forme.
	test.each<[string, SearchParams, DirectoryQuery]>([
		["une adresse nue", {}, NONE],
		["un paramètre inconnu, ignoré", { tri: "nom" }, NONE],
		["une recherche", { q: "wizard_army" }, { ...NONE, search: "wizard_army" }],
		["une recherche vide", { q: "" }, NONE],
		[
			"une recherche entourée de blancs",
			{ q: "  arm  " },
			{ ...NONE, search: "arm" },
		],
		[
			"une recherche précédée de « @ »",
			{ q: "@arm" },
			{ ...NONE, search: "arm" },
		],
		[
			"une recherche répétée : la première",
			{ q: ["arm", "golem"] },
			{ ...NONE, search: "arm" },
		],
		[
			"une recherche de 31 caractères, tronquée à 30",
			{ q: "a".repeat(31) },
			{ ...NONE, search: "a".repeat(30) },
		],
		[
			"la classe « golem »",
			{ classe: "golem" },
			{ ...NONE, classKey: "golem" },
		],
		["la classe « fee »", { classe: "fee" }, { ...NONE, classKey: "fairy" }],
		[
			"une classe répétée : la première",
			{ classe: ["nain", "golem"] },
			{ ...NONE, classKey: "dwarf" },
		],
		["une classe vide", { classe: "" }, NONE],
		["une classe accentuée", { classe: "fée" }, NONE],
		["une classe en majuscules", { classe: "Golem" }, NONE],
		["une classe sous son nom du modèle", { classe: "wizard" }, NONE],
		[
			"une classe qui nomme une propriété d'objet",
			{ classe: "toString" },
			NONE,
		],
		["la page 2", { page: "2" }, { ...NONE, page: 2 }],
		["la page 007", { page: "007" }, { ...NONE, page: 7 }],
		[
			"une page répétée : la première",
			{ page: ["3", "4"] },
			{ ...NONE, page: 3 },
		],
		["une page vide", { page: "" }, NONE],
		["la page 0", { page: "0" }, NONE],
		["une page négative", { page: "-2" }, NONE],
		["une page décimale", { page: "2.5" }, NONE],
		["une page en notation scientifique", { page: "1e3" }, NONE],
		["une page entourée de blancs", { page: " 2 " }, NONE],
		["une page non numérique", { page: "deux" }, NONE],
	])("%s", (_, params, expected) => {
		expect(readDirectoryQuery(params)).toEqual(expected);
	});

	test("chaque classe a son nom dans l'adresse, et chacun se relit", () => {
		expect(
			Object.values(CLASS_NAMES).map(({ slug }) =>
				readDirectoryQuery({ classe: slug }),
			),
		).toEqual(
			(
				[
					"wizard",
					"golem",
					"warrior",
					"dwarf",
					"vampire",
					"druid",
					"peasant",
					"fairy",
				] as const
			).map((classKey) => ({ ...NONE, classKey })),
		);
	});
});

describe("écriture de l'adresse", () => {
	test.each<[string, Partial<DirectoryQuery>, string]>([
		["rien", {}, "/"],
		["la page 1, qui ne s'écrit pas", { page: 1 }, "/"],
		["une recherche", { search: "arm" }, "/?q=arm"],
		[
			"une recherche et une classe",
			{ search: "arm", classKey: "fairy" },
			"/?q=arm&classe=fee",
		],
		[
			"une classe et une page",
			{ classKey: "golem", page: 2 },
			"/?classe=golem&page=2",
		],
		["une recherche à encoder", { search: "a&b" }, "/?q=a%26b"],
	])("%s", (_, query, href) => {
		expect(directoryHref(query)).toBe(href);
	});
});
