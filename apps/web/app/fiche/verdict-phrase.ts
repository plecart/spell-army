// La phrase de verdict de la fiche : un gabarit par niveau de `verdictOf`, qui nomme la classe, au
// ton épique bon enfant (direction artistique § 1, « Ton »). Elle ne cite aucune stat : les barres
// de la fiche les montrent. Les gabarits sont ceux que le mainteneur a retenus pour #18.
import {
	type Character,
	type ClassKey,
	type VerdictLevel,
	verdictOf,
} from "personnages";
import { CLASS_NAMES } from "../annuaire/address.ts";

// Les classes au nom féminin, dont l'article et le qualificatif s'accordent ; les autres sont au
// masculin.
const FEMININE_CLASSES: ReadonlySet<ClassKey> = new Set(["fairy"]);

// Par niveau : le qualificatif, sa forme féminine quand elle diffère, puis la chute.
const WORDING: Record<
	VerdictLevel,
	{ qualifier: string; feminine?: string; ending: string }
> = {
	ill_born: {
		qualifier: "mal né",
		feminine: "mal née",
		ending: "Heureusement, l'armée est nombreuse.",
	},
	weak: { qualifier: "un peu juste", ending: "Le courage fera le reste." },
	average: { qualifier: "dans la moyenne", ending: "Ni héros, ni boulet." },
	gifted: {
		qualifier: "doué",
		feminine: "douée",
		ending: "Le monstre n'a qu'à bien se tenir.",
	},
	excellent: {
		qualifier: "d'exception",
		ending: "Les bardes en parlent déjà.",
	},
};

/**
 * La phrase de verdict d'un personnage, par exemple « Un vampire dans la moyenne. Ni héros, ni
 * boulet. » : le gabarit de son niveau, sur le nom de sa classe en minuscules.
 */
export function verdictPhraseOf(character: Character): string {
	const { qualifier, feminine, ending } = WORDING[verdictOf(character)];
	const className = CLASS_NAMES[character.class].label.toLocaleLowerCase("fr");
	const subject = FEMININE_CLASSES.has(character.class)
		? `Une ${className} ${feminine ?? qualifier}`
		: `Un ${className} ${qualifier}`;
	return `${subject}. ${ending}`;
}
