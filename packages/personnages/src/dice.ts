import { createHash } from "node:crypto";

/**
 * Un flux de dés par usage : aucun tirage n'en décale un autre, et le sort reste indépendant de la
 * classe.
 */
type DiceDomain = "class" | "stats" | "spell";

const BYTE_VALUES = 256;
const FRACTION_BYTES = 6;
const DECIMAL_DIGITS = /^[0-9]+$/;

/**
 * Les dés d'un identifiant dans un domaine, tirés d'un hachage et jamais du générateur aléatoire du
 * langage (game design § 1, « Tirage des stats »). Contrat figé : la classe et les stats ne sont
 * jamais stockées (ADR 0003, ligne « Sort à l'inscription »), tout changement ici réattribue chaque
 * personnage.
 *
 * Les dés lisent dans l'ordre les octets de SHA-256(`<domaine>:<identifiant>:<compteur>`), le
 * compteur décimal partant de 0 et passant au bloc de 32 octets suivant dès que le précédent est
 * épuisé. Le texte haché n'est fait que d'ASCII ; `Hash.update` le lit en UTF-8 faute d'encodage
 * donné (`@types/node` 24, `crypto.d.ts`).
 *
 * @throws {RangeError} si l'identifiant n'est pas un texte non vide de chiffres décimaux.
 */
export function diceOf(domain: DiceDomain, instagramId: string) {
	// Le contrôle de type d'abord : un nombre JS passerait l'expression régulière par conversion.
	if (typeof instagramId !== "string" || !DECIMAL_DIGITS.test(instagramId)) {
		throw new RangeError(
			"l'identifiant Instagram doit être un texte non vide de chiffres décimaux (0 à 9)",
		);
	}
	const bytes = hashBytes(`${domain}:${instagramId}`);
	const nextByte = () => bytes.next().value;
	return {
		/** Un élément de `items` (de 1 à 256 éléments), à chances égales. */
		pick<T>(items: readonly T[]): T {
			// Hors de 1 à 256, aucun octet ne serait accepté : la boucle ne finirait jamais.
			if (items.length < 1 || items.length > BYTE_VALUES) {
				throw new RangeError(
					`le tirage demande de 1 à 256 éléments, reçu : ${items.length}`,
				);
			}
			// Les octets de la dernière tranche incomplète se rejettent : le modulo reste uniforme.
			const accepted = BYTE_VALUES - (BYTE_VALUES % items.length);
			for (;;) {
				const byte = nextByte();
				if (byte < accepted) return items[byte % items.length] as T;
			}
		},
		/** Une fraction uniforme de [0, 1) sur 48 bits : six octets, gros-boutistes, sur 2⁴⁸. */
		fraction(): number {
			let value = 0;
			for (let index = 0; index < FRACTION_BYTES; index++) {
				value = value * BYTE_VALUES + nextByte();
			}
			return value / BYTE_VALUES ** FRACTION_BYTES;
		},
	};
}

function* hashBytes(prefix: string): Generator<number, never> {
	for (let counter = 0; ; counter++) {
		yield* createHash("sha256").update(`${prefix}:${counter}`).digest();
	}
}
