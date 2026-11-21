"use client";

import { THEME_KEY } from "./theme.ts";

/** Le bouton qui bascule le thème, de clair à sombre ou l'inverse, et garde le choix. */
export function ThemeToggle() {
	return (
		<button
			type="button"
			className="icon-button"
			aria-label="Basculer entre thème clair et thème sombre"
			onClick={toggleTheme}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
			</svg>
		</button>
	);
}

// Passe au thème opposé à celui qu'on voit : le choix gardé, sinon celui du système.
function toggleTheme() {
	const root = document.documentElement;
	const shown =
		root.dataset.theme ??
		(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
	const theme = shown === "dark" ? "light" : "dark";
	root.dataset.theme = theme;
	try {
		localStorage.setItem(THEME_KEY, theme);
	} catch {
		// Stockage refusé (navigation privée, quota) : le choix vaut jusqu'au prochain chargement.
	}
}
