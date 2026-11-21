import { type ClassKey, type Pedestal, PEDESTALS } from "personnages";
import { type Material, type Mesh, Object3D } from "three";
import { describe, expect, test } from "vitest";
import { stageOf } from "../app/vignettes/scene.ts";
import {
	createVignettes,
	type Render,
	vignetteOf,
} from "../app/vignettes/vignettes.ts";

// Un socle aux valeurs toutes distinctes : une dimension prise pour une autre se voit.
const PEDESTAL: Pedestal = {
	base: { topRadius: 0.5, bottomRadius: 0.7, height: 0.2, color: "#112233" },
	top: { radius: 0.45, thickness: 0.04, centerY: 0.01, color: "#aabbcc" },
	lift: 0.03,
};

/** Un faux moteur, sans WebGL : il note chaque classe rendue et rend l'adresse `image-<classe>`. */
function fakeEngine(failing?: ClassKey) {
	const rendered: ClassKey[] = [];
	const render: Render = async (classKey) => {
		rendered.push(classKey);
		if (classKey === failing) {
			throw new Error("modèle absent");
		}
		return `image-${classKey}`;
	};
	return { rendered, vignette: createVignettes(render) };
}

describe("vignettes : une image par classe, quel que soit le nombre de cartes", () => {
	test("24 cartes de 3 classes : 3 rendus, et chaque carte reçoit l'image de sa classe", async () => {
		const { rendered, vignette } = fakeEngine();
		const classes = ["wizard", "golem", "fairy"] as const;
		const cards = Array.from(
			{ length: 24 },
			(_, index) => classes[index % classes.length] as ClassKey,
		);
		const images = await Promise.all(
			cards.map((classKey) => vignette(classKey, PEDESTALS[classKey])),
		);
		expect(rendered.toSorted()).toEqual(["fairy", "golem", "wizard"]);
		expect(images).toEqual(cards.map((classKey) => `image-${classKey}`));
	});

	test("un rendu qui échoue laisse chaque carte de sa classe sur son décor seul, sans nouvel essai ; les autres classes ont leur image", async () => {
		const { rendered, vignette } = fakeEngine("golem");
		const cards = ["golem", "wizard", "golem"] as const;
		const images = await Promise.all(
			cards.map((classKey) => vignette(classKey, PEDESTALS[classKey])),
		);
		expect(images).toEqual([null, "image-wizard", null]);
		expect(rendered).toEqual(["golem", "wizard"]);
	});

	test("sans WebGL (ici, sous Node), la vignette du navigateur n'a pas d'image, sans erreur", async () => {
		await expect(vignetteOf("wizard", PEDESTALS.wizard)).resolves.toBeNull();
	});
});

describe("scène d'une vignette, construite sous Node par le module qui importe three", () => {
	// Une pièce du socle, telle que la scène la montre : dimensions, hauteur, couleur.
	function part(name: string) {
		const mesh = stageOf(new Object3D(), PEDESTAL).scene.getObjectByName(
			name,
		) as Mesh;
		const { radiusTop, radiusBottom, height } = (
			mesh.geometry as unknown as {
				parameters: Record<string, number>;
			}
		).parameters;
		return {
			radiusTop,
			radiusBottom,
			height,
			y: mesh.position.y,
			color: (
				mesh.material as Material & { color: { getHexString(): string } }
			).color.getHexString(),
		};
	}

	test("la base : tronc de cône à sa couleur, son dessus en y = 0", () => {
		expect(part("socle")).toEqual({
			radiusTop: 0.5,
			radiusBottom: 0.7,
			height: 0.2,
			y: -0.1,
			color: "112233",
		});
	});

	test("le disque du dessus : à la couleur de la classe, à sa hauteur", () => {
		expect(part("dessus")).toEqual({
			radiusTop: 0.45,
			radiusBottom: 0.45,
			height: 0.04,
			y: 0.01,
			color: "aabbcc",
		});
	});

	test("le personnage : posé à la hauteur du socle et tourné, son ombre juste sur le dessus", () => {
		const figure = new Object3D();
		const { scene } = stageOf(figure, PEDESTAL);
		const pose = scene.getObjectByName("personnage");
		expect(pose?.children).toEqual([figure]);
		expect(pose?.position.y).toBe(0.03);
		expect(pose?.rotation.y).toBe(0.38);
		expect(scene.getObjectByName("ombre")?.position.y).toBeCloseTo(0.031, 9);
	});
});
