import { INSTAGRAM_ID_PATTERN, INSTAGRAM_USERNAME_PATTERN } from "donnees";

/**
 * Une entrée de la liste des abonnés telle que le fournisseur la rend : l'identifiant et le pseudo
 * en texte, non validés. Un champ absent ou non textuel arrive vide.
 */
export interface FollowerEntry {
	id: string;
	username: string;
}

/** Les entrées gardées d'une page, et le nombre d'entrées écartées par motif. */
export interface ScreenedPage {
	entries: FollowerEntry[];
	invalidIds: number;
	invalidUsernames: number;
}

/**
 * Trie les entrées d'une page du fournisseur, données non fiables (ADR 0003, « Pseudos, données non
 * fiables »). Une entrée dont l'identifiant sort de `INSTAGRAM_ID_PATTERN` est écartée comme
 * identifiant invalide, quel que soit son pseudo ; sinon, un pseudo hors de
 * `INSTAGRAM_USERNAME_PATTERN` l'écarte comme pseudo invalide. Rien n'est normalisé : « 007 » est
 * écarté, jamais lu « 7 ». Parmi les entrées bien formées, un identifiant en double ne garde que sa
 * première entrée, telle que reçue.
 *
 * Rend les entrées gardées, dans l'ordre de la page, et le nombre d'entrées écartées par motif,
 * chacune comptée, même répétée : des nombres, jamais les valeurs reçues, qui repartiraient vers
 * Claude par le MCP. Fonction pure.
 */
export function screenEntries(page: readonly FollowerEntry[]): ScreenedPage {
	const kept = new Map<string, FollowerEntry>();
	let invalidIds = 0;
	let invalidUsernames = 0;
	for (const entry of page) {
		if (!INSTAGRAM_ID_PATTERN.test(entry.id)) {
			invalidIds++;
		} else if (!INSTAGRAM_USERNAME_PATTERN.test(entry.username)) {
			invalidUsernames++;
		} else if (!kept.has(entry.id)) {
			kept.set(entry.id, entry);
		}
	}
	return { entries: [...kept.values()], invalidIds, invalidUsernames };
}
