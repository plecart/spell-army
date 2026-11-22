import {
	MEAN_COEFFICIENT,
	type MonsterAttack,
	type MonsterDesign,
	type Profile,
} from "./monster.ts";
import {
	type Effect,
	type EffectBase,
	type Form,
	FULL_RECIPE,
	type Linear,
	type Recipe,
	STATS,
	type Shares,
	type Spell,
} from "./spell.ts";

/** La pastille de la carte (direction artistique § 4, « En-tête ») : Dégâts, Soin ou Vol de vie. */
export type EffectCategory = "damage" | "heal" | "lifesteal";

/**
 * Le poids par défaut, celui de la réserve de départ et d'un sort ajouté sans poids (game design
 * § 2, « Rareté » : égal pour tous par défaut).
 */
export const DEFAULT_WEIGHT = 1;

/** La seule base d'un sort mixte (game design § 2, « Vol de vie »). */
const MIXED_BASE: EffectBase = "armyStat";
/** Ce que vaut au plus un sort mixte en dégâts + soin : ×1,0, un coup normal. */
const MIXED_MAX = 1;
// L'arrondi binaire des décimaux : 0,34 + 0,56 + 0,1 y vaut 1,0000000000000002.
const ROUNDING_TOLERANCE = 1e-9;
const NO_EFFECT = "l'effet doit faire des dégâts, du soin ou les deux";
const GAUGE_ENDS = [0, 1] as const;
const EFFECT_PARTS = [
	["damage", "dégâts"],
	["heal", "soin"],
] as const;
const TEXT_FIELDS = [
	["name", "le nom"],
	["description", "la description"],
] as const;
/** La plus petite part d'une recette de sort : une part nulle s'y omet. */
const SPELL_LOWEST_SHARE = 1;
/** La plus petite part d'une recette d'attaque du monstre : une part nulle y est admise. */
const ATTACK_LOWEST_SHARE = 0;
/** Le nombre d'attaques d'un monstre (game design § 3, « Attaques »). */
const ATTACK_COUNT = { min: 2, max: 4 } as const;
/** Le coefficient moyen des attaques se vérifie au centième. */
const HUNDREDTHS = 100;

/**
 * La catégorie d'un effet, toujours déduite, jamais saisie : dégâts seuls → `damage`, soin seul →
 * `heal`, les deux → `lifesteal`, quelles que soient leurs valeurs. Une part présente compte : sur un
 * sort valide, elle n'est jamais nulle aux deux bouts de la jauge (`validateSpell`).
 *
 * @throws {RangeError} si l'effet ne fait ni dégâts ni soin.
 */
export function effectCategory({ damage, heal }: Effect): EffectCategory {
	if (damage && heal) return "lifesteal";
	if (damage) return "damage";
	if (heal) return "heal";
	throw new RangeError(NO_EFFECT);
}

/**
 * La clé d'unicité d'un sort (game design § 2, « Unicité ») : recette, forme avec sa jauge et sa
 * classe nommée, catégorie d'effet et base. Deux sorts de même clé sont en double. Les parts de
 * la recette sont triées, et ni les coefficients ni la part perdue d'un coûteux n'y entrent :
 * Coup de marteau (n° 4) et Rage du désespoir (n° 15) ne se distinguent que par leur jauge.
 *
 * @throws {RangeError} si l'effet ne fait ni dégâts ni soin.
 */
export function spellKey({
	recipe,
	form,
	effect,
}: Pick<Spell, "recipe" | "form" | "effect">): string {
	return [
		recipeKey(recipe),
		formKey(form),
		effectCategory(effect),
		effect.base,
	].join("|");
}

function recipeKey(recipe: Recipe): string {
	if (recipe.kind === "bestStat") return recipe.kind;
	return sharesOf(recipe.shares)
		.map(([stat, share]) => `${stat}:${share}`)
		.sort()
		.join("+");
}

function formKey(form: Form): string {
	if (form.kind !== "conditional") return form.kind;
	return [form.kind, form.gauge, form.characterClass]
		.filter((part) => part !== undefined)
		.join(":");
}

/**
 * Les règles de validité d'un sort, en messages d'erreur en français ; aucun message : le sort est
 * valide. Le type et la présence des champs reviennent à la validation de l'entrée, le numéro et
 * l'unicité à la réserve.
 *
 * - Recette : des parts entières de 1 à 100 dont la somme fait 100.
 * - Forme : la part perdue d'un coûteux strictement entre 0 et 1 ; une classe nommée si et
 *   seulement si la jauge est `classShare`.
 * - Effet : des dégâts, du soin ou les deux, chacun un nombre fini ≥ 0 aux deux bouts de la
 *   jauge, non nul à l'un d'eux au moins — une part nulle s'omet —, et qui ne suit une jauge que
 *   dans une forme conditionnelle.
 * - Sort mixte (game design § 2, « Vol de vie » : « ne dépasse jamais ×1,0 ») : sur la seule base
 *   `armyStat`, où il vaut au plus ×1,0 en dégâts + soin aux deux bouts de sa jauge — l'effet étant
 *   linéaire, ses bouts suffisent. Ailleurs, un coup normal vaut un coefficient qui suit l'armée ou
 *   le monstre, et aucune borne fixe n'y tiendrait ce « jamais » (relevé le 2026-11-21, Notes de
 *   la PR #40).
 * - Poids : un nombre fini ≥ 0 ; 0, jamais tiré, est accepté.
 * - Nom et description : non vides une fois les blancs retirés.
 */
