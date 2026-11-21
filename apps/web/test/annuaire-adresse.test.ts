import { CLASS_KEYS } from "personnages";
import { describe, expect, test } from "vitest";
import {
	CLASS_NAMES,
	type DirectoryQuery,
	directoryHref,
	readDirectoryQuery,
} from "../app/annuaire/address.ts";
import { NO_QUERY } from "./annuaire.ts";

type SearchParams = Parameters<typeof readDirectoryQuery>[0];

describe("lecture de l'adresse", () => {
	// Chaque champ (`q`, `classe`, `page`) balayé en une passe : absent, vide, répété, hors forme.
	test.each<[string, SearchParams, DirectoryQuery]>([
		["une adresse nue", {}, NO_QUERY],
		["un paramètre inconnu, ignoré", { tri: "nom" }, NO_QUERY],
		[
			"une recherche",
			{ q: "wizard_army" },
			{ ...NO_QUERY, search: "wizard_army" },
		],
		["une recherche vide", { q: "" }, NO_QUERY],
		[
			"une recherche entourée de blancs",
			{ q: "  arm  " },
			{ ...NO_QUERY, search: "arm" },
		],
		[
			"une recherche précédée de « @ »",
			{ q: "@arm" },
			{ ...NO_QUERY, search: "arm" },
		],
		[
			"une recherche répétée : la première",
			{ q: ["arm", "golem"] },
			{ ...NO_QUERY, search: "arm" },
		],
		[
			"une recherche de 31 caractères, tronquée à 30",
			{ q: "a".repeat(31) },
			{ ...NO_QUERY, search: "a".repeat(30) },
		],
		[
			"la classe « golem »",
			{ classe: "golem" },
			{ ...NO_QUERY, classKey: "golem" },
		],
		[
			"la classe « fee »",
			{ classe: "fee" },
			{ ...NO_QUERY, classKey: "fairy" },
		],
		[
			"une classe répétée : la première",
			{ classe: ["nain", "golem"] },
			{ ...NO_QUERY, classKey: "dwarf" },
		],
		["une classe vide", { classe: "" }, NO_QUERY],
		["une classe accentuée", { classe: "fée" }, NO_QUERY],
		["une classe en majuscules", { classe: "Golem" }, NO_QUERY],
		["une classe sous son nom du modèle", { classe: "wizard" }, NO_QUERY],
		[
			"une classe qui nomme une propriété d'objet",
			{ classe: "toString" },
			NO_QUERY,
		],
		["la page 2", { page: "2" }, { ...NO_QUERY, page: 2 }],
		["la page 007", { page: "007" }, { ...NO_QUERY, page: 7 }],
		[
			"une page répétée : la première",
			{ page: ["3", "4"] },
			{ ...NO_QUERY, page: 3 },
		],
		["une page vide", { page: "" }, NO_QUERY],
		["la page 0", { page: "0" }, NO_QUERY],
		["une page négative", { page: "-2" }, NO_QUERY],
		["une page décimale", { page: "2.5" }, NO_QUERY],
		["une page en notation scientifique", { page: "1e3" }, NO_QUERY],
		["une page entourée de blancs", { page: " 2 " }, NO_QUERY],
		["une page non numérique", { page: "deux" }, NO_QUERY],
	])("%s", (_, params, expected) => {
		expect(readDirectoryQuery(params)).toEqual(expected);
	});

	test("chaque classe a son nom dans l'adresse, et chacun se relit", () => {
		expect(
			CLASS_KEYS.map((classKey) =>
				readDirectoryQuery({ classe: CLASS_NAMES[classKey].slug }),
			),
		).toEqual(CLASS_KEYS.map((classKey) => ({ ...NO_QUERY, classKey })));
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
