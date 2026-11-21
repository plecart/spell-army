import { simulationArmies } from "personnages";
import { type Fighter, STARTING_POOL, type Spell } from "../src/index.ts";

/** Les graines 1 à 2 000 de l'équilibre (critère de l'issue #19), en texte. */
export const SEEDS: readonly string[] = Array.from(
	{ length: 2000 },
	(_, index) => String(index + 1),
);

/** Le délai d'un test qui simule des milliers de combats sur des armées de 1 000. */
export const SIMULATION_TIMEOUT = 120_000;

// Une fabrique pour tout le fichier de test : classe et stats d'une graine se calculent une fois.
const armies = simulationArmies<Spell>();

/** L'armée de simulation de la graine `seed` (`simulationArmies`), ses sorts tirés dans `pool`. */
export function armyOf(
	seed: string,
	pool: readonly Spell[] = STARTING_POOL,
): Fighter[] {
	return armies(seed, pool);
}
