// La scène d'une vignette : le personnage sur son socle, sous la caméra et la lumière des rendus de
// validation (`packages/personnages/blender/render_previews.py`), pour que la vignette ressemble à
// ce que le mainteneur y a jugé. Sans fond : le décor est celui de la carte.
import type { Pedestal } from "personnages";
import {
	BufferAttribute,
	CircleGeometry,
	CylinderGeometry,
	DirectionalLight,
	Group,
	HemisphereLight,
	Mesh,
	MeshBasicMaterial,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	type Object3D,
	PerspectiveCamera,
	Scene,
} from "three";

// Repris de `render_previews.py`, dont les unités et les intensités sont celles de three.js.
// ponytail: recopiés, sans test qui lie les deux langages ; un fichier de valeurs lu par le script
// et par ce module si elles bougent encore.
const FIELD_OF_VIEW = 28; // champ vertical, en degrés
const CAMERA = [0, 1.24, 6.4] as const;
const TARGET = [0, 1.12, 0] as const;
const TURN = 0.38; // le personnage tourné autour de la verticale, en radians
const SKY = "#ffffff";
const GROUND = "#8a7d66";
const HEMISPHERE = 1.4;
const SUNS = [
	{ color: "#fff2e0", intensity: 2.2, position: [2, 4, 3] },
	{ color: "#cfe3ff", intensity: 1.2, position: [-3, 2, -3] },
] as const;
const SEGMENTS = 48;
// L'ombre douce du personnage sur le socle : rayon, et opacité au centre, nulle au bord.
const SHADOW = 0.42;
const SHADOW_ALPHA = 0.45;
const SHADOW_GAP = 0.001; // au-dessus du disque, sans s'y mêler
// Les finitions de `workshop.py` : peinture vernie pour la base, mat pour le dessus.
const PAINT = { roughness: 0.45, clearcoat: 0.55, clearcoatRoughness: 0.35 };
const MATTE = { roughness: 0.8 };

/**
 * La scène d'une vignette et sa caméra : `figure`, le modèle d'une classe, tourné et posé à
 * `pedestal.lift` au-dessus de son socle, sous un ciel et deux lampes, sans ombre portée.
 */
export function stageOf(
	figure: Object3D,
	pedestal: Pedestal,
): { scene: Scene; camera: PerspectiveCamera } {
	const pose = new Group().add(figure);
	pose.name = "personnage";
	pose.position.y = pedestal.lift;
	pose.rotation.y = TURN;
	const suns = SUNS.map(({ color, intensity, position }) => {
		const sun = new DirectionalLight(color, intensity);
		sun.position.fromArray(position);
		return sun;
	});
	const scene = new Scene().add(
		pose,
		pedestalOf(pedestal),
		new HemisphereLight(SKY, GROUND, HEMISPHERE),
		...suns,
	);
	const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 100); // image carrée
	camera.position.set(...CAMERA);
	camera.lookAt(...TARGET);
	return { scene, camera };
}

/**
 * Le socle de figurine (direction artistique § 5, « Sol ») : la base, tronc de cône sombre dont le
 * dessus est en y = 0, le disque du dessus à la couleur de la classe, et l'ombre douce du
 * personnage.
 */
function pedestalOf({ base, top }: Pedestal): Group {
	const trunk = new Mesh(
		new CylinderGeometry(
			base.topRadius,
			base.bottomRadius,
			base.height,
			SEGMENTS,
		),
		new MeshPhysicalMaterial({ color: base.color, ...PAINT }),
	);
	trunk.name = "socle";
	trunk.position.y = -base.height / 2;
	const disc = new Mesh(
		new CylinderGeometry(top.radius, top.radius, top.thickness, SEGMENTS),
		new MeshStandardMaterial({ color: top.color, ...MATTE }),
	);
	disc.name = "dessus";
	disc.position.y = top.centerY;
	const shadow = shadowOf();
	shadow.position.y = top.centerY + top.thickness / 2 + SHADOW_GAP;
	return new Group().add(trunk, disc, shadow);
}

// Un disque noir à plat, opaque de `SHADOW_ALPHA` en son centre, premier sommet de `CircleGeometry`,
// transparent sur son bord : l'opacité décroît avec la distance au centre.
function shadowOf(): Mesh {
	const geometry = new CircleGeometry(SHADOW, SEGMENTS).rotateX(-Math.PI / 2);
	const colors = new Float32Array(geometry.getAttribute("position").count * 4);
	colors[3] = SHADOW_ALPHA;
	geometry.setAttribute("color", new BufferAttribute(colors, 4));
	const shadow = new Mesh(
		geometry,
		new MeshBasicMaterial({
			vertexColors: true,
			transparent: true,
			depthWrite: false,
		}),
	);
	shadow.name = "ombre";
	return shadow;
}
