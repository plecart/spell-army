"use client";

import type { ClassKey } from "personnages";
import { useEffect, useRef } from "react";
import { BACKDROP_IMAGES } from "../class-style.ts";

/**
 * La scène de la fiche : le décor de la classe `classKey`, et par-dessus son personnage vivant
 * (`startLiveScene`), seule scène animée de la page. Décorative, tout ce qu'elle montre étant écrit
 * sur la fiche. Le moteur se charge après l'affichage de la page, three.js compris ; sans modèle ou
 * sans WebGL, le décor reste seul, sans erreur. Démontée, la scène est libérée, et chaque montage
 * a son propre canvas : le second montage du mode strict de React ne reprend pas un contexte perdu.
 */
export function LiveStage({ classKey }: { classKey: ClassKey }) {
	const frame = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const container = frame.current;
		if (!container) {
			return;
		}
		const started = import("./live-scene.ts")
			.then(({ startLiveScene }) => startLiveScene(container, classKey))
			.catch(() => undefined);
		return () => {
			started.then((stop) => stop?.());
		};
	}, [classKey]);
	return (
		<div
			ref={frame}
			className="vignette"
			aria-hidden="true"
			style={{ backgroundImage: BACKDROP_IMAGES[classKey] }}
		/>
	);
}
