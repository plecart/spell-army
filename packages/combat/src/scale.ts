import { type Fighter, summarize } from "./army.ts";
import { fight } from "./fight.ts";
import {
	type Monster,
	NEUTRAL_PROFILE,
	type Profile,
	REFERENCE_ATTACKS,
	sizeMonster,
} from "./monster.ts";

/** Un combat simulé : sa graine et l'armée qu'elle a tirée. */
export interface Trial {
	seed: string;
	army: readonly Fighter[];
}

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
/** Le journal d'une simulation n'est pas gardé : sa version de réserve ne dit rien. */
const SIMULATION_POOL_VERSION = "simulation";

/**
 * La part des combats que l'armée gagne contre le monstre de référence égal à elle : budget = ses
 * stats réelles (game design § 6), dimensionné par `sizeMonster` au profil et au facteur donnés,
 * avec `REFERENCE_ATTACKS` ; chaque combat sur sa graine. Profil neutre et facteur 1 : le monstre
 * « de sa force » du § 6, « Équilibre ».
 *
 * @throws {RangeError} si l'échantillon ne compte aucun combat.
 */
export function victoryShare(
	trials: readonly Trial[],
	profile: Profile = NEUTRAL_PROFILE,
	scale = 1,
): number {
	if (trials.length === 0) {
		throw new RangeError("l'échantillon doit compter au moins une graine");
	}
	let victories = 0;
	for (const { seed, army } of trials) {
		const monster = referenceMonster(army, profile, scale);
		const log = fight({
			army,
			monster,
			seed,
			poolVersion: SIMULATION_POOL_VERSION,
		});
		if (log.summary.outcome === "victory") victories += 1;
	}
	return victories / trials.length;
}

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

/** Le monstre de référence égal à `army`, au profil et au facteur donnés, sans particularité. */
function referenceMonster(
	army: readonly Fighter[],
	profile: Profile,
	scale: number,
): Monster {
	return {
		stats: sizeMonster(summarize(army).stats, profile, scale),
		attacks: REFERENCE_ATTACKS,
		profile,
		trait: "aucune",
	};
}
