export type { Fighter } from "./army.ts";
export { type FightInput, fight } from "./fight.ts";
export {
	type Action,
	type ArmyAction,
	type CombatLog,
	type Forced,
	type MonsterAction,
	RULES_VERSION,
	serializeLog,
	type UnreachedForced,
} from "./log.ts";
export {
	type Monster,
	type MonsterAttack,
	NEUTRAL_PROFILE,
	type Profile,
	REFERENCE_ATTACKS,
	sizeMonster,
} from "./monster.ts";
export {
	DEFAULT_WEIGHT,
	type EffectCategory,
	effectCategory,
	spellKey,
	validateSpell,
} from "./rules.ts";
export {
	type Sample,
	scaleFactor,
	type Trial,
	victoryShare,
} from "./scale.ts";
export { STARTING_POOL } from "./starting-pool.ts";
export type {
	CharacterClass,
	Effect,
	EffectBase,
	Form,
	Gauge,
	Linear,
	Recipe,
	Shares,
	Spell,
	Stat,
	Stats,
} from "./spell.ts";
