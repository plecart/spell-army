import { type CharacterClass, STATS, type Spell, type Stats } from "./spell.ts";

/**
 * Un personnage de l'armée, déjà calculé par l'appelant (classe et stats par `personnages`, sort
 * enregistré à l'inscription) : le combat ne lit ni base ni autre paquet (ADR 0001, « Paquets »).
 */
export interface Fighter {
	id: string;
	characterClass: CharacterClass;
	stats: Stats;
	spell: Spell;
}

/**
 * Ce que l'armée pèse au combat (game design § 2 : la stat de l'armée est la somme de celles de ses
 * personnages) : son effectif, la somme de chaque stat — la somme des Vie est sa Vie maximale —, et
 * la part de chaque classe présente dans l'effectif, de 0 à 1 ; une classe absente n'y figure pas.
 */
export interface ArmySummary {
	size: number;
	stats: Stats;
	classShares: Partial<Record<CharacterClass, number>>;
}

/**
 * Le bilan d'une armée : effectif, somme de chaque stat, part de chaque classe présente.
 *
 * @example deux golems et un magicien : `classShares` vaut `{ golem: 2 / 3, wizard: 1 / 3 }`.
 */
export function summarize(army: readonly Fighter[]): ArmySummary {
	const counts = new Map<CharacterClass, number>();
	for (const { characterClass } of army) {
		counts.set(characterClass, (counts.get(characterClass) ?? 0) + 1);
	}
	return {
		size: army.length,
		stats: Object.fromEntries(
			STATS.map((stat) => [
				stat,
				army.reduce((sum, fighter) => sum + fighter.stats[stat], 0),
			]),
		) as Stats,
		classShares: Object.fromEntries(
			[...counts].map(([characterClass, count]) => [
				characterClass,
				count / army.length,
			]),
		),
	};
}
