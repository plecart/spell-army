import { characterOf } from "personnages";
import {
	type Fighter,
	type Monster,
	type MonsterAttack,
	STARTING_POOL,
	type Spell,
	type Stats,
} from "../src/index.ts";

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
		profile: { life: 1, strength: 1, magic: 1, speed: 1 },
		trait: "aucune",
	};
}
