import type { ArmySummary, Fighter } from "./army.ts";
import type { Monster } from "./monster.ts";
import { sha256Hex } from "./sha256.ts";
import type { Shares, Spell } from "./spell.ts";

/**
 * La version des règles du combat, portée à l'en-tête de chaque journal. Elle change avec tout ce
 * qui change un combat à entrées égales : formules, initiative, tirages, dés.
 */
export const RULES_VERSION = 1;

/**
 * Un personnage forcé (game design § 5) : son identifiant, sa position — premier, dernier ou au
 * milieu — et son motif, extérieur au jeu. Sa place dans le combat : `lineup.ts`.
 */
export interface Forced {
	id: string;
	position: "first" | "last" | "middle";
	reason: string;
}

/** Un forcé dont le combat n'a pas atteint la place : son identifiant et sa position. */
export type UnreachedForced = Pick<Forced, "id" | "position">;

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
 *   l'ordre de leur première action, forcés compris, et forcés que le combat n'a pas atteints,
 *   dans l'ordre donné.
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
		unreachedForced: UnreachedForced[];
	};
}

/**
 * Ce que la saison ajoute à l'en-tête du journal stocké (game design § 9, « En-tête ») : saison,
 * chapitre, jour — le numéro du combat dans la saison (issue #21, Décisions, 3) —, tentative, p et
 * recrues de référence. Le combat ne les lit pas : `fight` ne les porte pas, et `RULES_VERSION` ne
 * dépend pas d'eux.
 */
export interface SeasonHeader {
	season: number;
	chapter: number;
	day: number;
	attempt: number;
	recruitShare: number;
	referenceRecruits: number;
}

/** Le journal stocké d'un combat de la saison : celui de `fight`, son en-tête complété. */
export interface SeasonLog extends CombatLog {
	header: CombatLog["header"] & SeasonHeader;
}

/**
 * Le journal stocké : le journal du combat, dont l'en-tête reçoit les six champs de la saison, pris
 * un à un dans `context` — un objet plus large, l'état de la saison par exemple, n'y fait entrer
 * rien d'autre. Actions et bilan restent ceux du combat.
 *
 * @example `seasonLogOf(fight(input), { season: 1, chapter: 12, day: 14, attempt: 2,
 * recruitShare: 0.6, referenceRecruits: 20 }).header.chapter` vaut 12.
 */
export function seasonLogOf(
	log: CombatLog,
	{
		season,
		chapter,
		day,
		attempt,
		recruitShare,
		referenceRecruits,
	}: SeasonHeader,
): SeasonLog {
	return {
		...log,
		header: {
			...log.header,
			season,
			chapter,
			day,
			attempt,
			recruitShare,
			referenceRecruits,
		},
	};
}

/**
 * Le journal en JSON, stable : à toute profondeur, les clés de chaque objet s'écrivent triées par
 * unités de code (`<`), jamais dans l'ordre de leur insertion — seule une clé entière, comme
 * `"2"`, passerait avant les autres, par ordre croissant, comme le veut `JSON.stringify`. Graine et
 * entrées égales donnent la même chaîne, octet pour octet (ADR 0001, « Conséquences » : le combat
 * est rejouable). Le journal stocké (`SeasonLog`) s'écrit de même, ses champs de saison compris.
 */
export function serializeLog(log: CombatLog): string {
	return JSON.stringify(log, sortedKeys);
}

/**
 * La version de la réserve `pool`, portée à l'en-tête du journal (game design § 9) : le SHA-256, en
 * hexadécimal, de la réserve en JSON aux clés triées comme `serializeLog` les écrit. Chaque sort
 * compte tel que le combat le lit, poids compris, dans l'ordre de la réserve : les mêmes sorts dans
 * le même ordre donnent la même version, quel que soit l'ordre de leurs clés ; un sort changé,
 * ajouté ou retiré en donne une autre.
 *
 * @example `poolVersionOf([])` est le SHA-256 de « [] ».
 */
export function poolVersionOf(pool: readonly Spell[]): string {
	return sha256Hex(JSON.stringify(pool, sortedKeys));
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
