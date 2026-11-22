import { CLASS_KEYS } from "personnages";
import { describe, expect, test } from "vitest";
import { CLASS_NAMES } from "../app/annuaire/address.ts";
import { ADDED, generated, POOL, withImage } from "./wiki.ts";

// Un statut interne des documents, en mot entier et quelle que soit la casse : « Décidé »,
// « (décidé) », « Proposé », « Ouvert », « ouverts ».
const STATUS = /(?<!\p{L})(?:décidé|proposé|ouvert)e?s?(?!\p{L})/giu;

describe("les pages du wiki", () => {
	test("sur la réserve de départ : l'accueil, le combat, l'index et les 8 pages des classes, l'index et les 24 pages des sorts", async () => {
		const wiki = await generated(POOL);
		expect((await wiki.files()).sort()).toEqual(
			[
				"Home.md",
				"Combat.md",
				"Classes.md",
				"Magicien.md",
				"Golem.md",
				"Guerrier.md",
				"Nain.md",
				"Vampire.md",
				"Druide.md",
				"Paysan.md",
				"Fée.md",
				"Sorts.md",
				"Sort-1-Coup-d'épée.md",
				"Sort-2-Lancer-de-rocher.md",
				"Sort-3-Charge.md",
				"Sort-4-Coup-de-marteau.md",
				"Sort-5-Coup-vampirique.md",
				"Sort-6-Boule-de-feu.md",
				"Sort-7-Météore.md",
				"Sort-8-Éclair.md",
				"Sort-9-Drain-de-vie.md",
				"Sort-10-Tornade.md",
				"Sort-11-Soin.md",
				"Sort-12-Prière.md",
				"Sort-13-Soin-des-blessés-graves.md",
				"Sort-14-Cri-de-ralliement.md",
				"Sort-15-Rage-du-désespoir.md",
				"Sort-16-Le-Barbare-ignorant.md",
				"Sort-17-Les-golems-se-relèvent.md",
				"Sort-18-Appel-du-clan.md",
				"Sort-19-Talent-caché.md",
				"Sort-20-Vengeance.md",
				"Sort-21-Le-Poids-plume.md",
				"Sort-22-Le-Rebouteux.md",
				"Sort-23-Le-Coup-lent.md",
				"Sort-24-Le-Sacrifice.md",
			].sort(),
		);
	});

	test("l'accueil recopie la puce « Le concept » du cadrage, et mène aux classes, aux sorts et au combat", async () => {
		const wiki = await generated(POOL);
		expect(await wiki.page("Home")).toBe(
			[
				"**Le concept** : un compte Instagram ; chaque abonné devient un personnage ; tous les personnages forment une armée qui affronte un monstre par jour, en tour par tour ; chaque combat est raconté dans une vidéo qui met en avant de vrais abonnés.",
				"",
				"- [Classes](Classes)",
				"- [Sorts](Sorts)",
				"- [Combat](Combat)",
				"",
			].join("\n"),
		);
	});

	test("le combat recopie la puissance d'un sort du game design § 2 et le paragraphe qui la suit, puis son § 4 sans la colonne Statut", async () => {
		const wiki = await generated(POOL);
		const combat = await wiki.page("Combat");
		const lines = combat.split("\n");
		expect(lines.slice(0, 5)).toEqual([
			"**Puissance d'un sort lancé par l'armée** :",
			"",
			"> valeur = coefficient du sort × **stat de l'armée** selon la recette × **efficacité du lanceur**",
			"> efficacité = 50 % + 50 % × stat du lanceur selon la recette / 15",
			"",
		]);
		expect(lines).toContain(
			"La stat de l'armée est la **somme** de celles de ses personnages : l'armée donne la puissance, le",
		);
		expect(lines).toContain("## Déroulé d'un combat");
		expect(lines).toContain("| Sujet | Règle |");
		expect(lines).toContain(
			"| Action de l'armée | On tire un personnage, il lance **son** sort avec la puissance de l'armée (§ 2). |",
		);
		expect(lines).toContain("| Armée | Qui joue | Particularité |");
		expect(combat).not.toContain("| Recette |");
	});

	test("aucune page ne porte de statut interne : ni Décidé, ni Proposé, ni Ouvert", async () => {
		const wiki = await generated(POOL);
		const pages = (await wiki.files()).filter((file) => file.endsWith(".md"));
		const statuses = await Promise.all(
			pages.map(async (file) =>
				[
					...(await wiki.page(file.slice(0, -".md".length))).matchAll(STATUS),
				].map(([word]) => `${file} : ${word}`),
			),
		);
		expect(statuses.flat()).toEqual([]);
	});

	test("la page Magicien montre Vie 0–8, Force 0–10, Magie 5–15, Vitesse 0–8, sans visuel", async () => {
		const wiki = await generated(POOL);
		expect(await wiki.page("Magicien")).toBe(
			[
				"| Vie | Force | Magie | Vitesse |",
				"| --- | --- | --- | --- |",
				"| 0–8 | 0–10 | 5–15 | 0–8 |",
				"",
			].join("\n"),
		);
	});

	test("l'index des classes donne les plages de l'annexe A, chaque classe liée à sa page", async () => {
		const wiki = await generated(POOL);
		expect(await wiki.page("Classes")).toBe(
			[
				"| Classe | Vie | Force | Magie | Vitesse |",
				"| --- | --- | --- | --- | --- |",
				"| [Magicien](Magicien) | 0–8 | 0–10 | 5–15 | 0–8 |",
				"| [Golem](Golem) | 7–14 | 8–15 | 0–3 | 0–3 |",
				"| [Guerrier](Guerrier) | 4–11 | 8–15 | 0–5 | 4–11 |",
				"| [Nain](Nain) | 6–13 | 5–12 | 0–8 | 0–8 |",
				"| [Vampire](Vampire) | 3–10 | 3–10 | 5–12 | 5–12 |",
				"| [Druide](Druide) | 3–10 | 0–5 | 5–12 | 5–12 |",
				"| [Paysan](Paysan) | 0–15 | 0–15 | 0–15 | 0–15 |",
				"| [Fée](Fée) | 0–5 | 0–3 | 8–15 | 8–15 |",
				"",
			].join("\n"),
		);
	});

	test("la page Coup d'épée montre « 100 % Force », la forme sûre et « dégâts ×1,0 »", async () => {
		const wiki = await generated(POOL);
		expect(await wiki.page("Sort-1-Coup-d'épée")).toBe(
			[
				"- **Nom** : Coup d'épée",
				"- **Recette** : 100 % Force",
				"- **Forme** : sûr",
				"- **Effet** : dégâts ×1,0",
				"",
			].join("\n"),
		);
	});

	test("la page Charge montre « 50 % Force + 50 % Vitesse », la forme coûteuse et la perte de 10 % des dégâts infligés", async () => {
		const wiki = await generated(POOL);
		expect(await wiki.page("Sort-3-Charge")).toBe(
			[
				"- **Nom** : Charge",
				"- **Recette** : 50 % Force + 50 % Vitesse",
				"- **Forme** : coûteux",
				"- **Effet** : dégâts ×1,15 ; l'armée perd 10 % des dégâts infligés",
				"",
			].join("\n"),
		);
	});

	test("l'index des sorts donne, par numéro, le nom lié à sa page, la recette, la forme et l'effet de chaque sort", async () => {
		const wiki = await generated(POOL);
		const lines = (await wiki.page("Sorts")).split("\n");
		expect(lines.slice(0, 3)).toEqual([
			"| Sort | Recette | Forme | Effet |",
			"| --- | --- | --- | --- |",
			"| [Coup d'épée](Sort-1-Coup-d'épée) | 100 % Force | sûr | dégâts ×1,0 |",
		]);
		expect(lines).toContain(
			"| [Charge](Sort-3-Charge) | 50 % Force + 50 % Vitesse | coûteux | dégâts ×1,15 ; l'armée perd 10 % des dégâts infligés |",
		);
		expect(lines).toHaveLength(2 + 24 + 1);
	});

	test("un sort de poids 0 n'a ni page ni ligne d'index", async () => {
		const wiki = await generated(
			POOL.map((spell) =>
				spell.number === 3 ? { ...spell, weight: 0 } : spell,
			),
		);
		expect
			.soft((await wiki.files()).filter((file) => file.startsWith("Sort-3-")))
			.toEqual([]);
		expect.soft(await wiki.page("Sorts")).not.toContain("Charge");
	});

	test.each([
		["image/png", "images/sort-6.png"],
		["image/jpeg", "images/sort-6.jpg"],
		["image/webp", "images/sort-6.webp"],
	])(
		"un sort avec une image %s a son visuel : le fichier %s, que sa page montre",
		async (type, path) => {
			const bytes = [137, 80, 78, 71];
			const wiki = await generated(
				withImage(6, { bytes: new Uint8Array(bytes), type }),
			);
			expect(await wiki.bytes(path)).toEqual(bytes);
			expect(await wiki.page("Sort-6-Boule-de-feu")).toContain(
				`\n\n![Boule de feu](${path})\n`,
			);
		},
	);

	test("un sort sans image n'a aucune balise d'image", async () => {
		const wiki = await generated(
			withImage(6, { bytes: new Uint8Array([1]), type: "image/png" }),
		);
		expect(await wiki.page("Sort-1-Coup-d'épée")).not.toContain("![");
	});

	test("chaque classe du code et chaque sort tirable de l'entrée, ajouté compris, a sa page et sa ligne d'index", async () => {
		const spells = [...POOL, ADDED];
		const wiki = await generated(spells);
		const files = await wiki.files();
		const [classes, index] = await Promise.all([
			wiki.page("Classes"),
			wiki.page("Sorts"),
		]);
		for (const key of CLASS_KEYS) {
			const { label } = CLASS_NAMES[key];
			expect.soft(files).toContain(`${label}.md`);
			expect.soft(classes).toContain(`| [${label}](${label}) |`);
		}
		for (const { number, name } of spells) {
			const page = files.find((file) => file.startsWith(`Sort-${number}-`));
			expect.soft(page, `la page du sort n° ${number}`).toBeDefined();
			expect
				.soft(index)
				.toContain(`| [${name}](${page?.slice(0, -".md".length)}) |`);
		}
	});

	test("deux sorts du même nom, fait de caractères interdits sous Windows et de Markdown, ont chacun leur page, au nom lisible, et ce nom s'affiche tel quel", async () => {
		const name = 'Qui ? <Moi> : "a/b" | c*';
		const wiki = await generated([
			...POOL,
			{ ...ADDED, number: 25, name },
			{ ...ADDED, number: 26, name },
		]);
		expect(
			(await wiki.files()).filter((file) => /^Sort-2[56]-/.test(file)).sort(),
		).toEqual(["Sort-25-Qui-Moi-a-b-c.md", "Sort-26-Qui-Moi-a-b-c.md"]);
		const shown = 'Qui ? \\<Moi\\> : "a/b" \\| c\\*';
		expect
			.soft(await wiki.page("Sorts"))
			.toContain(`| [${shown}](Sort-25-Qui-Moi-a-b-c) |`);
		expect
			.soft(await wiki.page("Sort-26-Qui-Moi-a-b-c"))
			.toContain(`- **Nom** : ${shown}\n`);
	});

	test.each([
		[
			"un nom de sort coupé par un saut de ligne et une tabulation tient sur sa ligne d'index, ses blancs réduits à une espace",
			"Pluie\r\n\td'essai",
			"| [Pluie d'essai](Sort-25-Pluie-d'essai) |",
		],
		[
			"un nom de sort qui porte « &amp; » l'affiche tel quel, sans le décoder",
			"Feu &amp; glace",
			"| [Feu \\&amp; glace](Sort-25-Feu-amp-glace) |",
		],
	])("%s", async (_, name, row) => {
		const wiki = await generated([...POOL, { ...ADDED, name }]);
		expect(await wiki.page("Sorts")).toContain(row);
	});

	test("un nom de sort décomposé (NFD) donne la page de sa forme composée : « Épée », pas « E-pe-e »", async () => {
		const wiki = await generated([
			...POOL,
			{ ...ADDED, name: "E\u0301pe\u0301e" },
		]);
		expect(
			(await wiki.files()).filter((file) => file.startsWith("Sort-25-")),
		).toEqual(["Sort-25-\u00c9p\u00e9e.md"]);
	});

	test("une image d'un type inconnu arrête la génération, qui nomme le sort", async () => {
		await expect(
			generated(
				withImage(6, { bytes: new Uint8Array([1]), type: "image/gif" }),
			),
		).rejects.toThrow(
			"Le sort n° 6 a une image d'un type inconnu : image/gif.",
		);
	});
});
