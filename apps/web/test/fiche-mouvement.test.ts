import { describe, expect, test } from "vitest";
import { type Pose, poseAt } from "../app/fiche/motion.ts";

// Huit secondes, au dixième : de quoi voir le personnage monter et redescendre.
const INSTANTS = Array.from({ length: 81 }, (_, index) => index / 10);

// La scène sans mouvement réduit ni main posée, à chacun des `INSTANTS`.
const freeMotion = () => INSTANTS.map((seconds) => poseAt(seconds, 0, false));

// La pose la plus haute de `poses`, ou la plus basse.
const highest = (poses: Pose[]) =>
	poses.reduce((top, pose) => (pose.lift > top.lift ? pose : top));
const lowest = (poses: Pose[]) =>
	poses.reduce((bottom, pose) => (pose.lift < bottom.lift ? pose : bottom));

// Le repos : la pose sous mouvement réduit, sans main posée.
const REST = poseAt(0, 0, true);

describe("mouvement du personnage de la fiche", () => {
	test("à l'ouverture, le personnage part au repos, de l'orientation des vignettes", () => {
		expect(poseAt(0, 0, false)).toEqual(REST);
		expect(REST.turn).toBe(0.38);
	});

	test("sans mouvement réduit, la rotation avance avec le temps, et le personnage monte puis redescend sans passer sous son repos", () => {
		const poses = freeMotion();
		const turns = poses.map(({ turn }) => turn);
		const steps = turns
			.slice(1)
			.map((turn, index) => turn - (turns[index] ?? Number.NaN));
		expect(Math.min(...steps)).toBeGreaterThan(0);

		const lifts = poses.map(({ lift }) => lift);
		const peak = lifts.indexOf(Math.max(...lifts));
		expect(lifts[peak]).toBeGreaterThan(REST.lift);
		expect(Math.min(...lifts.slice(peak))).toBeLessThan(lifts[peak] ?? 0);
		expect(Math.min(...lifts)).toBeGreaterThanOrEqual(REST.lift);
	});

	test("au plus haut, l'ombre est plus petite et plus pâle qu'au repos, où elle reste celle des vignettes", () => {
		const poses = freeMotion();
		expect(REST).toMatchObject({ shadowScale: 1, shadowOpacity: 1 });
		const bottom = lowest(poses);
		expect(bottom.shadowScale).toBeCloseTo(1);
		expect(bottom.shadowOpacity).toBeCloseTo(1);
		const top = highest(poses);
		expect(top.lift).toBeGreaterThan(bottom.lift);
		expect(top.shadowScale).toBeLessThan(1);
		expect(top.shadowOpacity).toBeLessThan(1);
	});

	// L'orientation des vignettes, 0,38 rad (`scene.ts`), plus l'angle au doigt.
	test.each([0, 0.9, 1.75, 2.6, 12, 600])(
		"sous mouvement réduit, à %s s, le personnage reste au repos, tourné de l'angle au doigt seul",
		(seconds) => {
			expect(poseAt(seconds, 0.5, true)).toEqual({
				turn: 0.38 + 0.5,
				lift: 0,
				shadowScale: 1,
				shadowOpacity: 1,
			});
		},
	);

	test.each([
		["sans mouvement réduit", false],
		["sous mouvement réduit", true],
	])(
		"%s, l'angle au doigt s'ajoute à la rotation, sans toucher au flottement ni à l'ombre",
		(_, reducedMotion) => {
			for (const seconds of [0, 1.3, 7]) {
				const free = poseAt(seconds, 0, reducedMotion);
				const turned = poseAt(seconds, 1.2, reducedMotion);
				expect(turned.turn - free.turn).toBeCloseTo(1.2, 12);
				expect({ ...turned, turn: 0 }).toEqual({ ...free, turn: 0 });
			}
		},
	);
});
