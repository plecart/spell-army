import type { Fighter } from "./army.ts";
import { armyWins, shareOf } from "./simulation.ts";
import type { Spell } from "./spell.ts";

/** Les entrées d'une mesure : la réserve, le sort candidat, les graines et l'armée de chacune. */
export interface SpellMeasureInput {
	pool: readonly Spell[];
	candidate: Spell;
	seeds: readonly string[];
	/**
	 * L'armée de la graine, ses sorts tirés dans la réserve donnée : appelée pour chaque graine deux
	 * fois de suite, avec puis sans le candidat.
	 */
	armyOf: (seed: string, pool: readonly Spell[]) => readonly Fighter[];
}

/**
 * Ce que pèse un sort candidat : la part de victoires de l'armée avec lui et sans lui, de 0 à 1,
 * leur écart en points (avec − sans, × 100), et les graines de l'échantillon.
 */
export interface SpellMeasure {
	withSpell: number;
	withoutSpell: number;
	gap: number;
	seeds: readonly string[];
}

/** Une part de victoires de 0 à 1 vaut 100 points. */
const POINTS = 100;

/**
 * La mesure d'un sort candidat contre une réserve (game design § 10, point 3 : « un nouveau sort se
 * mesure contre la réserve avant d'y entrer »). Sans lui : la réserve privée d'un sort de même
 * numéro s'il y est ; avec lui : cette réserve et le candidat. Sur chaque graine, l'armée tirée
 * dans chacune des deux réserves affronte le monstre de référence égal à elle, au profil neutre
 * (`armyWins`, game design § 6, « Équilibre »). Graine après graine, les deux combats à la suite :
 * une seule armée vit à la fois.
 *
 * @throws {RangeError} si l'échantillon ne compte aucune graine.
 */
export function measureSpell({
	pool,
	candidate,
	seeds,
	armyOf,
}: SpellMeasureInput): SpellMeasure {
	const without = pool.filter(({ number }) => number !== candidate.number);
	const withCandidate = [...without, candidate];
	const outcomes = seeds.map((seed) => ({
		withSpell: armyWins({ seed, army: armyOf(seed, withCandidate) }),
		withoutSpell: armyWins({ seed, army: armyOf(seed, without) }),
	}));
	const withSpell = shareOf(outcomes.map((outcome) => outcome.withSpell));
	const withoutSpell = shareOf(outcomes.map((outcome) => outcome.withoutSpell));
	return {
		withSpell,
		withoutSpell,
		gap: (withSpell - withoutSpell) * POINTS,
		seeds,
	};
}
