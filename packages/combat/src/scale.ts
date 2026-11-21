import type { Fighter } from "./army.ts";
import type { Profile } from "./monster.ts";
import { victoryShare } from "./simulation.ts";

/** L'échantillon d'une simulation : ses graines, et l'armée de chacune, que construit l'appelant. */
export interface Sample {
	seeds: readonly string[];
	armyOf: (seed: string) => readonly Fighter[];
}

/** La part de victoires qu'un monstre de profil « de sa force » laisse à l'armée (§ 3, « Profil »). */
const EVEN = 0.5;
/** Les facteurs d'échelle essayés, bornes comprises : de ÷8 à ×8. */
const SCALE_RANGE = { low: 1 / 8, high: 8 };
/** La largeur où la bissection s'arrête : le vingtième des ± 0,02 tolérés sur le golem de lave. */
const SCALE_PRECISION = 1e-3;

/**
 * Le facteur d'échelle d'un profil (game design § 3, « Profil ») : celui pour lequel le monstre
 * égal à l'armée, à ce profil, lui laisse 50 % de victoires sur l'échantillon. Trouvé par
 * bissection de ÷8 à ×8, jusqu'à une largeur de 0,001, les mêmes graines et les mêmes armées à
 * chaque essai : `armyOf` est appelé une fois par graine.
 *
 * @example le golem de lave (Vie ×1,5, Vitesse ×0,5) : ×1,165 (§ 3).
 * @throws {RangeError} si l'échantillon est vide, ou si aucun facteur de ÷8 à ×8 ne laisse 50 %.
 */
export function scaleFactor(
	profile: Profile,
	{ seeds, armyOf }: Sample,
): number {
	const trials = seeds.map((seed) => ({ seed, army: armyOf(seed) }));
	const evenOrBetter = (scale: number) =>
		victoryShare(trials, profile, scale) >= EVEN;
	let { low, high } = SCALE_RANGE;
	if (!evenOrBetter(low) || evenOrBetter(high)) {
		throw new RangeError(
			`aucun facteur d'échelle de ${low} à ${high} ne laisse 50 % de victoires à l'armée`,
		);
	}
	while (high - low > SCALE_PRECISION) {
		const middle = (low + high) / 2;
		if (evenOrBetter(middle)) low = middle;
		else high = middle;
	}
	return (low + high) / 2;
}
