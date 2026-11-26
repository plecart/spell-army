import { describe, expect, test } from "vitest";
import { exactRule, readDocuments } from "../scripts/wiki/passages.ts";
import { readTextsFile, staleTexts, textsOf } from "../scripts/wiki/textes.ts";

const DOCUMENTS = await readDocuments();
const SOURCE = await readTextsFile();
const TEXTS = textsOf(SOURCE, DOCUMENTS);

/** `text` où `from`, qui doit y être, devient `to`. */
function altered(text: string, from: string, to: string): string {
	expect(text, `« ${from} » absent`).toContain(from);
	return text.replace(from, to);
}

/** La première cellule de chaque ligne de données du premier tableau de `markdown`. */
function firstCells(markdown: string): string[] {
	const table = markdown.split("\n\n").find((block) => block.startsWith("|"));
	return (table ?? "")
		.split("\n")
		.slice(2)
		.map((row) => row.split("|")[1]?.trim() ?? "");
}

describe("les empreintes des explications", () => {
	test("chaque explication porte l'empreinte de son passage actuel", () => {
		expect(
			staleTexts(SOURCE, DOCUMENTS),
			"relis chaque explication nommée, puis recopie sa nouvelle empreinte",
		).toEqual([]);
	});

	test("une ligne du game design modifiée nomme l'explication à relire et sa nouvelle empreinte", () => {
		const gameDesign = altered(
			DOCUMENTS.gameDesign,
			"**30 points exactement**",
			"**31 points exactement**",
		);
		expect(staleTexts(SOURCE, { ...DOCUMENTS, gameDesign })).toEqual([
			{
				key: "tes-stats",
				fingerprint: expect.stringMatching(/^[0-9a-f]{12}$/),
			},
		]);
	});
});

describe("aucun chiffre écrit en dur", () => {
	test("les noms de valeur prennent les valeurs du code", () => {
		const texts = textsOf(
			'valeurs:\n  text: "{total des points} {maximum d\'une stat} {nombre de classes} {nombre de stats} {compte Instagram} {site}"\n',
			DOCUMENTS,
		);
		expect(texts.get("valeurs")?.text).toBe(
			"30 15 8 4 [@spell_army](https://www.instagram.com/spell_army/) [spellarmy.com](https://spellarmy.com)",
		);
	});

	test.each([
		[
			"un chiffre dans un titre",
			"title: Ton verdict",
			"title: Ton verdict en 5 niveaux",
			"« ton-verdict » : « title » : chiffre écrit en dur « 5 »",
		],
		[
			"un chiffre dans un texte",
			"{total des points} points en tout",
			"30 points en tout",
			"« tes-stats » : « text » : chiffre écrit en dur « 3 »",
		],
		[
			"un chiffre hors ASCII dans un texte",
			"{total des points} points en tout",
			"{total des points} points en tout, ou ½ de plus",
			"« tes-stats » : « text » : chiffre écrit en dur « ½ »",
		],
		[
			"un nom de valeur inconnu",
			"{total des points} points en tout",
			"{total des point} points en tout",
			"« tes-stats » : « text » : nom de valeur inconnu {total des point}",
		],
	])(
		"%s fait échouer la lecture du fichier de textes",
		(_, from, to, message) => {
			expect(() => textsOf(altered(SOURCE, from, to), DOCUMENTS)).toThrow(
				message,
			);
		},
	);
});

// Les mots du projet, que le wiki des joueurs ne dit jamais dans ses textes (#64, D1).
test.each([
	"§",
	"ADR",
	"graine",
	"garde-fou",
	"centile",
	"mainteneur",
	"calibrage",
])("aucun titre ni texte ne dit « %s »", (word) => {
	const found = [...TEXTS]
		.filter(([, { title, text }]) =>
			[title, text].join(" ").toLowerCase().includes(word.toLowerCase()),
		)
		.map(([key]) => key);
	expect(found).toEqual([]);
});

