import type { ArmySummary, Fighter } from "./army.ts";
import type { MonsterAttack } from "./monster.ts";
import { FULL_RECIPE } from "./rules.ts";
import {
	type CharacterClass,
	type EffectBase,
	type Form,
	type Linear,
	type Recipe,
	STATS,
	type Shares,
	type Stat,
	type Stats,
} from "./spell.ts";

/** ×1,0 de l'annexe B, un coup normal : le coefficient 0,2 de la formule du game design § 2. */
const NORMAL_HIT = 0.2;
/** La stat la plus haute d'un personnage (game design § 1). */
const STAT_MAX = 15;
/** L'efficacité d'un lanceur à 0 selon la recette ; l'autre moitié suit sa stat (§ 2). */
const EFFICIENCY_FLOOR = 0.5;

/**
 * L'état du combat au moment où un sort part : l'armée et sa Vie, le monstre, sa Vie de départ et
 * sa Vie actuelle, et la valeur de sa dernière attaque — 0 tant qu'il n'a pas attaqué.
 */
export interface Situation {
	army: ArmySummary;
	armyLife: number;
	monsterLife: number;
	monsterStartLife: number;
	monsterLastHit: number;
}

/**
 * Un sort lancé : sa recette, la meilleure stat résolue en 100 % de cette stat ; la stat de
 * l'armée selon cette recette ; l'efficacité du lanceur, de 0,5 à 1 ; ses dégâts et son soin,
 * 0 pour une part que le sort n'a pas. Ni plafond ni plancher : le combat applique la Vie maximale
 * de l'armée, le plancher de 0 et la perte d'un sort coûteux.
 */
export interface Cast {
	recipe: Shares;
	armyStat: number;
	efficiency: number;
	damage: number;
	heal: number;
}

/**
 * La puissance d'un sort lancé par `caster` dans `situation` (game design § 2, « Puissance d'un
 * sort lancé par l'armée » ; annexe B) :
 *
 * - la stat de l'armée selon la recette est la somme de ses stats pondérée par les parts ; la
 *   meilleure stat est la plus haute du lanceur, l'égalité départagée dans l'ordre Vie, Force,
 *   Magie, Vitesse, et l'armée y donne sa somme de cette stat ;
 * - efficacité = 0,5 + 0,5 × stat du lanceur selon la recette / 15 ; un sort inversé lit
 *   15 − stat ;
 * - chaque part vaut coefficient × base × efficacité, le coefficient lu à la jauge d'une forme
 *   conditionnelle (`constant + perGauge × jauge`). La base : 0,2 × stat de l'armée (×1,0 = un coup
 *   normal) ; la Vie maximale de l'armée ; le dernier coup du monstre.
 *
 * @example Boule de feu (100 % Magie, ×1,0), lancée par un lanceur de Magie 15 dans une armée de
 * Magie 100 : efficacité 1, dégâts 0,2 × 100 × 1 = 20.
 */
export function cast(caster: Fighter, situation: Situation): Cast {
	const { form, effect } = caster.spell;
	const recipe = resolved(caster.spell.recipe, caster.stats);
	const efficiency = efficiencyOf(form, weighted(recipe, caster.stats));
	const armyStat = weighted(recipe, situation.army.stats);
	const base = baseValue(effect.base, armyStat, situation);
	const gauge = gaugeValue(form, caster.characterClass, situation);
	const value = (linear: Linear | undefined) =>
		linear === undefined
			? 0
			: (linear.constant + linear.perGauge * gauge) * base * efficiency;
	return {
		recipe,
		armyStat,
		efficiency,
		damage: value(effect.damage),
		heal: value(effect.heal),
	};
}

/**
 * La puissance d'une attaque du monstre (game design § 3, « Puissance d'une attaque ») :
 * coefficient × 0,2 × stat du monstre selon la recette, sans efficacité — le monstre n'a pas de
 * lanceur.
 */
export function strike(
	{ recipe, coefficient }: MonsterAttack,
	stats: Stats,
): { monsterStat: number; damage: number } {
	const monsterStat = weighted(recipe, stats);
	return { monsterStat, damage: coefficient * NORMAL_HIT * monsterStat };
}

/** efficacité = 0,5 + 0,5 × stat du lanceur / 15 ; un sort inversé lit 15 − stat. */
function efficiencyOf(form: Form, casterStat: number): number {
	const stat = form.kind === "inverted" ? STAT_MAX - casterStat : casterStat;
	return EFFICIENCY_FLOOR + ((1 - EFFICIENCY_FLOOR) * stat) / STAT_MAX;
}

/** La recette en parts : la meilleure stat du lanceur devient 100 % de cette stat. */
function resolved(recipe: Recipe, casterStats: Stats): Shares {
	return recipe.kind === "bestStat"
		? { [bestStat(casterStats)]: FULL_RECIPE }
		: recipe.shares;
}

/** La stat la plus haute ; à égalité, la première dans l'ordre de `STATS`. */
function bestStat(stats: Stats): Stat {
	return STATS.reduce((best, stat) =>
		stats[stat] > stats[best] ? stat : best,
	);
}

/** La somme des stats pondérée par les parts de la recette. */
function weighted(shares: Shares, stats: Stats): number {
	return STATS.reduce(
		(sum, stat) => sum + (stats[stat] * (shares[stat] ?? 0)) / FULL_RECIPE,
		0,
	);
}

/** Ce que multiplie le coefficient d'un effet (`spell.ts`, `EffectBase`). */
function baseValue(
	base: EffectBase,
	armyStat: number,
	situation: Situation,
): number {
	switch (base) {
		case "armyStat":
			return NORMAL_HIT * armyStat;
		case "armyMaxLife":
			return situation.army.stats.life;
		case "monsterLastHit":
			return situation.monsterLastHit;
	}
}

/**
 * La jauge d'une forme conditionnelle, de 0 à 1 (`spell.ts`, `Gauge`) ; 0 hors forme
 * conditionnelle, où le coefficient ne suit aucune jauge :
 * - `monsterLifeLost` = 1 − Vie du monstre / sa Vie de départ ;
 * - `armyWounds` = 1 − Vie de l'armée / sa Vie maximale ;
 * - `classShare`, `casterClassShare` : la part de la classe nommée, ou de celle du lanceur, dans
 *   l'effectif.
 */
function gaugeValue(
	form: Form,
	casterClass: CharacterClass,
	situation: Situation,
): number {
	if (form.kind !== "conditional") return 0;
	const { army } = situation;
	switch (form.gauge) {
		case "monsterLifeLost":
			return 1 - situation.monsterLife / situation.monsterStartLife;
		case "armyWounds":
			return 1 - situation.armyLife / army.stats.life;
		case "classShare":
			return classShare(army, form.characterClass);
		case "casterClassShare":
			return classShare(army, casterClass);
	}
}

/** La part d'une classe dans l'effectif ; 0 si elle est absente, ou si aucune n'est nommée. */
function classShare(
	army: ArmySummary,
	characterClass: CharacterClass | undefined,
): number {
	return characterClass === undefined
		? 0
		: (army.classShares[characterClass] ?? 0);
}
