// Le mouvement du personnage dans la scène vivante de la fiche (direction artistique § 3, « Scène
// de la fiche ») : il tourne lentement sur lui-même et flotte au-dessus de son socle, et son ombre
// suit sa hauteur.
import { TURN } from "../vignettes/scene.ts";

/** La pose du personnage à un instant, et celle de son ombre sur le socle. */
export interface Pose {
	/** Son angle autour de la verticale, en radians. */
	turn: number;
	/** Sa hauteur au-dessus de sa hauteur de repos (`Pedestal.lift`), en unités du fichier 3D. */
	lift: number;
	/** L'échelle de son ombre : 1 au repos, celle des vignettes. */
	shadowScale: number;
	/** Le facteur d'opacité de son ombre : 1 au repos, celle des vignettes. */
	shadowOpacity: number;
}

// Réglages visuels, sobres, à juger à l'écran.
// Un tour sur lui-même en 24 s, en radians par seconde.
const SPIN = (2 * Math.PI) / 24;
// Le flottement monte de 8 centièmes d'unité au plus, 4 % de la taille du personnage (environ 2
// unités, direction artistique § 7, « Repère »), et redescend, en 3,5 s.
const FLOAT_HEIGHT = 0.08;
const FLOAT_PERIOD = 3.5;
// Au plus haut, l'ombre perd un cinquième de sa taille et deux cinquièmes de son opacité.
const SHADOW_SHRINK = 0.2;
const SHADOW_FADE = 0.4;

/**
 * La pose du personnage `seconds` secondes après l'ouverture de la fiche, tourné en plus de
 * `dragTurn` radians au doigt. Il part de l'orientation des vignettes (`TURN`), au repos, puis
 * tourne lentement et flotte, sans jamais descendre sous son repos : plus il monte, plus son ombre
 * rétrécit et pâlit. Sous `reducedMotion`, il ne bouge pas seul : le temps reste à l'instant 0.
 *
 * L'appelant accumule `dragTurn` d'un glisser à l'autre, sans le remettre à zéro au lâcher : le
 * personnage reprend sa rotation lente là où le doigt l'a laissé, sans saut.
 */
export function poseAt(
	seconds: number,
	dragTurn: number,
	reducedMotion: boolean,
): Pose {
	const time = reducedMotion ? 0 : seconds;
	// La part du flottement atteinte : 0 au repos, 1 au plus haut.
	const rise = (1 - Math.cos((2 * Math.PI * time) / FLOAT_PERIOD)) / 2;
	return {
		turn: TURN + dragTurn + SPIN * time,
		lift: FLOAT_HEIGHT * rise,
		shadowScale: 1 - SHADOW_SHRINK * rise,
		shadowOpacity: 1 - SHADOW_FADE * rise,
	};
}
