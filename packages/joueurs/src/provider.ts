import type { FollowerEntry } from "./entries.ts";

/**
 * Une page de la liste des abonnés : ses entrées, telles que le fournisseur les rend, et le curseur
 * de la page suivante, nul en fin de liste.
 */
export interface FollowerPage {
	entries: readonly FollowerEntry[];
	next: string | null;
}

/**
 * Le fournisseur de la liste des abonnés du compte lu (ADR 0003, « Fournisseur »). Ses curseurs
 * sont opaques : une passe les garde et les rend, sans jamais les lire.
 */
export interface FollowerProvider {
	/**
	 * Lit une page de la liste.
	 *
	 * @param cursor le curseur rendu par la page précédente ; `null` : le haut de la liste.
	 * @throws {ProviderError} quand la lecture échoue.
	 */
	readPage(cursor: string | null): Promise<FollowerPage>;

	/**
	 * Lit le nombre d'abonnés que le compte affiche (ADR 0003, « Auto-contrôle »).
	 *
	 * @throws {ProviderError} quand la lecture échoue.
	 */
	readFollowerCount(): Promise<number>;
}

/**
 * L'échec d'une lecture du fournisseur. Son message va au journal des passes, que le MCP rend à
 * Claude : il est composé par le code — point d'accès, statut —, jamais recopié d'un corps reçu
 * (ADR 0003, « Pseudos, données non fiables »).
 */
export class ProviderError extends Error {
	override name = "ProviderError";
}
