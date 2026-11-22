import type { MouseEvent } from "react";

/**
 * Vrai si `event` est un appui hors d'une feuille, sur son fond : il atteint le `<dialog>` lui-même,
 * jamais son contenu, car une feuille n'a pas de marge intérieure et son contenu la remplit
 * (`globals.css`, `.sheet`).
 */
export const isBackdropClick = (event: MouseEvent<HTMLDialogElement>) =>
	event.target === event.currentTarget;
