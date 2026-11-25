import { describe, expect, test, vi } from "vitest";
import Informations from "../app/informations/page.tsx";
import { linksOf, paragraphTextOf, render, textOf } from "./balisage.ts";

/** Les sections de la page, rendue dans l'environnement du moment : leur titre et leur texte. */
function sections(): [string, string][] {
	return [
		...render(<Informations />).matchAll(
			/<section><h2>([\s\S]*?)<\/h2>([\s\S]*?)<\/section>/g,
		),
	].map(([, title = "", body = ""]) => [textOf(title), paragraphTextOf(body)]);
}

// Ce que la page dit (ADR 0003, « RGPD »), sans compte réglé : un point par section, rien d'autre.
const POINTS: [string, string, string][] = [
	[
		"qui traite les données",
		"Qui traite ces données",
		"Bernier Pacôme, éditeur du jeu, joignable par message privé sur le compte Instagram du jeu.",
	],
	[
		"lesquelles",
		"Quelles données",
		"L'identifiant Instagram et le pseudo de chaque abonné du compte Instagram du jeu, rien d'autre.",
	],
	[
		"pourquoi",
		"Pourquoi",
		"Pour donner à chaque abonné une recrue, avec sa classe, ses statistiques et son sort, et l'afficher dans l'annuaire.",
	],
	["la base légale", "Sur quelle base", "L'intérêt légitime."],
	[
		"le retrait",
		"Demander ton retrait",
		"Demande-le par message privé sur le compte Instagram du jeu. Ton pseudo est alors effacé, et ton identifiant mis sur une liste d'exclusion, que l'import respecte.",
	],
];

describe("page « Informations »", () => {
	test("cinq sections, dans l'ordre : qui, quoi, pourquoi, la base légale, le retrait", () => {
		vi.stubEnv("INSTAGRAM_ACCOUNT_HANDLE", undefined);
		expect(sections().map(([title]) => title)).toEqual(
			POINTS.map(([, title]) => title),
		);
	});

	test.each(POINTS)("elle dit %s", (_, title, text) => {
		vi.stubEnv("INSTAGRAM_ACCOUNT_HANDLE", undefined);
		expect(sections()).toContainEqual([title, text]);
	});

	test("sans compte réglé : aucun lien hors du site", () => {
		vi.stubEnv("INSTAGRAM_ACCOUNT_HANDLE", undefined);
		expect(linksOf(render(<Informations />))).toEqual([]);
	});

	test("avec le compte : « @compte », lié au compte, pour le joindre et pour le retrait", () => {
		vi.stubEnv("INSTAGRAM_ACCOUNT_HANDLE", "spell_army");
		const account = {
			href: "https://www.instagram.com/spell_army/",
			text: "@spell_army",
		};
		expect(linksOf(render(<Informations />))).toEqual([account, account]);
		expect(sections()).toContainEqual([
			"Qui traite ces données",
			"Bernier Pacôme, éditeur du jeu, joignable par message privé sur @spell_army.",
		]);
		expect(sections()).toContainEqual([
			"Demander ton retrait",
			"Demande-le par message privé sur @spell_army. Ton pseudo est alors effacé, et ton identifiant mis sur une liste d'exclusion, que l'import respecte.",
		]);
	});
});
