// Le moteur de la scène vivante de la fiche (direction artistique § 3, « Scène de la fiche ») : la
// seule de la page, à côté du moteur de capture des vignettes, qui n'anime rien.
import { type ClassKey, PEDESTALS } from "personnages";
import {
	type BufferGeometry,
	type Mesh,
	type MeshBasicMaterial,
	type Object3D,
	WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { release, stageOf } from "../vignettes/scene.ts";
import { poseAt } from "./motion.ts";

// Deux pixels par point au plus : un écran à trois en ferait rendre 2,25 fois plus.
const MAX_PIXEL_RATIO = 2;
// Un glisser sur toute la largeur de la scène fait faire un tour au personnage.
const DRAG_TURN = 2 * Math.PI;
// Le plus long pas de temps d'une image à la suivante, en millisecondes : au retour d'un onglet
// caché, où le navigateur ne demande plus d'image, le personnage reprend là où il était.
const MAX_STEP = 100;

/**
 * Pose dans `frame` la scène vivante de la classe `classKey` : son modèle par défaut
 * (`/api/modeles/<classe>`), mis en scène par `stageOf` sur un canvas transparent, carré comme sa
 * caméra, qui suit la largeur de `frame`, par-dessus son décor. Le personnage tourne et flotte
 * selon `poseAt`, sauf sous `prefers-reduced-motion`, relu à chaque image ; un glisser horizontal le
 * fait tourner, et son temps s'arrête tant que le doigt le tient. Le défilement vertical reste au
 * doigt (`touch-action`, `globals.css`).
 *
 * @returns la fonction qui arrête la scène, retire le canvas et libère scène et moteur.
 * @throws sans modèle ou sans WebGL, avant d'avoir rien posé dans `frame`.
 */
export async function startLiveScene(
	frame: HTMLElement,
	classKey: ClassKey,
): Promise<() => void> {
	const { scene: figure } = await new GLTFLoader().loadAsync(
		`/api/modeles/${classKey}`,
	);
	const renderer = new WebGLRenderer({ alpha: true, antialias: true });
	renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
	const pedestal = PEDESTALS[classKey];
	const { scene, camera } = stageOf(figure, pedestal);
	// La pose et l'ombre, nommées par `stageOf`.
	const pose = scene.getObjectByName("personnage") as Object3D;
	const shadow = scene.getObjectByName("ombre") as Mesh<
		BufferGeometry,
		MeshBasicMaterial
	>;
	const canvas = renderer.domElement;
	const listening = new AbortController();
	const drag = dragOn(canvas, listening.signal);
	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
	const resize = new ResizeObserver(() =>
		renderer.setSize(frame.clientWidth, frame.clientWidth, false),
	);

	// Le temps du mouvement, en secondes.
	let seconds = 0;
	let last = performance.now();
	renderer.setAnimationLoop((now) => {
		if (!drag.held) {
			seconds += Math.min(now - last, MAX_STEP) / 1000;
		}
		last = now;
		const { turn, lift, shadowScale, shadowOpacity } = poseAt(
			seconds,
			drag.turn,
			reducedMotion.matches,
		);
		pose.rotation.y = turn;
		pose.position.y = pedestal.lift + lift;
		shadow.scale.setScalar(shadowScale);
		shadow.material.opacity = shadowOpacity;
		renderer.render(scene, camera);
	});
	resize.observe(frame);
	frame.append(canvas);

	return () => {
		listening.abort();
		resize.disconnect();
		canvas.remove();
		release(scene);
		// `dispose` arrête aussi la boucle d'animation (`cancelAnimationFrame`).
		renderer.dispose();
		renderer.forceContextLoss();
	};
}

/** La rotation au doigt : l'angle cumulé d'un glisser à l'autre, et le glisser en cours. */
interface Drag {
	/** L'angle tourné au doigt, en radians, jamais remis à zéro. */
	turn: number;
	/** Le pointeur qui tient le personnage et sa dernière abscisse ; absent hors d'un glisser. */
	held?: { pointerId: number; x: number };
}

/**
 * Suit les glissers horizontaux sur `canvas` jusqu'à ce que `signal` retire ses écouteurs : un
 * pointeur à la fois, capturé tant qu'il glisse, même hors du canvas.
 */
function dragOn(canvas: HTMLCanvasElement, signal: AbortSignal): Drag {
	const drag: Drag = { turn: 0 };
	canvas.addEventListener(
		"pointerdown",
		({ pointerId, clientX }) => {
			if (!drag.held) {
				canvas.setPointerCapture(pointerId);
				drag.held = { pointerId, x: clientX };
			}
		},
		{ signal },
	);
	canvas.addEventListener(
		"pointermove",
		({ pointerId, clientX }) => {
			const { held } = drag;
			if (held?.pointerId === pointerId) {
				drag.turn += ((clientX - held.x) / canvas.clientWidth) * DRAG_TURN;
				held.x = clientX;
			}
		},
		{ signal },
	);
	// Le lâcher, ou le défilement vertical que le navigateur reprend : la capture se perd.
	canvas.addEventListener(
		"lostpointercapture",
		({ pointerId }) => {
			if (drag.held?.pointerId === pointerId) {
				drag.held = undefined;
			}
		},
		{ signal },
	);
	return drag;
}
