import type { PlayerSheet } from "joueurs";
import { BACKDROPS, characterOf } from "personnages";
import { describe, expect, test } from "vitest";
import { Fiche } from "../app/fiche/fiche.tsx";
import { elementsOf, render, textOf } from "./balisage.ts";

// La recrue du prototype (direction artistique § 10, « Fiche ») : l'identifiant « 4 » est un
// vampire dans la moyenne, Vie 6, Force 8, Magie 7, Vitesse 9, qui porte le sort n° 3 de la
// réserve de départ, Charge, dans une réserve de 24 sorts.
const RECRUIT: PlayerSheet = {
	instagramId: "4",
	username: "nathan_croque",
	classKey: "vampire",
	arrivedAt: new Date("2026-11-09T10:00:00Z"),
	spell: {
		number: 3,
		name: "Charge",
		effect: { base: "armyStat", damage: { constant: 1.15, perGauge: 0 } },
		description:
			"Gros dégâts selon 50 % de la Force et 50 % de la Vitesse. L'armée perd 10 % des dégâts infligés.",
		hasImage: false,
	},
	poolSize: 24,
};

const renderFiche = (player: PlayerSheet = RECRUIT) =>
	render(<Fiche player={player} />);

describe("fiche d'une recrue", () => {
	test("@pseudo en titre, puis la pastille et le nom de la classe, l'arrivée et la phrase de verdict", () => {
		const html = renderFiche();
		expect(html).toMatch(/<h2 id="fiche-title">@nathan_croque<\/h2>/);
		expect(elementsOf(html, "p", "class-name").map(textOf)).toEqual([
			"Vampire Recrue depuis le 9 novembre",
		]);
		expect(elementsOf(html, "p", "verdict").map(textOf)).toEqual([
			"Un vampire dans la moyenne : Magie 7, Vitesse 9.",
		]);
	});

	test("dans l'ordre du prototype : titre, scène, classe, verdict, stats, points, « Son sort », carte du sort", () => {
		const html = renderFiche();
		const positions = [
			"<h2 ",
			'class="vignette"',
			'class="class-name"',
			'class="verdict"',
			'class="stats"',
			'class="points"',
			"<h3>",
			'class="spell-card"',
		].map((marker) => html.indexOf(marker));
		expect(positions).not.toContain(-1);
		expect(positions).toEqual(positions.toSorted((a, b) => a - b));
	});

	test("la scène est posée sur le décor de la classe, à sa couleur", () => {
		const html = renderFiche();
		const [scene = ""] = elementsOf(html, "div", "vignette");
		expect(scene).toContain(encodeURIComponent(BACKDROPS.vampire));
		expect(html).toMatch(
			/^<article class="fiche" style="--class-color:#6e1f33">/,
		);
	});

	test("les quatre statistiques de characterOf, libellé et valeur, chacune en barre décorative sur 15", () => {
		const { life, strength, magic, speed } = characterOf(
			RECRUIT.instagramId,
		).stats;
		const [stats = ""] = elementsOf(renderFiche(), "ul", "stats");
		expect(textOf(stats)).toBe(
			`Vie ${life} Force ${strength} Magie ${magic} Vitesse ${speed}`,
		);
		// La part de chaque barre remplie, ramenée sur 15.
		const filled = [
			...stats.matchAll(
				/<span class="bar" aria-hidden="true"><span style="width:([\d.]+)%"><\/span><\/span>/g,
			),
		].map(([, width = ""]) => (Number(width) * 15) / 100);
		expect(filled).toHaveLength(4);
		[life, strength, magic, speed].forEach((value, index) => {
			expect(filled[index]).toBeCloseTo(value);
		});
	});

	test("« 30 points, répartis à l'inscription selon le pseudo. », puis le titre « Son sort »", () => {
		const html = renderFiche();
		expect(elementsOf(html, "p", "points").map(textOf)).toEqual([
			"30 points, répartis à l'inscription selon le pseudo.",
		]);
		expect(html).toContain("<h3>Son sort</h3>");
	});
});

describe("carte du sort", () => {
	// La carte du sort de `spell`, sur la fiche de la recrue.
	const cardOf = (spell: Partial<PlayerSheet["spell"]>) =>
		elementsOf(
			renderFiche({ ...RECRUIT, spell: { ...RECRUIT.spell, ...spell } }),
			"article",
			"spell-card",
		)[0] ?? "";

	const once = { constant: 1, perGauge: 0 };
	const half = { constant: 0.5, perGauge: 0 };

	// Direction artistique § 2, « Couleurs d'effet des sorts », et § 4, « En-tête ».
	test.each<[string, string, string, unknown]>([
		["dégâts seuls", "Dégâts", "#b83b26", { base: "armyStat", damage: once }],
		["soin seul", "Soin", "#4f7a3a", { base: "armyStat", heal: once }],
		[
			"dégâts et soin",
			"Vol de vie",
			"#6e1f33",
			{ base: "armyStat", damage: half, heal: half },
		],
	])(
		"%s : le nom, la pastille « %s », la carte à la couleur %s",
		(_, label, color, effect) => {
			const card = cardOf({ name: "Charge", effect });
			expect(card).toMatch(
				new RegExp(
					`^<article class="spell-card" style="--effect-color:${color}">`,
				),
			);
			expect(card).toContain(
				`<h4>Charge</h4><span class="effect">${label}</span>`,
			);
		},
	);

	test("un sort avec image : l'image servie par la route du sort", () => {
		expect(cardOf({ hasImage: true })).toContain(
			'<img class="spell-image" src="/api/sorts/3/image" alt=""/>',
		);
	});

	test("un sort sans image : une zone unie à la place, et aucune image", () => {
		const card = cardOf({ hasImage: false });
		expect(card).toContain('<div class="spell-image"></div>');
		expect(card).not.toContain("<img");
	});

	test("la description sous l'image, puis le pied « numéro/taille de la réserve »", () => {
		const card = cardOf({});
		expect(elementsOf(card, "p", "spell-description").map(textOf)).toEqual([
			"Gros dégâts selon 50 % de la Force et 50 % de la Vitesse. L'armée perd 10 % des dégâts infligés.",
		]);
		expect(card).toMatch(/<p class="spell-number">3\/24<\/p><\/article>$/);
	});
});
