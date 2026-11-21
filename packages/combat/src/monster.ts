import type { Shares } from "./spell.ts";

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
