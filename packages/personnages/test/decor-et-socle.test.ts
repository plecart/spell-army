import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, test } from "vitest";
import {
	BACKDROPS,
	CLASS_COLORS,
	type ClassKey,
	PEDESTALS,
} from "../src/index.ts";

// Direction artistique § 2, recopiée : le test confronte le code au document, jamais le code à
// lui-même. Les cas s'écrivent en littéraux ; le premier test garde l'égalité avec le code.
const SECTION_2_COLORS = {
	wizard: "#2e4a7d",
	golem: "#857c6c",
	warrior: "#a33b2f",
	dwarf: "#b06a2c",
	vampire: "#6e1f33",
	druid: "#4f7a3a",
	peasant: "#c4a052",
	fairy: "#3f9c95",
} as const;
const CLASSES = Object.entries(SECTION_2_COLORS) as [ClassKey, string][];

// Sombre : la couleur contraste davantage avec le blanc qu'avec le noir. Les deux contrastes
// s'égalent quand (1 + 0,05) / (L + 0,05) = (L + 0,05) / (0 + 0,05) (WCAG 2.2, « contrast ratio »).
const DARK_BELOW = Math.sqrt(1.05 * 0.05) - 0.05;

/** Luminance relative d'une couleur `#rrggbb` (WCAG 2.2, « relative luminance »). */
function relativeLuminance(hex: string): number {
	const linear = (start: number) => {
		const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
		return channel <= 0.04045
			? channel / 12.92
			: ((channel + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
}

test("les couleurs de classe exportées sont celles de la direction artistique § 2", () => {
	expect(CLASS_COLORS).toEqual(SECTION_2_COLORS);
});

describe.each(CLASSES)("%s", (classKey, color) => {
	test(`le dessus de son socle est à la couleur de sa classe, ${color}`, () => {
		expect(PEDESTALS[classKey].top.color).toBe(color);
	});

	test("la base de son socle est sombre", () => {
		expect(relativeLuminance(PEDESTALS[classKey].base.color)).toBeLessThan(
			DARK_BELOW,
		);
	});

	test("son décor est un document SVG bien formé, de racine svg", () => {
		const backdrop = BACKDROPS[classKey];

		expect(XMLValidator.validate(backdrop)).toBe(true);
		const parsed = new XMLParser({ ignoreAttributes: false }).parse(backdrop);
		expect(Object.keys(parsed)).toEqual(["svg"]);
		expect(parsed.svg).toMatchObject({
			"@_xmlns": "http://www.w3.org/2000/svg",
			"@_viewBox": "0 0 100 100",
		});
	});

	test("son décor porte la couleur de sa classe", () => {
		expect(BACKDROPS[classKey]).toContain(color);
	});

	test("son décor écrit ses nombres au millième au plus", () => {
		expect(BACKDROPS[classKey]).not.toMatch(/[.][0-9]{4}/);
	});
});
