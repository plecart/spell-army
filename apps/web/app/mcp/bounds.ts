import { z } from "zod";

/**
 * `count` en chiffres groupés par trois, séparés par une espace : « 3 000 000 ». Le séparateur de
 * groupe que rend ICU pour fr-FR, U+202F (Node 24.3, ICU 77.1, mesuré le 2026-11-20), est
 * remplacé, pour que les textes publiés n'en dépendent pas.
 */
export function grouped(count: number): string {
	return new Intl.NumberFormat("fr-FR")
		.formatToParts(count)
		.map(({ type, value }) => (type === "group" ? " " : value))
		.join("");
}

/** Un texte saisi : sans les blancs qui l'entourent, de 1 à `max` caractères. */
export const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * Le schéma d'octets reçus en base64, `subject` (« l'image ») d'au plus `maxBytes` octets, un
 * multiple de 3. Le base64 écrit 3 octets en 4 caractères : borner le texte à `maxBytes` / 3 × 4
 * caractères, c'est borner les octets à `maxBytes`, avant tout décodage. Le refus dit la borne dans
 * les deux unités.
 */
export function boundedBase64(subject: string, maxBytes: number) {
	const maxLength = (maxBytes / 3) * 4;
	return z.base64().max(maxLength, {
		error: `${subject} doit faire au plus ${grouped(maxBytes)} octets, soit ${grouped(maxLength)} caractères en base64`,
	});
}
