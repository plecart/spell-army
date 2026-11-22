import { type PlayerSheet, readVisiblePlayer } from "joueurs";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { database } from "../environment.ts";

/**
 * La recrue visible d'identifiant `identifiant`, telle que sa fiche la montre, lue à la requête :
 * `connection()` exclut du rendu statique la page qui l'appelle (doc Next.js 16.4.6,
 * « connection »), et un retrait disparaît de la fiche à la première requête qui atteint le
 * serveur, passé le cache du CDN (`next.config.ts`).
 *
 * @throws l'erreur de `notFound()`, que Next.js rend en 404, pour une recrue retirée, inconnue ou à
 * l'identifiant hors forme (`readVisiblePlayer`).
 */
export async function readFiche(identifiant: string): Promise<PlayerSheet> {
	await connection();
	const player = await readVisiblePlayer(database(), identifiant);
	if (!player) {
		notFound();
	}
	return player;
}
