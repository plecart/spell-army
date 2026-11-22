// La phrase de verdict de la fiche : un gabarit par niveau de `verdictOf`, qui nomme la classe et
// cite les stats qui ont fait le score (`scoringStatsOf`), au ton épique bon enfant (direction
// artistique § 1, « Ton »). Les gabarits sont ceux que le mainteneur a retenus pour #18.
import {
	type Character,
	type ClassKey,
	type StatKey,
	scoringStatsOf,
	type VerdictLevel,
	verdictOf,
} from "personnages";
import { CLASS_NAMES } from "../annuaire/address.ts";

/** Le nom de chaque stat à l'écran (game design § 1, « Statistiques »). */
export const STAT_LABELS: Record<StatKey, string> = {
	life: "Vie",
	strength: "Force",
	magic: "Magie",
	speed: "Vitesse",
};

// Les classes au nom féminin, dont l'article et le qualificatif s'accordent ; les autres sont au
// masculin.
const FEMININE_CLASSES: ReadonlySet<ClassKey> = new Set(["fairy"]);

// Par niveau : le qualificatif, sa forme féminine quand elle diffère, puis la chute qui suit les
// stats.
const WORDING: Record<
	VerdictLevel,
	{ qualifier: string; feminine?: string; ending: string }
> = {
	ill_born: {
		qualifier: "mal né",
		feminine: "mal née",
		ending: " Heureusement, l'armée est nombreuse.",
	},
	weak: { qualifier: "un peu juste", ending: " Le courage fera le reste." },
	average: { qualifier: "dans la moyenne", ending: "" },
	gifted: {
		qualifier: "doué",
		feminine: "douée",
		ending: " Le monstre n'a qu'à bien se tenir.",
	},
	excellent: {
		qualifier: "d'exception",
		ending: " Les bardes en parlent déjà.",
	},
};

/**
 * La phrase de verdict d'un personnage, par exemple « Un vampire dans la moyenne : Magie 7,
 * Vitesse 9. » : le gabarit de son niveau, le nom de sa classe en minuscules, puis chaque stat de
 * `scoringStatsOf`, dans son ordre, en « Libellé valeur ». Une espace insécable précède le
 * deux-points.
 */
export function verdictPhraseOf(character: Character): string {
	const { qualifier, feminine, ending } = WORDING[verdictOf(character)];
	const className = CLASS_NAMES[character.class].label.toLocaleLowerCase("fr");
	const subject = FEMININE_CLASSES.has(character.class)
		? `Une ${className} ${feminine ?? qualifier}`
		: `Un ${className} ${qualifier}`;
	const stats = scoringStatsOf(character)
		.map((key) => `${STAT_LABELS[key]} ${character.stats[key]}`)
		.join(", ");
	return `${subject}\u00a0: ${stats}.${ending}`;
}
