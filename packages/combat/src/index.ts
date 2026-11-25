export type { Fighter } from "./army.ts";
export {
	type BudgetComponents,
	budgetOf,
	referenceRecruitsOf,
} from "./calibration.ts";
export { type FightInput, fight } from "./fight.ts";
export {
	type Action,
	type ArmyAction,
	type CombatLog,
	type Forced,
	type MonsterAction,
	type Outcome,
	RULES_VERSION,
	type SeasonHeader,
	type SeasonLog,
	seasonLogOf,
	serializeLog,
	type UnreachedForced,
} from "./log.ts";
export {
	measureSpell,
	type SpellMeasure,
	type SpellMeasureInput,
} from "./measure.ts";
export {
	ATTACK_COUNT,
	MEAN_COEFFICIENT,
	type Monster,
	type MonsterAttack,
	type MonsterDesign,
	NEUTRAL_PROFILE,
	type Profile,
	REFERENCE_ATTACKS,
	REFERENCE_DESIGN,
	sizeMonster,
} from "./monster.ts";
export {
	DEFAULT_WEIGHT,
	type EffectCategory,
	effectCategory,
	spellKey,
	validateMonster,
	validateSpell,
} from "./rules.ts";
export { type Sample, scaleFactor } from "./scale.ts";
export {
	afterCombat,
	budgetForLaunch,
	type CombatResult,
	dayOf,
	SEASON_CHAPTERS,
	SEASON_START,
	type SeasonSettings,
	type SeasonState,
	type SeasonTransition,
	seedOf,
} from "./season.ts";
export { type Trial, victoryShare } from "./simulation.ts";
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
