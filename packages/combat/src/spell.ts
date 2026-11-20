/**
 * Le modèle d'un sort : un vocabulaire fermé, déduit des 24 lignes de l'annexe B du game design
 * (§ 2, « Recette », « Formes », « Effets »). Il décrit un sort sans rien calculer : la formule de
 * chaque forme et l'efficacité du lanceur appartiennent au moteur de combat.
 */

/** Les quatre stats (game design § 1) : Vie, Force, Magie, Vitesse. */
export type Stat = "life" | "strength" | "magic" | "speed";

/**
 * Les huit classes du game design § 1. Doublon assumé du `ClassKey` de `personnages`, mêmes
 * identifiants : `combat` ne dépend d'aucun paquet (ADR 0001, « Paquets »).
 */
export type CharacterClass =
	| "wizard"
	| "golem"
	| "warrior"
	| "dwarf"
	| "vampire"
	| "druid"
	| "peasant"
	| "fairy";

/**
 * La part de chaque stat qu'utilise le sort, pour la puissance de l'armée comme pour l'efficacité
 * du lanceur : des parts entières en %, de somme 100 ; ou la meilleure stat du lanceur, celle où
 * il est le plus fort (n° 18 et 19).
 */
export type Recipe = { kind: "shares"; shares: Shares } | { kind: "bestStat" };

/** Les parts d'une recette, en % ; une stat absente n'y entre pas. */
export type Shares = Partial<Record<Stat, number>>;

/**
 * La jauge d'une forme conditionnelle, de 0 à 1 :
 * - `monsterLifeLost` : la Vie perdue par le monstre, 0 intact, 1 à bout ;
 * - `armyWounds` : les blessures de l'armée, 0 intacte, 1 presque morte ;
 * - `classShare` : la part d'une classe nommée dans l'armée ;
 * - `casterClassShare` : la part de la classe du lanceur dans l'armée.
 */
export type Gauge =
	| "monsterLifeLost"
	| "armyWounds"
	| "classShare"
	| "casterClassShare";

/**
 * Les quatre formes du game design § 2 :
 * - `safe` : sûr ;
 * - `costly` : coûteux, l'armée perd `armyLossShare` des dégâts infligés (n° 3 : 0,10) ;
 * - `conditional` : selon sa jauge ; la classe nommée est présente si et seulement si la jauge
 *   est `classShare` ;
 * - `inverted` : inversé, l'efficacité monte quand la stat du lanceur est basse.
 */
export type Form =
	| { kind: "safe" }
	| { kind: "costly"; armyLossShare: number }
	| { kind: "conditional"; gauge: Gauge; characterClass?: CharacterClass }
	| { kind: "inverted" };

/** La valeur `constant + perGauge × jauge` ; `perGauge` vaut 0 hors forme conditionnelle. */
export interface Linear {
	constant: number;
	perGauge: number;
}

/**
 * Ce que multiplient les coefficients d'un effet :
 * - `armyStat` : la stat de l'armée selon la recette, en multiplicateur comme l'annexe B l'écrit
 *   (×1,0 = un coup normal ; la conversion en coefficient 0,2 appartient au moteur de combat) ;
 * - `armyMaxLife` : la Vie maximale de l'armée (n° 14 : soin 0,20) ;
 * - `monsterLastHit` : le dernier coup reçu du monstre (n° 20 : dégâts 1,40).
 */
export type EffectBase = "armyStat" | "armyMaxLife" | "monsterLastHit";

/** Des dégâts, du soin ou les deux, sur une même base. */
export interface Effect {
	base: EffectBase;
	damage?: Linear;
	heal?: Linear;
}

/**
 * Un sort de la réserve. `number` est son identifiant stable, celui du pied de la carte (« 3/24 ») ;
 * `weight`, son poids de tirage (0 : jamais tiré, seulement donné à la main) ; `description`, la
 * phrase de la carte, variables comprises (direction artistique § 4, « Description »).
 */
export interface Spell {
	number: number;
	name: string;
	recipe: Recipe;
	form: Form;
	effect: Effect;
	weight: number;
	description: string;
}
