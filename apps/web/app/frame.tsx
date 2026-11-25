import type { ReactNode } from "react";
import { instagramUrl, type SiteSettings } from "./site.ts";
import { ThemeToggle } from "./theme-toggle.tsx";

/**
 * Le cadre de chaque page du site : le bandeau bêta quand il est réglé (ADR 0004, « Bandeau
 * bêta »), l'en-tête et son bouton de thème, la page, puis le pied, qui mène au compte Instagram
 * quand il est réglé.
 */
export function SiteFrame({
	settings: { betaBanner, instagramHandle },
	children,
}: {
	settings: SiteSettings;
	children: ReactNode;
}) {
	return (
		<>
			{betaBanner && <p className="beta">BÊTA — version de test</p>}
			<header className="site-header">
				<a className="logo" href="/">
					SPELL ARMY
				</a>
				<ThemeToggle />
			</header>
			{children}
			<footer className="site-footer">
				<a href="/informations">Informations</a>
				{instagramHandle && (
					<a href={instagramUrl(instagramHandle)}>Instagram</a>
				)}
			</footer>
		</>
	);
}
