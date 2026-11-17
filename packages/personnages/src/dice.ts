import { createHash } from "node:crypto";

/** Un flux de dés par usage : un tirage n'en décale aucun autre. */
type DiceDomain = "class" | "stats";

const BYTE_VALUES = 256;
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
			// Les octets de la dernière tranche incomplète se rejettent : l'octet modulo n reste uniforme.
			const accepted = BYTE_VALUES - (BYTE_VALUES % items.length);
			for (;;) {
				const byte = nextByte();
				if (byte < accepted) return items[byte % items.length] as T;
			}
		},
	};
}

function* hashBytes(prefix: string): Generator<number, never> {
	for (let counter = 0; ; counter++) {
		yield* createHash("sha256").update(`${prefix}:${counter}`).digest();
	}
}
