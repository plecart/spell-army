import { characterOf } from "personnages";
import {
	type ArmyAction,
	type CombatLog,
	type Fighter,
	type Monster,
	type MonsterAction,
	type MonsterAttack,
	NEUTRAL_PROFILE,
	type Profile,
	STARTING_POOL,
	type Spell,
	type Stats,
} from "../src/index.ts";

/** Le profil du golem de lave (game design § 3, « Profil ») : Vie ×1,5, Vitesse ×0,5. */
export const LAVA_GOLEM: Profile = {
	life: 1.5,
	strength: 1,
	magic: 1,
	speed: 0.5,
};

/** Le sort n° `number` de la réserve de départ. */
export function spellNumbered(number: number): Spell {
	const spell = STARTING_POOL.find((candidate) => candidate.number === number);
	if (spell === undefined) throw new Error(`aucun sort n° ${number}`);
	return spell;
}

/**
 * Le personnage de l'identifiant `id`, classe et stats calculées par `personnages`, qui lance le
 * sort n° `spellNumber` de la réserve de départ.
 */
export function fighterOf(id: string, spellNumber: number): Fighter {
	const { class: characterClass, stats } = characterOf(id);
	return { id, characterClass, stats, spell: spellNumbered(spellNumber) };
}

/** Une attaque qui ne fait aucun dégât : le combat dure tant que l'armée ne frappe pas. */
export function harmless(name: string): MonsterAttack {
	return { name, recipe: { strength: 100 }, coefficient: 0 };
}

/**
 * Un monstre de profil neutre, sans particularité, à la Vie et aux attaques données ; une stat
 * omise vaut 1.
 */
export function monsterOf(
	stats: Pick<Stats, "life"> & Partial<Stats>,
	attacks: readonly MonsterAttack[] = [harmless("Grognement")],
): Monster {
	return {
		stats: { strength: 1, magic: 1, speed: 1, ...stats },
		attacks,
		profile: NEUTRAL_PROFILE,
		trait: "aucune",
	};
}

/** Les actions de l'armée d'un journal, dans l'ordre. */
export function armyActions(log: CombatLog): ArmyAction[] {
	return log.actions.filter(
		(action): action is ArmyAction => action.side === "army",
	);
}

/** Les actions du monstre d'un journal, dans l'ordre. */
export function monsterActions(log: CombatLog): MonsterAction[] {
	return log.actions.filter(
		(action): action is MonsterAction => action.side === "monster",
	);
}
