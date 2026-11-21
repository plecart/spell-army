import { STATS, type Shares, type Stat, type Stats } from "./spell.ts";

/**
 * Une attaque nommée du monstre (game design § 3, « Attaques ») : sa recette, des parts entières en
 * % de la Force et de la Magie du monstre, de somme 100 ; son coefficient, dans l'unité de
 * l'annexe B (×1,0 = un coup normal).
 */
export interface MonsterAttack {
	name: string;
	recipe: Pick<Shares, "strength" | "magic">;
	coefficient: number;
}

/**
 * Le profil d'un monstre (game design § 3, « Profil ») : le multiplicateur de chaque stat qui
 * répartit son budget — un golem de lave : Vie ×1,5, Vitesse ×0,5.
 */
export type Profile = Record<Stat, number>;

/**
 * Un monstre (game design § 3) : ses stats, déjà dimensionnées sur l'armée ; ses attaques, de 2 à 4
 * — leur nombre se valide à la création du monstre, le combat n'en exige qu'une ; son profil,
 * porté au journal sans effet au combat ; sa particularité, un texte sans effet au MVP (§ 10,
 * point 4).
 */
export interface Monster {
	stats: Stats;
	attacks: readonly MonsterAttack[];
	profile: Profile;
	trait: string;
}

/** Le profil neutre : chaque stat garde son budget. */
export const NEUTRAL_PROFILE: Readonly<Profile> = {
	life: 1,
	strength: 1,
	magic: 1,
	speed: 1,
};

/**
 * Les attaques du monstre de référence, celui des simulations d'équilibre (game design § 6,
 * « Équilibre ») : une de Force, une de Magie, chacune au coefficient moyen ×0,78 du § 3 — le § 6
 * ne fixe que ce coefficient moyen, la composition est celle-ci.
 */
export const REFERENCE_ATTACKS: readonly MonsterAttack[] = [
	{ name: "Griffes", recipe: { strength: 100 }, coefficient: 0.78 },
	{ name: "Sortilège", recipe: { magic: 100 }, coefficient: 0.78 },
];

/**
 * Les stats d'un monstre (game design § 3, « Profil » ; § 6, « Calcul du prochain monstre ») :
 * pour chaque stat, budget × multiplicateur du profil × facteur d'échelle du profil.
 *
 * @example un budget de Vie 1 000, le golem de lave (Vie ×1,5) au facteur 1,165 : Vie 1 747,5.
 */
export function sizeMonster(
	budget: Stats,
	profile: Profile,
	scale: number,
): Stats {
	return Object.fromEntries(
		STATS.map((stat) => [stat, budget[stat] * profile[stat] * scale]),
	) as Stats;
}
