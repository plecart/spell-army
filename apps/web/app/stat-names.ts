import type { StatKey } from "personnages";

/** Le nom de chaque stat (game design § 1, « Statistiques »), sur la fiche et dans le wiki. */
export const STAT_NAMES = {
	life: "Vie",
	strength: "Force",
	magic: "Magie",
	speed: "Vitesse",
} as const satisfies Record<StatKey, string>;
