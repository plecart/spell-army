import { sha256 } from "./sha256.ts";

/**
 * Un flux de dés par usage : le tirage des personnages ne décale pas celui des attaques du
 * monstre, ni l'inverse.
 */
export type DiceStream = "army" | "monster";

/** Un dé : un rang tiré à chances égales. */
export interface Dice {
	/**
	 * Un rang de 0 à `length` − 1, à chances égales ; `length` est un entier de 1 à 2⁴⁸.
	 *
	 * @throws {RangeError} si `length` sort de 1 à 2⁴⁸ : aucun entier ne serait accepté, la boucle
	 * de rejet ne finirait jamais.
	 */
	index(length: number): number;
}

const BYTE_VALUES = 256;
/** Un rang se tire d'un entier de six octets, et 2⁴⁸ dépasse la longueur de tout tableau. */
const INTEGER_BYTES = 6;
const INTEGER_RANGE = BYTE_VALUES ** INTEGER_BYTES;

/**
 * Les dés d'une graine dans un flux, tirés d'un hachage et jamais du générateur aléatoire du
 * langage (game design § 4, « Déterminisme ») : même graine, mêmes tirages. Sur le principe des dés
 * de `personnages` (`src/dice.ts`), les dés lisent dans l'ordre les octets de
 * SHA-256(`<flux>:<graine>:<compteur>`), le compteur décimal partant de 0 et passant au bloc de 32
 * octets suivant dès que le précédent est épuisé. Un rang prend les six octets suivants, en entier
 * gros-boutiste ; un entier de la dernière tranche incomplète se rejette et le dé passe au suivant,
 * pour que le modulo reste uniforme.
 *
 * Changer cette dérivation change chaque combat déjà joué.
 *
 * @throws {RangeError} si la graine n'est pas un texte non vide.
 */
export function diceOf(stream: DiceStream, seed: string): Dice {
	if (typeof seed !== "string" || seed === "") {
		throw new RangeError("la graine doit être un texte non vide");
	}
	const bytes = hashBytes(`${stream}:${seed}`);
	const nextInteger = () => {
		let value = 0;
		for (let index = 0; index < INTEGER_BYTES; index++) {
			value = value * BYTE_VALUES + bytes.next().value;
		}
		return value;
	};
	return {
		index(length) {
			if (
				!(Number.isInteger(length) && length >= 1 && length <= INTEGER_RANGE)
			) {
				throw new RangeError(
					`le tirage demande un nombre entier d'éléments de 1 à 2⁴⁸, reçu : ${length}`,
				);
			}
			const accepted = INTEGER_RANGE - (INTEGER_RANGE % length);
			for (;;) {
				const value = nextInteger();
				if (value < accepted) return value % length;
			}
		},
	};
}

/**
 * Un tirage sans remise de `items`, qui ne sont jamais modifiés : chacun sort une fois avant qu'un
 * autre ne ressorte, et le sac vidé se remplit (game design § 3, « Tirage sans remise » ; § 4,
 * « Tirage »). Chaque tirage coûte un rang du dé, quelle que soit la taille du sac.
 *
 * @returns la fonction qui tire l'élément suivant.
 * @throws {RangeError} au premier tirage, si `items` est vide.
 */
export function bagOf<T>(items: readonly T[], dice: Dice): () => T {
	const bag = [...items];
	// Le sac est le début du tableau, jusqu'à `left` ; les tirés du tour sont rangés derrière.
	let left = 0;
	return () => {
		if (left === 0) left = bag.length;
		const drawn = dice.index(left);
		left -= 1;
		const item = bag[drawn] as T;
		bag[drawn] = bag[left] as T;
		bag[left] = item;
		return item;
	};
}

function* hashBytes(prefix: string): Generator<number, never> {
	for (let counter = 0; ; counter++) {
		yield* sha256(`${prefix}:${counter}`);
	}
}