export function validateSpell(candidate: Omit<Spell, "number">): string[] {
	return [
		...recipeErrors(candidate.recipe),
		...formErrors(candidate.form),
		...effectErrors(candidate.effect, candidate.form),
		...weightErrors(candidate.weight),
		...textErrors(candidate),
	];
}

function recipeErrors(recipe: Recipe): string[] {
	if (recipe.kind === "bestStat") return [];
	return sharesErrors(recipe.shares, SPELL_LOWEST_SHARE);
}

/** Les parts d'une recette : chacune un entier de `lowest` à 100, leur somme 100. */
function sharesErrors(shares: Shares, lowest: number): string[] {
	const parts = sharesOf(shares);
	const errors = parts
		.filter(
			([, share]) =>
				!(Number.isInteger(share) && share >= lowest && share <= FULL_RECIPE),
		)
		.map(
			([stat, share]) =>
				`la part « ${stat} » de la recette doit être un entier de ${lowest} à ${FULL_RECIPE}, reçu : ${share}`,
		);
	const total = parts.reduce((sum, [, share]) => sum + share, 0);
	if (total !== FULL_RECIPE) {
		errors.push(
			`les parts de la recette doivent faire ${FULL_RECIPE} %, reçu : ${total} %`,
		);
	}
	return errors;
}

function formErrors(form: Form): string[] {
	if (form.kind === "costly") return armyLossErrors(form.armyLossShare);
	if (form.kind === "conditional") return namedClassErrors(form);
	return [];
}

function armyLossErrors(armyLossShare: number): string[] {
	return armyLossShare > 0 && armyLossShare < 1
		? []
		: [
				`la part des dégâts que perd l'armée doit être strictement entre 0 et 1, reçu : ${armyLossShare}`,
			];
}

function namedClassErrors({
	gauge,
	characterClass,
}: Extract<Form, { kind: "conditional" }>): string[] {
	if (gauge === "classShare" && characterClass === undefined) {
		return ["la jauge « classShare » doit nommer une classe"];
	}
	if (gauge !== "classShare" && characterClass !== undefined) {
		return [
			`seule la jauge « classShare » nomme une classe, reçu : « ${characterClass} » sur la jauge « ${gauge} »`,
		];
	}
	return [];
}

function effectErrors(effect: Effect, form: Form): string[] {
	const parts = EFFECT_PARTS.flatMap(([key, label]) => {
		const linear = effect[key];
		return linear === undefined ? [] : [{ label, linear }];
	});
	if (parts.length === 0) {
		return [NO_EFFECT];
	}
	const conditional = form.kind === "conditional";
	return [
		...parts.flatMap(({ label, linear }) =>
			linearErrors(label, linear, conditional),
		),
		...mixedErrors(effect),
	];
}

function linearErrors(
	label: string,
	linear: Linear,
	conditional: boolean,
): string[] {
	const { constant, perGauge } = linear;
	const errors: string[] = [];
	const ends = GAUGE_ENDS.map((gauge) => valueAt(linear, gauge));
	if (!ends.every(isFiniteNonNegative)) {
		errors.push(
			`le coefficient de ${label} doit être un nombre fini ≥ 0 aux deux bouts de la jauge, reçu : constant ${constant}, perGauge ${perGauge}`,
		);
	}
	if (isZero(linear)) {
		errors.push(
			`le coefficient de ${label} vaut 0 aux deux bouts de la jauge : omettre la part de ${label}`,
		);
	}
	if (!conditional && perGauge !== 0) {
		errors.push(
			`le coefficient de ${label} ne suit une jauge que dans une forme conditionnelle, reçu : perGauge ${perGauge}`,
		);
	}
	return errors;
}

function mixedErrors({ base, damage, heal }: Effect): string[] {
	if (damage === undefined || heal === undefined) return [];
	// Une part nulle, refusée à part, ne rend pas le sort mixte.
	if (isZero(damage) || isZero(heal)) return [];
	if (base !== MIXED_BASE) {
		return [
			`un sort mixte (dégâts et soin) ne prend que la base « ${MIXED_BASE} », reçu : « ${base} »`,
		];
	}
	const totals = GAUGE_ENDS.map(
		(gauge) => valueAt(damage, gauge) + valueAt(heal, gauge),
	);
	if (!totals.some((total) => total > MIXED_MAX + ROUNDING_TOLERANCE))
		return [];
	return [
		`dégâts + soin d'un sort mixte doivent rester au plus ${MIXED_MAX} aux deux bouts de la jauge, reçu : ${totals[0]} à jauge 0, ${totals[1]} à jauge 1`,
	];
}

