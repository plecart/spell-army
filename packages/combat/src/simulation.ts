import { type Fighter, summarize } from "./army.ts";
import { fight } from "./fight.ts";
import {
	type Monster,
	type MonsterDesign,
	REFERENCE_DESIGN,
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
 * La part des combats de `trials` que l'armée gagne, de 0 à 1, chacun sur sa graine contre le
 * monstre égal à elle, de profil et d'attaques `design`, au facteur `scale` (`armyWins`). Par
 * défaut, le monstre de référence au facteur 1.
 *
 * @throws {RangeError} si l'échantillon ne compte aucun combat.
 */
export function victoryShare(
	trials: readonly Trial[],
	design: MonsterDesign = REFERENCE_DESIGN,
	scale = 1,
): number {
	return shareOf(trials.map((trial) => armyWins(trial, design, scale)));
}

/**
 * Vrai si l'armée gagne le combat de sa graine contre le monstre égal à elle : budget = ses stats
 * réelles (game design § 6), dimensionné par `sizeMonster` au profil de `design` et au facteur
 * `scale` ; le monstre joue les attaques de `design`. Par défaut, `REFERENCE_DESIGN` au facteur 1 :
 * le monstre « de sa force » du § 6, « Équilibre ».
 */
export function armyWins(
	{ seed, army }: Trial,
	design: MonsterDesign = REFERENCE_DESIGN,
	scale = 1,
): boolean {
	const log = fight({
		army,
		monster: monsterEqualTo(army, design, scale),
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

/**
 * Le monstre égal à `army`, de profil et d'attaques `design`, au facteur `scale`, sans
 * particularité.
 */
function monsterEqualTo(
	army: readonly Fighter[],
	{ profile, attacks }: MonsterDesign,
	scale: number,
): Monster {
	return {
		stats: sizeMonster(summarize(army).stats, profile, scale),
		attacks,
		profile,
		trait: "aucune",
	};
}
