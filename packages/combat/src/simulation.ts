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

/** Le journal d'une simulation n'est pas gardé : sa version de réserve ne dit rien. */
const SIMULATION_POOL_VERSION = "simulation";

/**
 * La part des combats que l'armée gagne contre le monstre de référence égal à elle (`armyWins`),
 * chaque combat sur sa graine.
 *
 * @throws {RangeError} si l'échantillon ne compte aucun combat.
 */
export function victoryShare(
	trials: readonly Trial[],
	profile: Profile = NEUTRAL_PROFILE,
	scale = 1,
): number {
	return shareOf(trials.map((trial) => armyWins(trial, profile, scale)));
}

/**
 * Vrai si l'armée gagne le combat de sa graine contre le monstre de référence égal à elle : budget =
 * ses stats réelles (game design § 6), dimensionné par `sizeMonster` au profil et au facteur donnés,
 * avec `REFERENCE_ATTACKS`. Profil neutre et facteur 1 : le monstre « de sa force » du § 6,
 * « Équilibre ».
 */
export function armyWins(
	{ seed, army }: Trial,
	profile: Profile = NEUTRAL_PROFILE,
	scale = 1,
): boolean {
	const log = fight({
		army,
		monster: referenceMonster(army, profile, scale),
		seed,
		poolVersion: SIMULATION_POOL_VERSION,
	});
	return log.summary.outcome === "victory";
}

/**
 * La part des victoires parmi `outcomes`, de 0 à 1.
 *
 * @throws {RangeError} si l'échantillon ne compte aucun combat.
 */
export function shareOf(outcomes: readonly boolean[]): number {
	if (outcomes.length === 0) {
		throw new RangeError("l'échantillon doit compter au moins une graine");
	}
	return outcomes.filter(Boolean).length / outcomes.length;
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
