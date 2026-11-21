import type { Shares, Stat, Stats } from "./spell.ts";

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
 * Un monstre (game design § 3) : ses stats, déjà dimensionnées sur l'armée ; ses attaques, de 2 à 4
 * — leur nombre se valide à la création du monstre, le combat n'en exige qu'une ; son profil, le
 * multiplicateur de chaque stat qui a réparti son budget, porté au journal sans effet au combat ;
 * sa particularité, un texte sans effet au MVP (§ 10, point 4).
 */
export interface Monster {
	stats: Stats;
	attacks: readonly MonsterAttack[];
	profile: Record<Stat, number>;
	trait: string;
}
