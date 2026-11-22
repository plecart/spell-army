import { readFileSync } from "node:fs";

/** Une ligne de l'annexe B, ses cellules telles qu'écrites : `| # | Sort | Recette | Forme | Effet |`. */
export interface AnnexRow {
	number: number;
	name: string;
	recipe: string;
	form: string;
	effect: string;
}

function annexBRows(gameDesign: string): AnnexRow[] {
	const annex = gameDesign
		.split(/^## /m)
		.find((section) => section.startsWith("Annexe B"));
	return [
		...(annex ?? "").matchAll(
			/^\| (\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm,
		),
	].map(([, number, name = "", recipe = "", form = "", effect = ""]) => ({
		number: Number(number),
		name,
		recipe,
		form,
		effect,
	}));
}

/**
 * L'annexe B du game design, lue à la source : un test y confronte la réserve de départ ou ce qu'il
 * en écrit au document, jamais la réserve à elle-même.
 */
export const ANNEX_B = annexBRows(
	readFileSync(
		new URL("../../../docs/game-design.md", import.meta.url),
		"utf8",
	),
);
