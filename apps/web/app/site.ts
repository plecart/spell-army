// Ce que l'environnement règle du site public, lu à chaque appel : rien ne se lit au chargement du
// module, que fait `next build`.
import { INSTAGRAM_USERNAME_PATTERN } from "donnees";

/** Les réglages du site que porte l'environnement. */
export interface SiteSettings {
	/** Vrai quand `BETA_BANNER` n'est pas vide : le bandeau « BÊTA — version de test » s'affiche. */
	betaBanner: boolean;
	/**
	 * Le pseudo du compte Instagram, sans `@` (`INSTAGRAM_ACCOUNT_HANDLE`) ; absent quand la
	 * variable manque ou n'a pas la forme d'un pseudo (`INSTAGRAM_USERNAME_PATTERN`).
	 */
	instagramHandle?: string;
}

/** Les réglages du site, lus dans l'environnement du moment. */
export function siteSettings(): SiteSettings {
	const handle = process.env.INSTAGRAM_ACCOUNT_HANDLE;
	return {
		betaBanner: Boolean(process.env.BETA_BANNER?.trim()),
		instagramHandle:
			handle && INSTAGRAM_USERNAME_PATTERN.test(handle) ? handle : undefined,
	};
}

/** L'adresse du compte Instagram `handle`. */
export function instagramUrl(handle: string): string {
	return `https://www.instagram.com/${handle}/`;
}
