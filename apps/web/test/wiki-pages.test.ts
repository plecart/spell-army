import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { readImageInfo } from "../app/mcp/image.ts";
import { anchorOf } from "../scripts/wiki/markdown.ts";
import { wikiPages } from "../scripts/wiki/pages.ts";
import { readDocuments } from "../scripts/wiki/passages.ts";
import { readTextsFile, textsOf } from "../scripts/wiki/textes.ts";
import {
	ADDED,
	generated,
	IMAGE_BYTES,
	INTERNAL_STATUS,
	POOL,
	withImage,
} from "./wiki.ts";

const TEXTS = textsOf(await readTextsFile(), await readDocuments());

// La cible d'un lien Markdown, la source d'une balise d'image, un titre ATX et une adresse externe.
const LINK = /\]\(([^)\s]+)\)/g;
const IMAGE_SOURCE = /<img src="([^"]+)"/g;
const HEADING = /^#+ (.*)$/gm;
const EXTERNAL = /^https?:\/\//;

/** Les titres de `page`, dans l'ordre, chacun suivi de « + Règle exacte » si sa section en porte une. */
function outline(page: string): string[] {
	const sections: string[] = [];
	for (const line of page.split("\n")) {
		if (line.startsWith("#")) sections.push(line);
		else if (line === "<details>")
			sections.push(`${sections.pop()} + Règle exacte`);
	}
	return sections;
}

/**
 * Les liens de `pages` (nom de page → Markdown) qui ne visent ni une page de `pages`, ni un titre de
 * cette page par son ancre, et les images qui ne visent aucun fichier de `files` ; chacun préfixé de
 * sa page.
 */
function brokenLinks(
	pages: ReadonlyMap<string, string>,
	files: readonly string[],
): string[] {
	const anchors = (page: string) =>
		[...(pages.get(page) ?? "").matchAll(HEADING)].map(([, title = ""]) =>
			anchorOf(title),
		);
	return [...pages].flatMap(([name, markdown]) => [
		...[...markdown.matchAll(LINK)]
			.map(([, target = ""]) => target)
			.filter((target) => !EXTERNAL.test(target))
			.filter((target) => {
				const [page = "", anchor] = target.split("#");
				return !(
					pages.has(page) &&
					(anchor === undefined || anchors(page).includes(anchor))
				);
			})
			.map((target) => `${name} : ${target}`),
		...[...markdown.matchAll(IMAGE_SOURCE)]
			.map(([, source = ""]) => source)
			.filter((source) => !files.includes(source))
			.map((source) => `${name} : ${source}`),
	]);
}

/** La ligne d'un sort dans son tableau d'effet. */
const spellRow = (image: string, name: string, description: string) =>
	`| <img src="${image}" width="96" alt="${name}"> | ${name} | ${description} |`;

const SQUARE = "images/a-venir-carre.png";

