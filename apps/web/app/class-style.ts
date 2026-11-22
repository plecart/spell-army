// L'habillage d'une classe à l'écran, commun aux cartes de l'annuaire et à la fiche : sa couleur
// et son décor (direction artistique § 2 et § 5).
import { BACKDROPS, CLASS_COLORS, type ClassKey, perClass } from "personnages";
import type { CSSProperties } from "react";

/**
 * La couleur de la classe `classKey`, en variable CSS `--class-color` que lisent sa pastille, sa
 * vignette et les barres de la fiche (`globals.css`).
 */
export const classColor = (classKey: ClassKey) =>
	({ "--class-color": CLASS_COLORS[classKey] }) as CSSProperties;

/**
 * Le décor de chaque classe (direction artistique § 5), en image de fond CSS de sa vignette.
 * ponytail: le document se répète dans chaque carte (1 à 2,5 Ko encodé, 24 fois par page) ; une
 * image par classe servie à part si le poids de la page compte.
 */
export const BACKDROP_IMAGES = perClass(
	(classKey) =>
		`url("data:image/svg+xml,${encodeURIComponent(BACKDROPS[classKey])}")`,
);