function weightErrors(weight: number): string[] {
	return isFiniteNonNegative(weight)
		? []
		: [`le poids doit être un nombre fini ≥ 0, reçu : ${weight}`];
}

function textErrors(candidate: Omit<Spell, "number">): string[] {
	return TEXT_FIELDS.filter(([field]) => candidate[field].trim() === "").map(
		([, label]) => `${label} ne doit pas être vide`,
	);
}

/**
 * Les règles de validité d'un monstre (game design § 3), en messages d'erreur en français ; aucun
 * message : le monstre est valide. Toutes les règles enfreintes sont rendues, pas la première. Le
 * type et la présence des champs reviennent à la validation de l'entrée. Le moteur ne valide pas ce
 * qu'il simule : un monstre se valide ici, avant son facteur d'échelle (`scaleFactor`).
 *
 * - Attaques (« Attaques ») : de 2 à 4, de noms deux à deux distincts.
 * - Recette d'une attaque : des parts entières de 0 à 100 dont la somme fait 100.
 * - Coefficient d'une attaque : un nombre fini > 0.
 * - Coefficient moyen (« Puissance d'une attaque ») : la moyenne simple des coefficients vaut ×0,78
 *   au centième.
 * - Profil : chaque multiplicateur un nombre fini ≥ 0. Une Vie ×0 passe : aucun facteur ne
 *   l'équilibre, et c'est `scaleFactor` qui la refuse.
 */
export function validateMonster({ profile, attacks }: MonsterDesign): string[] {
	return [
		...attackCountErrors(attacks),
		...attackNameErrors(attacks),
		...attacks.flatMap(attackErrors),
		...meanCoefficientErrors(attacks),
		...profileErrors(profile),
	];
}

function attackCountErrors({ length }: readonly MonsterAttack[]): string[] {
	const { min, max } = ATTACK_COUNT;
	return length >= min && length <= max
		? []
		: [`un monstre doit avoir de ${min} à ${max} attaques, reçu : ${length}`];
}

function attackNameErrors(attacks: readonly MonsterAttack[]): string[] {
	const names = attacks.map(({ name }) => name);
	const repeated = names.filter((name, index) => names.indexOf(name) !== index);
	return [...new Set(repeated)].map(
		(name) => `le nom d'attaque « ${name} » doit être unique dans le monstre`,
	);
}

function attackErrors({ name, recipe, coefficient }: MonsterAttack): string[] {
	const coefficientErrors =
		Number.isFinite(coefficient) && coefficient > 0
			? []
			: [`le coefficient doit être un nombre fini > 0, reçu : ${coefficient}`];
	return [
		...sharesErrors(recipe, ATTACK_LOWEST_SHARE),
		...coefficientErrors,
	].map((error) => `l'attaque « ${name} » : ${error}`);
}

function meanCoefficientErrors(attacks: readonly MonsterAttack[]): string[] {
	const total = attacks.reduce((sum, { coefficient }) => sum + coefficient, 0);
	const hundredths = Math.round((total / attacks.length) * HUNDREDTHS);
	if (hundredths === Math.round(MEAN_COEFFICIENT * HUNDREDTHS)) return [];
	return [
		`le coefficient moyen des attaques doit valoir ${MEAN_COEFFICIENT} au centième, reçu : ${hundredths / HUNDREDTHS}`,
	];
}

function profileErrors(profile: Profile): string[] {
	return STATS.filter((stat) => !isFiniteNonNegative(profile[stat])).map(
		(stat) =>
			`le multiplicateur « ${stat} » du profil doit être un nombre fini ≥ 0, reçu : ${profile[stat]}`,
	);
}

/** La valeur d'un coefficient à un point de la jauge, de 0 à 1. */
function valueAt({ constant, perGauge }: Linear, gauge: number): number {
	return constant + perGauge * gauge;
}

/** Une part qui vaut 0 aux deux bouts de la jauge : elle ne fait rien. */
function isZero(linear: Linear): boolean {
	return GAUGE_ENDS.every((gauge) => valueAt(linear, gauge) === 0);
}

/** Un nombre fini ≥ 0 : ni négatif, ni NaN, ni infini. */
function isFiniteNonNegative(value: number): boolean {
	return Number.isFinite(value) && value >= 0;
}

/** Les parts d'une recette, en paires `[stat, part]` ; une part `undefined` est absente. */
function sharesOf(shares: Shares): [string, number][] {
	return Object.entries(shares).filter(
		(entry): entry is [string, number] => entry[1] !== undefined,
	);
}