/// Un passage valide, que des cas complètent d'un champ fautif.
const PASSAGE =
	"    - document: docs/game-design.md\n      section: 1. Le personnage\n      rows: [Total]\n";

describe("le fichier de textes, saisi à la main, se valide champ par champ", () => {
	test.each([
		[
			"un fichier qui n'est pas une table",
			"- a\n- b\n",
			"une table d'entrées est attendue",
		],
		[
			"une clé hors kebab-case",
			"Ta_classe:\n  title: T\n",
			"« Ta_classe » : clé en kebab-case attendue",
		],
		[
			"une entrée qui n'est pas une table",
			"x: seul\n",
			"« x » : une table de champs est attendue",
		],
		[
			"un champ inconnu",
			"x:\n  titre: T\n  text: t\n",
			"« x » : champ inconnu « titre »",
		],
		[
			"un titre qui n'est pas un texte",
			"x:\n  title: [T]\n",
			"« x » : « title » : un texte non vide est attendu",
		],
		[
			"un texte vide",
			'x:\n  text: ""\n',
			"« x » : « text » : un texte non vide est attendu",
		],
		["ni titre ni texte", "x: {}\n", "« x » : ni titre ni texte"],
		[
			"une accolade seule",
			"x:\n  text: |\n    voir {site\n",
			"« x » : « text » : accolade sans nom de valeur",
		],
		[
			"des passages sans texte",
			`x:\n  title: T\n  passages:\n${PASSAGE}  fingerprint: "f"\n`,
			"« x » : « passages » sans « text »",
		],
		[
			"des passages qui ne sont pas une liste",
			'x:\n  text: t\n  passages: oui\n  fingerprint: "f"\n',
			"« x » : « passages » : une liste non vide est attendue",
		],
		[
			"des passages sans empreinte",
			`x:\n  text: t\n  passages:\n${PASSAGE}`,
			"« x » : « fingerprint » : une chaîne entre guillemets est attendue",
		],
		[
			"une empreinte que YAML lit comme un nombre",
			`x:\n  text: t\n  passages:\n${PASSAGE}  fingerprint: 12e45678\n`,
			"« x » : « fingerprint » : une chaîne entre guillemets est attendue",
		],
		[
			"une empreinte sans passages",
			'x:\n  text: t\n  fingerprint: "f"\n',
			"« x » : « fingerprint » sans « passages »",
		],
		[
			"un passage qui n'est pas une table",
			'x:\n  text: t\n  passages: [Total]\n  fingerprint: "f"\n',
			"« x » : passage 1 : une table de champs est attendue",
		],
		[
			"un champ de passage inconnu",
			`x:\n  text: t\n  passages:\n${PASSAGE}      ligne: Total\n  fingerprint: "f"\n`,
			"« x » : passage 1 : champ inconnu « ligne »",
		],
		[
			"un passage sans document",
			'x:\n  text: t\n  passages:\n    - section: S\n      rows: [Total]\n  fingerprint: "f"\n',
			"« x » : passage 1 : « document » : un texte est attendu",
		],
		[
			"une section qui n'est pas un texte",
			'x:\n  text: t\n  passages:\n    - document: d\n      section: [S]\n      rows: [Total]\n  fingerprint: "f"\n',
			"« x » : passage 1 : « section » : un texte est attendu",
		],
		[
			"un passage sans lignes, puce ni bloc",
			'x:\n  text: t\n  passages:\n    - document: d\n      section: S\n  fingerprint: "f"\n',
			"« x » : passage 1 : un seul de « rows », « bullet », « block » est attendu",
		],
		[
			"un passage à deux formes",
			`x:\n  text: t\n  passages:\n${PASSAGE}      bullet: Total\n  fingerprint: "f"\n`,
			"« x » : passage 1 : un seul de « rows », « bullet », « block » est attendu",
		],
		[
			"une ligne que YAML lit comme un nombre",
			'x:\n  text: t\n  passages:\n    - document: d\n      section: S\n      rows: [100]\n  fingerprint: "f"\n',
			"« x » : passage 1 : « rows » : une liste de textes non vide est attendue",
		],
		[
			"une puce qui n'est pas un texte",
			'x:\n  text: t\n  passages:\n    - document: d\n      section: S\n      bullet: [B]\n  fingerprint: "f"\n',
			"« x » : passage 1 : « bullet » : un texte est attendu",
		],
		[
			"un bloc qui n'est pas un texte",
			'x:\n  text: t\n  passages:\n    - document: d\n      section: S\n      block: [B]\n  fingerprint: "f"\n',
			"« x » : passage 1 : « block » : un texte est attendu",
		],
	])("%s : la lecture échoue en le nommant", (_, source, message) => {
		expect(() => textsOf(source, DOCUMENTS)).toThrow(message);
	});

	test("toutes les fautes du fichier sont nommées d'un coup", () => {
		expect(() =>
			textsOf("x:\n  titre: T\n  text: t\ny: {}\n", DOCUMENTS),
		).toThrow(
			"textes.yaml :\n- « x » : champ inconnu « titre »\n- « y » : ni titre ni texte",
		);
	});
});

