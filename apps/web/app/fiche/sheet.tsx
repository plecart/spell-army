"use client";

import { useRouter } from "next/navigation.js";
import { type ReactNode, useEffect, useRef } from "react";
import { isBackdropClick } from "../backdrop.ts";

/**
 * Où mène la fermeture de la fiche : `"back"` revient d'un pas dans l'historique, à l'annuaire
 * laissé derrière dans son état (fiche ouverte d'un clic) ; `"home"` mène à l'annuaire nu, `/`
 * (fiche ouverte directement, sans annuaire derrière elle dans l'historique).
 */
export type SheetClose = "back" | "home";

/**
 * La feuille qui porte la fiche par-dessus l'annuaire (direction artistique § 3, « Fiche ») : un
 * `<dialog>` modal, ouvert au montage et nommé par le titre `labelledBy`, qui monte du bas de
 * l'écran et défile en lui-même (`globals.css`, `.sheet`). Le navigateur y porte le focus et rend
 * inerte le reste de la page. Le bouton « Fermer », Échap et un appui hors de la feuille la
 * ferment par la route, selon `onClose` ; le retour du navigateur la ferme aussi, par la route.
 * Démontée, la feuille rend le focus à l'élément qui l'avait à son ouverture, la carte d'origine,
 * s'il est encore dans la page : un `<dialog>` retiré par la navigation ne le rend pas.
 */
export function Sheet({
	labelledBy,
	onClose,
	children,
}: {
	labelledBy: string;
	onClose: SheetClose;
	children: ReactNode;
}) {
	const router = useRouter();
	const sheet = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const dialog = sheet.current;
		const opener = document.activeElement;
		dialog?.showModal();
		return () => {
			// Fermée avant de rendre le focus : remontée aussitôt (mode strict de React, en
			// développement), la feuille se rouvre depuis le même élément.
			dialog?.close();
			if (opener instanceof HTMLElement && opener.isConnected) {
				opener.focus();
			}
		};
	}, []);
	const close = () => (onClose === "back" ? router.back() : router.push("/"));
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: au clavier, Échap ferme déjà la feuille ; ce clic n'est que l'appui hors de la feuille.
		<dialog
			className="sheet"
			aria-labelledby={labelledBy}
			ref={sheet}
			onCancel={(event) => {
				// Échap ferme par la route, qui retire la feuille, et non par le navigateur seul.
				event.preventDefault();
				close();
			}}
			onClick={(event) => {
				if (isBackdropClick(event)) {
					close();
				}
			}}
		>
			<div className="sheet-body">
				<button
					type="button"
					className="icon-button sheet-close"
					aria-label="Fermer"
					onClick={close}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
				{children}
			</div>
		</dialog>
	);
}
