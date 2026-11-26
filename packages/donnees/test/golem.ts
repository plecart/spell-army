import type { NewMonster } from "../src/index.ts";

/**
 * Le golem de lave du game design (§ 3, « Profil »), au premier chapitre de la première saison, le
 * monstre des tests de `donnees` et des paquets qui rangent un combat : `donnees` ne lit ni le profil
 * ni les attaques, que `combat` valide. Son facteur porte 17 chiffres significatifs, qu'une colonne
 * `real` arrondirait.
 */
export const GOLEM: NewMonster = {
	season: 1,
	chapter: 1,
	name: "Golem de lave",
	profile: { life: 1.5, strength: 1, magic: 1, speed: 0.5 },
	attacks: [
		{ name: "Griffes", recipe: { strength: 100, magic: 0 }, coefficient: 0.78 },
		{
			name: "Sortilège",
			recipe: { strength: 0, magic: 100 },
			coefficient: 0.78,
		},
	],
	scaleFactor: 1.1653817482293547,
	trait: "Sa peau de lave brûle qui la frappe.",
};
