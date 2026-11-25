import type { Metadata } from "next";
import { instagramUrl, siteSettings } from "../site.ts";

export const metadata: Metadata = { title: "Informations · Spell Army" };

/**
 * La page « Informations » (ADR 0003, « RGPD ») : qui traite les données des abonnés, lesquelles,
 * pourquoi, sur quelle base, et comment en demander le retrait : les cinq points de l'ADR, sans
 * autre promesse. Le compte Instagram, lié quand `INSTAGRAM_ACCOUNT_HANDLE` est réglée, est le seul
 * contact. Statique : Next.js la rend au build, l'environnement de ce moment compris.
 */
export default function Informations() {
	const { instagramHandle } = siteSettings();
	const account = instagramHandle ? (
		<a href={instagramUrl(instagramHandle)}>@{instagramHandle}</a>
	) : (
		"le compte Instagram du jeu"
	);
	return (
		<main className="informations">
			<h1>Informations</h1>
			<section>
				<h2>Qui traite ces données</h2>
				<p>
					Bernier Pacôme, éditeur du jeu, joignable par message privé sur{" "}
					{account}.
				</p>
			</section>
			<section>
				<h2>Quelles données</h2>
				<p>
					L'identifiant Instagram et le pseudo de chaque abonné du compte
					Instagram du jeu, rien d'autre.
				</p>
			</section>
			<section>
				<h2>Pourquoi</h2>
				<p>
					Pour donner à chaque abonné une recrue, avec sa classe, ses
					statistiques et son sort, et l'afficher dans l'annuaire.
				</p>
			</section>
			<section>
				<h2>Sur quelle base</h2>
				<p>L'intérêt légitime.</p>
			</section>
			<section>
				<h2>Demander ton retrait</h2>
				<p>
					Demande-le par message privé sur {account}. Ton pseudo est alors
					effacé, et ton identifiant mis sur une liste d'exclusion, que l'import
					respecte.
				</p>
			</section>
		</main>
	);
}
