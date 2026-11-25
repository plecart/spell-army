import { describe, expect, test, vi } from "vitest";
import { Directory } from "../app/annuaire/directory.tsx";
import { SiteFrame } from "../app/frame.tsx";
import { siteSettings } from "../app/site.ts";
import { linksOf, render, textOf } from "./balisage.ts";
import { emptyPage, NO_QUERY } from "./annuaire.ts";

describe("variables du site", () => {
	test.each<[string | undefined, boolean]>([
		[undefined, false],
		["", false],
		["   ", false],
		["1", true],
		["oui", true],
	])("BETA_BANNER=%j : bandeau %s", (value, shown) => {
		vi.stubEnv("BETA_BANNER", value);
		expect(siteSettings().betaBanner).toBe(shown);
	});

	test.each<[string | undefined, string | undefined]>([
		[undefined, undefined],
		["", undefined],
		["spell_army", "spell_army"],
		["spell_army.fr", "spell_army.fr"],
		["a".repeat(30), "a".repeat(30)],
		["a".repeat(31), undefined],
		["@spell_army", undefined],
		["spell army", undefined],
		["https://www.instagram.com/spell_army/", undefined],
	])("INSTAGRAM_ACCOUNT_HANDLE=%j : compte %j", (value, handle) => {
		vi.stubEnv("INSTAGRAM_ACCOUNT_HANDLE", value);
		expect(siteSettings().instagramHandle).toBe(handle);
	});
});

describe("ce que les variables affichent", () => {
	// Le cadre du site autour de l'annuaire vide, tels que les rend l'environnement du moment.
	function renderSite(): string {
		const settings = siteSettings();
		return render(
			<SiteFrame settings={settings}>
				<Directory
					query={NO_QUERY}
					result={emptyPage()}
					instagramHandle={settings.instagramHandle}
				/>
			</SiteFrame>,
		);
	}

	// Le titre de la page et les liens qui sortent du site.
	const titleOf = (html: string) =>
		textOf(html.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? "");
	const outboundLinks = (html: string) =>
		linksOf(html).filter(({ href }) => !href.startsWith("/"));

	test("sans variable : ni bandeau ni lien vers le compte, le titre est « L'armée », le pied mène à « Informations »", () => {
		vi.stubEnv("BETA_BANNER", undefined);
		vi.stubEnv("INSTAGRAM_ACCOUNT_HANDLE", undefined);
		const html = renderSite();
		expect(textOf(html)).not.toContain("BÊTA");
		expect(titleOf(html)).toBe("L'armée");
		expect(outboundLinks(html)).toEqual([]);
		expect(linksOf(html)).toContainEqual({
			href: "/informations",
			text: "Informations",
		});
	});

	test("avec les deux : le bandeau en tête, le titre « L'armée de @compte » et le lien « Instagram » du pied mènent au compte", () => {
		vi.stubEnv("BETA_BANNER", "1");
		vi.stubEnv("INSTAGRAM_ACCOUNT_HANDLE", "spell_army");
		const html = renderSite();
		expect(textOf(html)).toMatch(/^BÊTA — version de test SPELL ARMY /);
		expect(titleOf(html)).toBe("L'armée de @spell_army");
		expect(outboundLinks(html)).toEqual([
			{ href: "https://www.instagram.com/spell_army/", text: "@spell_army" },
			{ href: "https://www.instagram.com/spell_army/", text: "Instagram" },
		]);
	});
});
