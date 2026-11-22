// Les données de l'annuaire, écrites à la main pour les tests de l'écran : une adresse, des recrues,
// une page de la lecture des joueurs visibles.
import type { VisiblePlayer, VisiblePlayersPage } from "joueurs";
import { type ClassKey, perClass } from "personnages";
import type { DirectoryQuery } from "../app/annuaire/address.ts";

/** L'adresse nue : sans recherche, sans filtre, à la page 1. */
export const NO_QUERY: DirectoryQuery = { search: "", page: 1 };

/** Le nombre par classe, à zéro pour toute classe absente de `counts`. */
export const classCounts = (counts: Partial<Record<ClassKey, number>>) =>
	perClass((classKey) => counts[classKey] ?? 0);

/** La recrue `instagramId`, de `classKey`. */
export function recruit(
	instagramId: string,
	username: string,
	classKey: ClassKey,
): VisiblePlayer {
	return {
		instagramId,
		username,
		classKey,
		arrivedAt: new Date("2026-11-21T10:00:00Z"),
	};
}

/** Une page de la lecture des joueurs visibles : vide, sauf ce que `page` en donne. */
export function emptyPage(
	page: Partial<VisiblePlayersPage> = {},
): VisiblePlayersPage {
	return {
		players: [],
		total: 0,
		classCounts: classCounts({}),
		page: 1,
		pageCount: 1,
		...page,
	};
}
