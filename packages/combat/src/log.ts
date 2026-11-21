import type { ArmySummary, Fighter } from "./army.ts";
import type { Monster } from "./monster.ts";
import type { Shares, Spell } from "./spell.ts";

/**
 * La version des règles du combat, portée à l'en-tête de chaque journal. Elle change avec tout ce
 * qui change un combat à entrées égales : formules, initiative, tirages, dés.
 */
export const RULES_VERSION = 1;

/**
 * Un personnage forcé (game design § 5) : son identifiant, sa position — premier, dernier ou au
 * milieu — et son motif, extérieur au jeu.
 */
export interface Forced {
	id: string;
	position: "first" | "last" | "middle";
	reason: string;
}

/** La Vie d'un camp avant → après une action. */
export type LifeChange = [before: number, after: number];

/** Ce que toute action porte : son numéro à partir de 1, sa recette, ses dégâts et les deux Vie. */
interface ActionBase {
	number: number;
	recipe: Shares;
	damage: number;
	armyLife: LifeChange;
	monsterLife: LifeChange;
}

/**
 * Une action de l'armée : le personnage tiré, son sort, la recette résolue (la meilleure stat en
 * 100 % de cette stat), la stat de l'armée selon elle, l'efficacité du lanceur, les dégâts et le
 * soin du sort avant tout plafond, et s'il jouait à une place forcée.
 */
export interface ArmyAction extends ActionBase {
	side: "army";
	fighter: Pick<Fighter, "id" | "characterClass">;
	spell: Pick<Spell, "number" | "name">;
	armyStat: number;
	efficiency: number;
	heal: number;
	forced: boolean;
}

/** Une action du monstre : le nom de l'attaque tirée, la stat du monstre selon sa recette. */
export interface MonsterAction extends ActionBase {
	side: "monster";
	attack: string;
	monsterStat: number;
}

export type Action = ArmyAction | MonsterAction;

/**
 * L'issue d'un combat : `exhaustion`, la défaite « par épuisement » du garde-fou (game design § 4),
 * qui n'est pas une règle du jeu.
 */
export type Outcome = "victory" | "defeat" | "exhaustion";

/**
 * Le journal d'un combat (game design § 9, sans le bloc « Moments ») :
 * - en-tête : versions des règles et de la réserve, graine, monstre, armée (effectif, sommes des
 *   stats, part de chaque classe) et forcés ;
 * - actions, dans l'ordre ;
 * - bilan : issue, nombre d'actions, Vie restante des deux camps, identifiants des tirés dans
 *   l'ordre de leur première action, et forcés que le combat n'a pas atteints.
 */
export interface CombatLog {
	header: {
		rulesVersion: number;
		poolVersion: string;
		seed: string;
		monster: Monster;
		army: ArmySummary;
		forced: readonly Forced[];
	};
	actions: Action[];
	summary: {
		outcome: Outcome;
		actionCount: number;
		armyLife: number;
		monsterLife: number;
		drawn: string[];
		unreachedForced: string[];
	};
}

/**
 * Le journal en JSON, stable : à toute profondeur, les clés de chaque objet s'écrivent triées par
 * unités de code (`<`), jamais dans l'ordre de leur insertion — seule une clé entière, comme
 * `"2"`, passerait avant les autres, par ordre croissant, comme le veut `JSON.stringify`. Graine et
 * entrées égales donnent la même chaîne, octet pour octet (ADR 0001, « Conséquences » : le combat
 * est rejouable).
 */
export function serializeLog(log: CombatLog): string {
	return JSON.stringify(log, sortedKeys);
}

/** Le remplaçant de `JSON.stringify` : un objet (hors tableau) renaît, ses clés triées. */
function sortedKeys(_key: string, value: unknown): unknown {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return value;
	}
	return Object.fromEntries(
		Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)),
	);
}
