"use client";

import type { ClassKey, Pedestal } from "personnages";
import { useEffect, useState } from "react";

/**
 * Le personnage de la classe `classKey` sur son socle `pedestal`, en image transparente posée sur
 * le décor de la carte dès que le moteur l'a rendue ; rien avant, ni sans modèle ou sans WebGL. Le
 * moteur se charge après l'affichage de la page, three.js compris.
 */
export function Figure({
	classKey,
	pedestal,
}: {
	classKey: ClassKey;
	pedestal: Pedestal;
}) {
	const [src, setSrc] = useState<string | null>(null);
	useEffect(() => {
		let shown = true;
		import("./vignettes.ts")
			.then(({ vignetteOf }) => vignetteOf(classKey, pedestal))
			.then(
				(url) => shown && setSrc(url),
				() => undefined,
			);
		return () => {
			shown = false;
		};
	}, [classKey, pedestal]);
	// biome-ignore lint/performance/noImgElement: une image rendue dans le navigateur, en adresse d'objet, que `next/image` ne sait pas optimiser.
	return src && <img src={src} alt="" />;
}
