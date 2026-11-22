import { type ClassKey, PEDESTALS } from "personnages";
import {
	BoxGeometry,
	type BufferGeometry,
	type Material,
	Mesh,
	type MeshBasicMaterial,
	MeshStandardMaterial,
	type Object3D,
	type Scene,
} from "three";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { startLiveScene } from "../app/fiche/live-scene.ts";
import { type Pose, poseAt } from "../app/fiche/motion.ts";

/*
 * Le moteur de la scène vivante de la fiche (`startLiveScene`), sous Node. Ce que Node n'a pas est
 * simulé au plus juste : le DOM que la scène touche, `matchMedia`, `ResizeObserver`, et la frontière
 * de three.js avec le navigateur, le moteur WebGL et le chargement du modèle par le réseau. La
 * scène, le socle et la pose restent ceux de three.js.
 *
 * Les comportements 1 à 6 sont ceux du brief du bloc C de #18, point 2 : à la passe 3 de relecture
 * de la PR #51, aucun test ne les tenait, les six fuyaient. Les suivants ont été trouvés à la
 * lecture du moteur.
 */

const fake = vi.hoisted(() => {
	/** Un élément réduit à ce que la scène en touche : sa largeur, ses enfants, ses pointeurs capturés. */
	class FakeElement extends EventTarget {
		clientWidth = 0;
		readonly children: FakeElement[] = [];
		readonly captures: number[] = [];
		parent: FakeElement | undefined;
		append(child: FakeElement) {
			this.children.push(child);
			child.parent = this;
		}
		remove() {
			this.parent?.children.splice(this.parent.children.indexOf(this), 1);
			this.parent = undefined;
		}
		setPointerCapture(pointerId: number) {
			this.captures.push(pointerId);
		}
	}

	/** Le moteur WebGL, sans GPU : il note ce que la scène lui demande. */
	class FakeRenderer {
		readonly domElement = new FakeElement();
		readonly parameters: object;
		pixelRatio = 0;
		size: unknown[] = [];
		loop: ((now: number) => void) | null = null;
		scene: Scene | undefined;
		disposed = 0;
		contextLost = 0;
		constructor(parameters: object) {
			if (three.contextError) {
				throw three.contextError;
			}
			this.parameters = parameters;
			three.renderers.push(this);
		}
		setPixelRatio(ratio: number) {
			this.pixelRatio = ratio;
		}
		setSize(...size: unknown[]) {
			this.size = size;
		}
		setAnimationLoop(loop: ((now: number) => void) | null) {
			this.loop = loop;
		}
		render(scene: Scene) {
			this.scene = scene;
		}
		// Comme celui de three.js 0.187.0 (`src/renderers/WebGLRenderer.js`, `dispose`, qui finit par
		// `animation.stop()`), il arrête aussi la boucle d'animation.
		dispose() {
			this.disposed += 1;
			this.loop = null;
		}
		forceContextLoss() {
			this.contextLost += 1;
		}
	}

	const three = {
		FakeElement,
		FakeRenderer,
		/** Les moteurs créés, du premier au dernier. */
		renderers: [] as FakeRenderer[],
		/** L'erreur que lève le moteur à sa création, faute de contexte WebGL ; aucune par défaut. */
		contextError: undefined as Error | undefined,
		/** Les adresses des modèles demandés au chargeur. */
		urls: [] as string[],
		/** Ce que rend le chargeur du modèle. */
		load: async (): Promise<{ scene: Object3D }> => {
			throw new Error("aucun modèle simulé");
		},
	};
	return three;
});

// Les simulacres ne portent que ce que la scène appelle, d'où `as never`.
vi.mock(import("three"), async (importOriginal) => ({
	...(await importOriginal()),
	WebGLRenderer: fake.FakeRenderer as never,
}));
vi.mock(import("three/examples/jsm/loaders/GLTFLoader.js"), () => ({
	GLTFLoader: class {
		loadAsync(url: string) {
			fake.urls.push(url);
			return fake.load();
		}
	} as never,
}));