describe("les passages des explications", () => {
	test.each([
		[
			"une section absente",
			"section: Annexe A — Plages des classes",
			"section: Annexe Z",
			"docs/game-design.md : section « Annexe Z » introuvable.",
		],
		[
			"une ligne absente",
			"rows: [Magicien]",
			"rows: [Sorcier]",
			"docs/game-design.md, section « Annexe A — Plages des classes » : ligne « Sorcier » introuvable.",
		],
		[
			"une puce absente",
			"bullet: Le concept",
			"bullet: La devise du jour",
			"docs/etudes/00-cadrage.md, section « 1. Ce qui est ferme » : puce « La devise du jour » introuvable.",
		],
		[
			"un bloc absent",
			"block: Puissance d'un sort lancé par l'armée",
			"block: Puissance",
			"docs/game-design.md, section « 2. Les sorts » : bloc « Puissance » introuvable.",
		],
		// Une section s'arrête au titre suivant de même niveau ou plus haut : la ligne d'une section
		// suivante n'est pas la sienne.
		[
			"une ligne de la section suivante, de même niveau",
			"rows: [Enrôlement]",
			"rows: [Défaite]",
			"docs/etudes/00-cadrage.md, section « Joueurs » : ligne « Défaite » introuvable.",
		],
		[
			"une ligne d'une section suivante, plus haute",
			"rows: [Classe]",
			"rows: [Recette]",
			"docs/game-design.md, section « 1. Le personnage » : ligne « Recette » introuvable.",
		],
		[
			"un document inconnu",
			"document: docs/etudes/00-cadrage.md",
			"document: docs/cadrage.md",
			"Document inconnu : docs/cadrage.md.",
		],
	])("%s arrête la lecture en nommant le passage", (_, from, to, message) => {
		expect(() => textsOf(altered(SOURCE, from, to), DOCUMENTS)).toThrow(
			message,
		);
	});

	test("des lignes de tableau se rendent sous l'en-tête de leur tableau, sans la colonne Statut", () => {
		const [header, separator] = TEXTS.get("tes-stats")?.rule?.split("\n") ?? [];
		expect({ header, separator }).toEqual({
			header: "| Sujet | Règle |",
			separator: "|---|---|",
		});
		expect(firstCells(TEXTS.get("tes-stats")?.rule ?? "")).toEqual([
			"Statistiques",
			"Total",
			"Loterie",
		]);
	});

	test("des lignes de tableau se rendent dans l'ordre du tableau, quel que soit celui de leur liste", () => {
		const source = altered(
			SOURCE,
			"rows: [Statistiques, Total, Loterie]",
			"rows: [Loterie, Statistiques, Total]",
		);
		expect(
			firstCells(textsOf(source, DOCUMENTS).get("tes-stats")?.rule ?? ""),
		).toEqual(["Statistiques", "Total", "Loterie"]);
	});

	test("une puce se rend sur une ligne, son libellé en gras, jusqu'à la puce suivante", () => {
		expect(TEXTS.get("accueil")?.rule).toBe(
			"**Le concept** : un compte Instagram ; chaque abonné devient un personnage ; tous les personnages forment une armée qui affronte un monstre par jour, en tour par tour ; chaque combat est raconté dans une vidéo qui met en avant de vrais abonnés.",
		);
	});

	test("un bloc se rend avec ce qui le suit jusqu'au tableau, puis les lignes autorisées", () => {
		const blocks =
			TEXTS.get("comment-marche-un-sort")?.rule?.split("\n\n") ?? [];
		expect(blocks[0]).toBe("**Puissance d'un sort lancé par l'armée** :");
		expect(blocks[1]).toMatch(/^> valeur = /);
		expect(firstCells(blocks.slice(3).join("\n\n"))).toEqual([
			"Recette",
			"Formes",
			"Effets",
			"Vol de vie",
		]);
		expect(blocks).toHaveLength(4);
	});

	test("la taille de l'armée se rend sans la ligne du jour 1", () => {
		const rule = TEXTS.get("petite-ou-grande-armee")?.rule ?? "";
		expect(rule).toMatch(/^\*\*Selon la taille de l'armée\.\*\* /);
		expect(rule).toContain("| Armée | Qui joue | Particularité |");
		expect(firstCells(rule)).toEqual(["10 (jour 2)", "1 000", "100 000"]);
	});
});

// Un renvoi interne entre parenthèses ou un statut interne des documents : les formes relevées le
// 2026-11-26 dans les passages autorisés — « (annexe A) », « (#10) », « (§ 2) », « (mesuré : … ) »,
// la colonne « Statut » et « (décidé) » — et « (ADR n) » et « (annexes …) », que retire aussi D9.
const INTERNAL =
	/\((?:#|ADR |§|mesuré|annexes? )|(?<!\p{L})(?:décidé|proposé|ouvert)e?s?(?!\p{L})/giu;

describe("les Règles exactes ne gardent rien d'interne", () => {
	test.each([
		["un numéro d'issue", "Coupé (#10).", "Coupé."],
		["un ADR", "Même combat (ADR 0001).", "Même combat."],
		["un paragraphe", "Avec la puissance (§ 2).", "Avec la puissance."],
		[
			"un paragraphe nommé",
			"Coefficient (§ 6, « Équilibre »).",
			"Coefficient.",
		],
		["une mesure", "Plus rapide (mesuré : 51 % à 7 %).", "Plus rapide."],
		["une annexe", "Une plage par stat (annexe A).", "Une plage par stat."],
		["des annexes", "Les plages (annexes A et B, § 3, § 4).", "Les plages."],
		[
			"un renvoi après une espace insécable",
			"Avec la puissance\u00a0(§ 2).",
			"Avec la puissance.",
		],
		["un statut de titre", "**Puissance** (décidé) :", "**Puissance** :"],
	])("le filtre retire %s", (_, raw, rule) => {
		expect(exactRule(raw)).toBe(rule);
	});

	test("le filtre garde une parenthèse du jeu", () => {
		const raw = "Pas de Soin (les soins sont des sorts de Magie).";
		expect(exactRule(raw)).toBe(raw);
	});

	test.each([
		"(annexe A)",
		"(annexes A et B)",
		"(#10)",
		"(§ 2)",
		"(mesuré : x)",
		"(ADR 0001)",
		"Décidé",
		"(décidé)",
	])("le relevé reconnaît « %s »", (form) => {
		expect(form.match(INTERNAL)).not.toBeNull();
	});

	const RULES = [...TEXTS].flatMap(([key, { rule }]) =>
		rule === undefined ? [] : [[key, rule] as const],
	);

	test.each(RULES)(
		"la Règle exacte de « %s » ne garde ni renvoi ni statut interne",
		(_, rule) => {
			expect(rule.match(INTERNAL) ?? []).toEqual([]);
		},
	);
});