describe("les pages du wiki", () => {
	test("sur la réserve de départ, le wiki compte l'accueil, les trois pages des thèmes, le menu, le pied de page et les deux visuels réservés", async () => {
		const wiki = await generated(POOL);
		expect((await wiki.files()).sort()).toEqual(
			[
				"Home.md",
				"Personnages.md",
				"Sorts.md",
				"Combat.md",
				"_Sidebar.md",
				"_Footer.md",
				"images/a-venir-banniere.png",
				"images/a-venir-carre.png",
			].sort(),
		);
	});

	test.each([
		[
			"Home",
			[
				"## Spell Army + Règle exacte",
				"## Rejoins l'armée + Règle exacte",
				"## Découvre le jeu",
			],
		],
		[
			"Personnages",
			[
				"## Ton personnage",
				"### Ta classe + Règle exacte",
				"### Tes stats + Règle exacte",
				"### Ton verdict + Règle exacte",
				"### Ton sort + Règle exacte",
				"## Les classes",
				"### Magicien",
				"### Golem",
				"### Guerrier",
				"### Nain",
				"### Vampire",
				"### Druide",
				"### Paysan",
				"### Fée",
			],
		],
		[
			"Sorts",
			[
				"## Comment marche un sort + Règle exacte",
				"## Dégâts",
				"## Soin",
				"## Vol de vie",
			],
		],
		[
			"Combat",
			[
				"## Un tour de combat + Règle exacte",
				"## Qui joue ? + Règle exacte",
				"## Qui joue le plus souvent ? + Règle exacte",
				"## Comment ça finit + Règle exacte",
				"## Petite ou grande armée + Règle exacte",
			],
		],
	])(
		"la page %s suit le plan du site : ses sections, dans l'ordre, et leurs Règles exactes",
		async (page, sections) => {
			const wiki = await generated(POOL);
			expect(outline(await wiki.page(page))).toEqual(sections);
		},
	);

	test("une section se lit dans l'ordre : l'explication, le visuel, puis la Règle exacte, repliée", async () => {
		const combat = await (await generated(POOL)).page("Combat");
		expect(combat.slice(0, combat.indexOf("## Qui joue ?"))).toBe(
			[
				"## Un tour de combat",
				"",
				TEXTS.get("tour-de-combat")?.text,
				"",
				"```mermaid",
				TEXTS.get("schema-tour-de-combat")?.text,
				"```",
				"",
				"<details>",
				"<summary>Règle exacte</summary>",
				"",
				"| Sujet | Règle |",
				"|---|---|",
				"| Action de l'armée | On tire un personnage, il lance **son** sort avec la puissance de l'armée. |",
				"",
				"</details>",
				"",
				"",
			].join("\n"),
		);
	});

	test("une classe se présente par sa phrase, son portrait réservé, puis ses barres : Magicien, Magie 5–15, cases 5 à 15 pleines", async () => {
		const page = await (await generated(POOL)).page("Personnages");
		const start = page.indexOf("### Magicien");
		expect(page.slice(start, page.indexOf("### Golem"))).toBe(
			[
				"### Magicien",
				"",
				TEXTS.get("classe-magicien")?.text,
				"",
				`<img src="${SQUARE}" width="160" alt="Visuel à venir">`,
				"",
				"```",
				"Vie     █████████░░░░░░░ 0–8",
				"Force   ███████████░░░░░ 0–10",
				"Magie   ░░░░░███████████ 5–15",
				"Vitesse █████████░░░░░░░ 0–8",
				"```",
				"",
				"",
			].join("\n"),
		);
	});

	test("les barres d'une autre classe suivent ses plages : Golem, Vie 7–14, cases 7 à 14 pleines", async () => {
		const page = await (await generated(POOL)).page("Personnages");
		const golem = page.slice(page.indexOf("### Golem"));
		expect(golem).toContain("\nVie     ░░░░░░░████████░ 7–14\n");
	});

	test.each(["Garde-fou", "Déterminisme", "1 (jour 1)"])(
		"aucune page ne montre « %s »",
		async (word) => {
			const wiki = await generated(POOL);
			const pages = await wiki.pages();
			expect(
				[...pages.keys()].filter((name) => pages.get(name)?.includes(word)),
			).toEqual([]);
		},
	);

	test("aucune page ne porte de statut interne : ni Décidé, ni Proposé, ni Ouvert", async () => {
		const pages = await (await generated(POOL)).pages();
		const statuses = [...pages].flatMap(([name, markdown]) =>
			[...markdown.matchAll(INTERNAL_STATUS)].map(
				([word]) => `${name} : ${word}`,
			),
		);
		expect(statuses).toEqual([]);
	});

	test("les sorts tirables se rangent par effet, chacun à sa place dans l'ordre des numéros", async () => {
		const page = await (await generated([...POOL, ADDED])).page("Sorts");
		const names = (title: string) => {
			const section = page.slice(page.indexOf(title));
			const table = section.slice(
				0,
				section.indexOf("\n\n", section.indexOf("| ---")),
			);
			return [...table.matchAll(/^\| <img [^|]+\| (.+?) \|/gm)].map(
				([, name]) => name,
			);
		};
		expect({
			degats: names("## Dégâts"),
			soin: names("## Soin"),
			volDeVie: names("## Vol de vie"),
		}).toEqual({
			degats: [
				"Coup d'épée",
				"Lancer de rocher",
				"Charge",
				"Coup de marteau",
				"Boule de feu",
				"Météore",
				"Éclair",
				"Tornade",
				"Rage du désespoir",
				"Le Barbare ignorant",
				"Appel du clan",
				"Talent caché",
				"Vengeance",
				"Le Poids plume",
				"Le Coup lent",
			],
			soin: [
				"Soin",
				"Soin des blessés graves",
				"Cri de ralliement",
				"Les golems se relèvent",
				"Le Rebouteux",
				"Le Sacrifice",
				"Pluie d'essai",
			],
			volDeVie: ["Coup vampirique", "Drain de vie", "Prière"],
		});
	});

	test("un sort se présente comme sa carte : sa vignette, son nom et sa description, sans recette ni forme", async () => {
		const lines = (await (await generated(POOL)).page("Sorts")).split("\n");
		const start = lines.indexOf("## Dégâts");
		expect(lines.slice(start, start + 6)).toEqual([
			"## Dégâts",
			"",
			"Ces sorts frappent le monstre.",
			"",
			"| Visuel | Sort | Ce qu'il fait |",
			"| --- | --- | --- |",
		]);
		expect(lines[start + 6]).toBe(
			spellRow(SQUARE, "Coup d'épée", "Dégâts selon la Force."),
		);
	});

	test("un sort de poids 0 n'est pas montré", async () => {
		const wiki = await generated(
			POOL.map((spell) =>
				spell.number === 3 ? { ...spell, weight: 0 } : spell,
			),
		);
		expect(await wiki.page("Sorts")).not.toContain("Charge");
	});

	test("un effet sans sort tirable n'a ni section ni entrée au menu", async () => {
		const lifesteal = [5, 9, 12];
		const wiki = await generated(
			POOL.map((spell) =>
				lifesteal.includes(spell.number) ? { ...spell, weight: 0 } : spell,
			),
		);
		expect
			.soft(outline(await wiki.page("Sorts")))
			.toEqual([
				"## Comment marche un sort + Règle exacte",
				"## Dégâts",
				"## Soin",
			]);
		expect.soft(await wiki.page("_Sidebar")).not.toContain("Vol de vie");
	});

	test.each([
		["image/png", "images/sort-6.png"],
		["image/jpeg", "images/sort-6.jpg"],
		["image/webp", "images/sort-6.webp"],
	])(
		"un sort avec une image %s la montre en vignette : le fichier %s ; un sort sans image, le visuel réservé",
		async (type, path) => {
			const wiki = await generated(
				withImage(6, { bytes: new Uint8Array(IMAGE_BYTES), type }),
			);
			expect(await wiki.bytes(path)).toEqual(IMAGE_BYTES);
			const page = await wiki.page("Sorts");
			expect
				.soft(page)
				.toContain(
					`\n${spellRow(path, "Boule de feu", "Dégâts selon la Magie.")}\n`,
				);
			expect
				.soft(page)
				.toContain(
					`\n${spellRow(SQUARE, "Tornade", "Dégâts selon la Vitesse.")}\n`,
				);
		},
	);

	test("un sort dont le nom et la description portent du Markdown, du HTML et des sauts de ligne les montre tels quels, sur sa ligne", async () => {
		const wiki = await generated([
			...POOL,
			{
				...ADDED,
				name: 'Qui ? <Moi> : "a/b" | c*\r\n\td&amp;e',
				description: "Soin | partiel\n<b>_fort_</b> & [lien](x)",
			},
		]);
		expect(await wiki.page("Sorts")).toContain(
			'\n| <img src="images/a-venir-carre.png" width="96" alt="Qui ? <Moi> : &#34;a/b&#34; &#124; c* d&#38;amp;e"> | Qui ? \\<Moi\\> : "a/b" \\| c\\* d\\&amp;e | Soin \\| partiel \\<b\\>\\_fort\\_\\</b\\> \\& \\[lien\\](x) |\n',
		);
	});

	test("une image d'un type inconnu arrête la génération, qui nomme le sort", async () => {
		await expect(
			generated(
				withImage(6, { bytes: new Uint8Array(IMAGE_BYTES), type: "image/gif" }),
			),
		).rejects.toThrow(
			"Le sort n° 6 a une image d'un type inconnu : image/gif.",
		);
	});

	test("le seul schéma du wiki est le tour de combat, sur la page Combat", async () => {
		const pages = await (await generated(POOL)).pages();
		expect(
			[...pages].flatMap(([name, markdown]) =>
				[...markdown.matchAll(/^```mermaid$/gm)].map(() => name),
			),
		).toEqual(["Combat"]);
	});

	test("le menu mène à l'accueil, aux pages des thèmes et à leurs sections", async () => {
		expect(await (await generated(POOL)).page("_Sidebar")).toBe(
			[
				"- [Accueil](Home)",
				"- [Personnages](Personnages)",
				"  - [Ton personnage](Personnages#ton-personnage)",
				"  - [Les classes](Personnages#les-classes)",
				"- [Sorts](Sorts)",
				"  - [Comment marche un sort](Sorts#comment-marche-un-sort)",
				"  - [Dégâts](Sorts#dégâts)",
				"  - [Soin](Sorts#soin)",
				"  - [Vol de vie](Sorts#vol-de-vie)",
				"- [Combat](Combat)",
				"",
			].join("\n"),
		);
	});

	test.each(["Home", "_Footer"])(
		"la page %s lie le compte Instagram et le site",
		async (page) => {
			const markdown = await (await generated(POOL)).page(page);
			expect
				.soft(markdown)
				.toContain("[@spell_army](https://www.instagram.com/spell_army/)");
			expect.soft(markdown).toContain("[spellarmy.com](https://spellarmy.com)");
		},
	);

	test("l'accueil s'ouvre sur la bannière réservée, puis présente le jeu et mène à chaque thème", async () => {
		const home = await (await generated(POOL)).page("Home");
		expect
			.soft(home)
			.toMatch(
				/^<img src="images\/a-venir-banniere\.png" alt="Visuel à venir">\n\n## Spell Army\n/,
			);
		expect
			.soft(home)
			.toMatch(
				/\n## Découvre le jeu\n\n- \[Personnages\]\(Personnages\) — .+\n- \[Sorts\]\(Sorts\) — .+\n- \[Combat\]\(Combat\) — .+\n$/,
			);
	});

	test("chaque lien interne vise une page générée et, s'il porte une ancre, un titre de cette page ; chaque image, un fichier généré", async () => {
		const wiki = await generated(
			withImage(6, { bytes: new Uint8Array(IMAGE_BYTES), type: "image/png" }),
		);
		expect(brokenLinks(await wiki.pages(), await wiki.files())).toEqual([]);
	});

	test("le relevé des liens voit une page absente, une ancre absente et une image absente", () => {
		const pages = new Map([
			[
				"Home",
				'[a](Sorts) [b](Sorts#soin) [c](https://spellarmy.com) [d](Combat) [e](Sorts#absente) <img src="images/a.png" alt="a"> <img src="images/b.png" alt="b">',
			],
			["Sorts", "## Soin\n"],
		]);
		expect(brokenLinks(pages, ["Home.md", "Sorts.md", "images/a.png"])).toEqual(
			["Home : Combat", "Home : Sorts#absente", "Home : images/b.png"],
		);
	});

	test.each([
		["Ta classe", "ta-classe"],
		["Qui joue ?", "qui-joue-"],
		["Rejoins l'armée", "rejoins-larmée"],
		["Comment ça finit", "comment-ça-finit"],
		["Dégâts", "dégâts"],
		["Éclair du jour", "Éclair-du-jour"],
		["Mot_lié et tiret-court", "mot_lié-et-tiret-court"],
		["Deux  espaces", "deux--espaces"],
	])(
		"l'ancre de « %s » est « %s », comme GitHub la calcule",
		(title, anchor) => {
			expect(anchorOf(title)).toBe(anchor);
		},
	);

	test("les visuels réservés sont recopiés tels quels, en PNG : un carré et une bannière plus large que haute", async () => {
		const wiki = await generated(POOL);
		const read = (name: string) =>
			readFile(new URL(`../scripts/wiki/${name}`, import.meta.url));
		const square = await read("a-venir-carre.png");
		const banner = await read("a-venir-banniere.png");
		expect.soft(await wiki.bytes(SQUARE)).toEqual([...square]);
		expect
			.soft(await wiki.bytes("images/a-venir-banniere.png"))
			.toEqual([...banner]);
		const squareInfo = readImageInfo(square);
		const bannerInfo = readImageInfo(banner);
		expect.soft(squareInfo?.type).toBe("image/png");
		expect.soft(squareInfo?.width).toBe(squareInfo?.height);
		expect.soft(bannerInfo?.type).toBe("image/png");
		expect
			.soft(bannerInfo?.width)
			.toBeGreaterThan(bannerInfo?.height ?? Number.POSITIVE_INFINITY);
	});

	test("une entrée du fichier de textes qui manque à une page arrête le rendu en la nommant", async () => {
		const texts = new Map([...TEXTS].filter(([key]) => key !== "regle-exacte"));
		expect(() =>
			wikiPages(texts, POOL, {
				square: new Uint8Array(),
				banner: new Uint8Array(),
			}),
		).toThrow(
			"Le fichier de textes n'a pas de « title » pour « regle-exacte ».",
		);
	});
});