type FakeElement = InstanceType<typeof fake.FakeElement>;

const CLASS: ClassKey = "vampire";
const PEDESTAL = PEDESTALS[CLASS];
// La largeur du cadre et du canvas, en points : un glisser d'un quart de largeur fait un quart de
// tour.
const WIDTH = 200;
const QUARTER = WIDTH / 4;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// Le repos : la pose à l'ouverture, ou sous mouvement réduit, sans main posée.
const REST = poseAt(0, 0, true);

/** Un `ResizeObserver` qui note ce qu'il observe ; le test le déclenche à la main. */
class FakeResizeObserver {
	readonly observed = new Set<object>();
	readonly callback: () => void;
	constructor(callback: () => void) {
		this.callback = callback;
		observers.push(this);
	}
	observe(target: object) {
		this.observed.add(target);
	}
	disconnect() {
		this.observed.clear();
	}
}

let observers: FakeResizeObserver[];
// La préférence de mouvement réduit, que `matchMedia` rend vivante, comme le navigateur.
let reducedMotion: { matches: boolean };

beforeEach(() => {
	fake.renderers.length = 0;
	fake.urls.length = 0;
	fake.contextError = undefined;
	fake.load = async () => ({ scene: figure() });
	observers = [];
	reducedMotion = { matches: false };
	vi.stubGlobal("matchMedia", (query: string) =>
		query === REDUCED_MOTION ? reducedMotion : { matches: false },
	);
	vi.stubGlobal("ResizeObserver", FakeResizeObserver);
	vi.stubGlobal("devicePixelRatio", 1);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

// Le modèle d'une classe tel que le rend le chargeur : une figure maillée.
const figure = () => new Mesh(new BoxGeometry(), new MeshStandardMaterial());

// Un évènement `type` du pointeur `pointerId`, à l'abscisse `clientX`.
const pointer = (
	target: EventTarget,
	type: string,
	pointerId: number,
	clientX = 0,
) =>
	target.dispatchEvent(Object.assign(new Event(type), { pointerId, clientX }));

// `pose` au milliardième : la scène la recompose (hauteur du socle ajoutée, retirée par `shown`).
const near = (pose: Pose) =>
	Object.fromEntries(
		Object.entries(pose).map(([key, value]) => [key, expect.closeTo(value, 9)]),
	);

/** La pose que montre `scene` : celle du personnage au-dessus de son socle, et de son ombre. */
function shown(scene: Scene | undefined): Pose {
	const pose = scene?.getObjectByName("personnage");
	const shadow = scene?.getObjectByName("ombre") as
		| Mesh<BufferGeometry, MeshBasicMaterial>
		| undefined;
	if (!pose || !shadow) {
		throw new Error("aucune scène rendue");
	}
	return {
		turn: pose.rotation.y,
		lift: pose.position.y - PEDESTAL.lift,
		shadowScale: shadow.scale.x,
		shadowOpacity: shadow.material.opacity,
	};
}

/** Ce que la scène laisse dans `frame` et au navigateur : canvas, observation, contextes WebGL. */
const leftovers = (frame: FakeElement) => ({
	canvas: frame.children.length,
	observing: observers.reduce(
		(count, { observed }) => count + observed.size,
		0,
	),
	contexts: fake.renderers.filter(({ contextLost }) => contextLost === 0)
		.length,
});

/** La scène vivante de `CLASS`, posée dans un cadre neuf de largeur `WIDTH`. */
async function startScene() {
	const frame = new fake.FakeElement();
	frame.clientWidth = WIDTH;
	const stop = await startLiveScene(frame as unknown as HTMLElement, CLASS);
	const renderer = fake.renderers.at(-1);
	if (!renderer) {
		throw new Error("aucun moteur créé");
	}
	const canvas = renderer.domElement;
	canvas.clientWidth = WIDTH;
	return {
		frame,
		renderer,
		canvas,
		stop,
		/** La pose que montre la scène à l'image de l'instant `now`, en millisecondes. */
		frameAt: (now: number) => {
			renderer.loop?.(now);
			return shown(renderer.scene);
		},
	};
}

/** La scène vivante ne démarre pas, sur `failure`, et ne laisse ni canvas ni contexte. */
async function expectNothingLeft(failure: Error) {
	const frame = new fake.FakeElement();
	await expect(
		startLiveScene(frame as unknown as HTMLElement, CLASS),
	).rejects.toBe(failure);
	expect(leftovers(frame)).toEqual({ canvas: 0, observing: 0, contexts: 0 });
}

test.each<[string, () => Promise<void>]>([
	[
		"1. sous prefers-reduced-motion, relu à chaque image, le personnage reste au repos",
		async () => {
			const { frameAt } = await startScene();
			reducedMotion.matches = true;
			for (const now of [0, 50, 100]) {
				expect(frameAt(now)).toEqual(near(REST));
			}
			reducedMotion.matches = false;
			expect(frameAt(150)).not.toEqual(near(REST));
			reducedMotion.matches = true;
			expect(frameAt(200)).toEqual(near(REST));
		},
	],
	[
		"2. le temps s'arrête tant que le doigt tient le personnage, et reprend au lâcher",
		async () => {
			const { canvas, frameAt } = await startScene();
			frameAt(0);
			expect(frameAt(50)).toEqual(near(poseAt(0.05, 0, false)));
			pointer(canvas, "pointerdown", 1);
			for (const now of [100, 150]) {
				expect(frameAt(now)).toEqual(near(poseAt(0.05, 0, false)));
			}
			pointer(canvas, "lostpointercapture", 1);
			expect(frameAt(200)).toEqual(near(poseAt(0.1, 0, false)));
		},
	],
	[
		"3. le temps part de la première image, au repos, puis avance de 100 ms au plus d'une image à la suivante, au retour d'un onglet caché",
		async () => {
			const { frameAt } = await startScene();
			expect(frameAt(5_000)).toEqual(near(REST));
			expect(frameAt(15_000)).toEqual(near(poseAt(0.1, 0, false)));
		},
	],
	[
		"4. l'angle au doigt se cumule d'un glisser à l'autre, sans saut au lâcher",
		async () => {
			const { canvas, frameAt } = await startScene();
			frameAt(0);
			pointer(canvas, "pointerdown", 1, 0);
			pointer(canvas, "pointermove", 1, QUARTER);
			expect(frameAt(50)).toEqual(near(poseAt(0, Math.PI / 2, false)));
			pointer(canvas, "lostpointercapture", 1);
			expect(frameAt(100)).toEqual(near(poseAt(0.05, Math.PI / 2, false)));
			pointer(canvas, "pointerdown", 1, QUARTER);
			pointer(canvas, "pointermove", 1, 2 * QUARTER);
			expect(frameAt(150)).toEqual(near(poseAt(0.05, Math.PI, false)));
		},
	],
	[
		"5. à l'arrêt, la scène libère tout : boucle, écouteurs, observateur, canvas, scène, moteur et contexte",
		async () => {
			const { frame, renderer, canvas, stop, frameAt } = await startScene();
			frameAt(0);
			// Les géométries et les matériaux de la scène, chacun noté à sa libération.
			const resources = new Set<BufferGeometry | Material>();
			renderer.scene?.traverse((object) => {
				if (object instanceof Mesh) {
					resources.add(object.geometry);
					for (const material of [object.material].flat()) {
						resources.add(material);
					}
				}
			});
			const released = new Set<BufferGeometry | Material>();
			for (const resource of resources) {
				resource.addEventListener("dispose", () => released.add(resource));
			}
			// Un appui du doigt, capturé tant que le canvas écoute.
			const listening = () => {
				const captures = canvas.captures.length;
				pointer(canvas, "pointerdown", 1);
				pointer(canvas, "lostpointercapture", 1);
				return canvas.captures.length > captures;
			};
			const state = () => ({
				...leftovers(frame),
				looping: renderer.loop !== null,
				listening: listening(),
				unreleased: resources.size - released.size,
				disposed: renderer.disposed,
			});

			expect(state()).toEqual({
				canvas: 1,
				observing: 1,
				contexts: 1,
				looping: true,
				listening: true,
				unreleased: resources.size,
				disposed: 0,
			});
			expect(resources.size).toBeGreaterThan(0);
			stop();
			expect(state()).toEqual({
				canvas: 0,
				observing: 0,
				contexts: 0,
				looping: false,
				listening: false,
				unreleased: 0,
				disposed: 1,
			});
		},
	],
	[
		"6. sans modèle, la scène ne laisse ni canvas ni contexte",
		async () => {
			const failure = new Error("modèle absent");
			fake.load = async () => {
				throw failure;
			};
			await expectNothingLeft(failure);
		},
	],
	[
		"6. sans WebGL, la scène ne laisse ni canvas ni contexte",
		async () => {
			fake.contextError = new Error(
				"THREE.WebGLRenderer: Error creating WebGL context.",
			);
			await expectNothingLeft(fake.contextError);
		},
	],
	[
		"6. quand sa mise en place lève, ici sans ResizeObserver, la scène ne laisse ni canvas ni contexte",
		async () => {
			const failure = new ReferenceError("ResizeObserver is not defined");
			vi.stubGlobal(
				"ResizeObserver",
				class {
					constructor() {
						throw failure;
					}
				},
			);
			await expectNothingLeft(failure);
		},
	],
	[
		"7. un seul pointeur tient le personnage à la fois, capturé même hors du canvas",
		async () => {
			const { canvas, frameAt } = await startScene();
			frameAt(0);
			pointer(canvas, "pointerdown", 1, 0);
			pointer(canvas, "pointerdown", 2, 0);
			pointer(canvas, "pointermove", 1, QUARTER);
			// Le second pointeur glisse en dernier : les glissers se cumulent jusqu'à la dernière
			// abscisse suivie, et la sienne doit en être absente.
			pointer(canvas, "pointermove", 2, 3 * QUARTER);
			pointer(canvas, "lostpointercapture", 2);
			expect(canvas.captures).toEqual([1]);
			expect(frameAt(50)).toEqual(near(poseAt(0, Math.PI / 2, false)));
		},
	],
	[
		"8. le canvas, posé dans le cadre, reste carré à la largeur du cadre",
		async () => {
			const { frame, canvas, renderer } = await startScene();
			expect(frame.children).toEqual([canvas]);
			frame.clientWidth = 320;
			for (const { observed, callback } of observers) {
				if (observed.has(frame)) {
					callback();
				}
			}
			expect(renderer.size).toEqual([320, 320, false]);
		},
	],
	[
		"9. la scène se rend à deux pixels par point au plus",
		async () => {
			for (const [screen, rendered] of [
				[3, 2],
				[1.5, 1.5],
			]) {
				vi.stubGlobal("devicePixelRatio", screen);
				const { renderer } = await startScene();
				expect(renderer.pixelRatio).toBe(rendered);
			}
		},
	],
	[
		"10. le modèle de la classe, servi par /api/modeles/<classe>, sur le socle à la couleur de sa classe",
		async () => {
			const model = figure();
			fake.load = async () => ({ scene: model });
			const { renderer, frameAt } = await startScene();
			frameAt(0);
			expect(fake.urls).toEqual(["/api/modeles/vampire"]);
			const scene = renderer.scene;
			expect(scene?.getObjectByName("personnage")?.children[0]).toBe(model);
			const disc = scene?.getObjectByName("dessus") as
				| Mesh<BufferGeometry, MeshStandardMaterial>
				| undefined;
			expect(`#${disc?.material.color.getHexString()}`).toBe(
				PEDESTAL.top.color,
			);
		},
	],
	[
		"11. le canvas est transparent et lissé : le décor de la classe se voit derrière le personnage",
		async () => {
			const { renderer } = await startScene();
			expect(renderer.parameters).toEqual({ alpha: true, antialias: true });
		},
	],
])("scène vivante de la fiche — %s", async (_, check) => {
	await check();
});
