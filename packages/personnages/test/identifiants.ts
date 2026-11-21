import { type Character, type ClassKey, characterOf } from "../src/index.ts";

// Les identifiants « 1 » à « count », en texte : les populations que lisent les critères de #10.
export function identifiers(count: number): string[] {
	return Array.from({ length: count }, (_, index) => String(index + 1));
}

// Les personnages des identifiants 1 à 100 000, calculés au premier test qui les lit : une classe
// invalide fait rougir ces tests sans faire échouer la collecte de leur fichier, ni empêcher le
// test de validité des classes de dire laquelle.
let characters: Character[] | undefined;
export const population = () =>
	(characters ??= identifiers(100_000).map((id) => characterOf(id)));

/** Les `count` premiers identifiants, depuis « 1 », dont la classe est `classKey`. */
export function idsOf(classKey: ClassKey, count: number): string[] {
	const ids: string[] = [];
	for (let n = 1; ids.length < count; n++) {
		if (characterOf(String(n)).class === classKey) {
			ids.push(String(n));
		}
	}
	return ids;
}
