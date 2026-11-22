"use client";

import { type ReactNode, useRef } from "react";
import { isBackdropClick } from "../backdrop.ts";

/**
 * Le bouton du filtre par classe et la feuille qu'il ouvre depuis le bas de l'écran (direction
 * artistique § 3, « Filtre par classe »), qui porte `children`. La feuille est un `<dialog>`
 * modal : le navigateur y porte le focus, rend inerte le reste de la page et rend le focus au
 * bouton à la fermeture ; Échap, le bouton « Fermer » et un appui hors de la feuille la ferment.
 */
export function FilterSheet({ children }: { children: ReactNode }) {
	const sheet = useRef<HTMLDialogElement>(null);
	return (
		<>
			<button
				type="button"
				className="icon-button"
				aria-label="Filtrer par classe"
				aria-haspopup="dialog"
				onClick={() => sheet.current?.showModal()}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M4 7h16M7 12h10M10 17h4" />
				</svg>
			</button>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: au clavier, Échap ferme déjà le dialogue modal ; ce clic n'est que l'appui hors de la feuille. */}
			<dialog
				className="sheet"
				aria-labelledby="filter-title"
				ref={sheet}
				onClick={(event) => {
					if (isBackdropClick(event)) {
						event.currentTarget.close();
					}
				}}
			>
				<div className="sheet-body">
					<div className="sheet-header">
						<h2 id="filter-title">Filtrer par classe</h2>
						<form method="dialog">
							<button type="submit" className="icon-button" aria-label="Fermer">
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<path d="M6 6l12 12M18 6L6 18" />
								</svg>
							</button>
						</form>
					</div>
					{children}
				</div>
			</dialog>
		</>
	);
}
