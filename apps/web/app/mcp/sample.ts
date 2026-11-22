// L'échantillon des simulations des outils, celui de l'équilibre (issue #19, critère « Équilibre ») :
// les graines 1 à 2 000, pour mesurer_sort comme pour le facteur d'échelle de creer_monstre (issue
// #20, Décisions, 8). La route MCP tient 300 s au plus (`maxDuration`).
//
// mesurer_sort, relevé le 2026-11-21 sur le poste de développement (Node 24.3), deux appels par
// `callTool` : 14,3 et 13,7 s, de l'ordre de la dizaine de secondes ; un pic de mémoire de 0,3 Go
// pour tout le processus de test, la mesure ne gardant qu'une armée à la fois.
//
// creer_monstre, relevé le 2026-11-22 sur le même poste (Node 24.3, Windows 11), `scaleFactor` seul
// pour le golem de lave sur la réserve de départ, une fois, par un script hors du dépôt : 15,1 s, de
// l'ordre de la dizaine de secondes ; un pic de mémoire du processus (`maxRSS`) de 0,5 Go, toutes
// les armées de l'échantillon gardées d'un coup. Loin des 2 Go et des 300 s d'une fonction sur le
// plan Hobby de l'ADR 0001 (https://vercel.com/docs/functions/limitations, lue le 2026-11-22) :
// l'échantillon n'est pas réduit.
export const SAMPLE_LAST_SEED = 2000;

/** Les graines 1 à `lastSeed`, en texte, comme `combat` les lit. */
export function sampleSeeds(lastSeed: number): string[] {
	return Array.from({ length: lastSeed }, (_, index) => String(index + 1));
}
