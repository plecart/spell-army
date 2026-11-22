// Les vignettes des cartes (direction artistique § 3, « Vignettes ») : un seul moteur three.js dans
// le navigateur, une image par classe présente sur la page, que toutes ses cartes reprennent —
// jamais un contexte WebGL par carte. La fiche reprend leur mise en scène (`stageOf`) dans sa scène
// vivante, sans capture.
import type { ClassKey, Pedestal } from "personnages";
import { WebGLRenderer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { release, stageOf } from "./scene.ts";

/** Le rendu d'une classe sur son socle : l'adresse de son image, nulle quand elle ne se rend pas. */
export type Render = (
	classKey: ClassKey,
	pedestal: Pedestal,
) => Promise<string | null>;

/**
 * Les vignettes que rend `render`, une fois par classe : toutes les cartes d'une classe attendent
 * la même promesse. Un rendu qui échoue vaut `null`, gardé lui aussi : la carte garde son décor.
 */
export function createVignettes(render: Render): Render {
	const images = new Map<ClassKey, Promise<string | null>>();
	return (classKey, pedestal) => {
		let image = images.get(classKey);
		if (!image) {
			image = render(classKey, pedestal).catch(() => null);
			images.set(classKey, image);
		}
		return image;
	};
}

// Le côté d'une image, en pixels : une vignette de téléphone, d'environ 150 points à 375 de large,
// à trois pixels par point.
// ponytail: taille fixe ; une vignette atteint 284 points vers 960 de large, où l'image s'agrandit
// d'un dixième à deux pixels par point. Rendre à la taille affichée si cela se voit.
const SIZE = 512;

let pageRenderer: WebGLRenderer | undefined;

// Le moteur de la page, créé au premier rendu, au fond transparent. Lève sans WebGL 2.
function engine(): WebGLRenderer {
	if (!pageRenderer) {
		pageRenderer = new WebGLRenderer({ alpha: true, antialias: true });
		pageRenderer.setSize(SIZE, SIZE, false);
	}
	return pageRenderer;
}

// Le tour du moteur : chaque rendu attend que le précédent ait capturé son image.
let turn: Promise<unknown> = Promise.resolve();

/**
 * Rend une classe dans le navigateur : son modèle par défaut (`/api/modeles/<classe>`), chargé en
 * même temps que ceux des autres classes, posé sur son socle, puis rendu et capturé en PNG à son
 * tour sur le moteur de la page ; la scène est libérée ensuite. Lève sans WebGL ou sans modèle.
 */
async function renderInBrowser(
	classKey: ClassKey,
	pedestal: Pedestal,
): Promise<string | null> {
	const renderer = engine();
	const { scene: figure } = await new GLTFLoader().loadAsync(
		`/api/modeles/${classKey}`,
	);
	const { scene, camera } = stageOf(figure, pedestal);
	const png = turn.then(() => {
		renderer.render(scene, camera);
		return new Promise<Blob | null>((resolve) =>
			renderer.domElement.toBlob(resolve),
		);
	});
	turn = png.catch(() => undefined);
	// ponytail: l'adresse vit avec la page, une par classe au plus, et la fiche n'en crée aucune ; la
	// révoquer si un rendu en crée davantage.
	const blob = await png.finally(() => release(scene));
	return blob && URL.createObjectURL(blob);
}

/**
 * L'image du personnage de `classKey` sur son socle `pedestal`, rendue une fois par page dans le
 * navigateur ; nulle sans modèle ou sans WebGL.
 */
export const vignetteOf = createVignettes(renderInBrowser);
