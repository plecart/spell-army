import type {
	Effect,
	EffectBase,
	Form,
	Linear,
	Recipe,
	Shares,
	Spell,
} from "./spell.ts";

/** La pastille de la carte (direction artistique § 4, « En-tête ») : Dégâts, Soin ou Vol de vie. */
export type EffectCategory = "damage" | "heal" | "lifesteal";

/**
 * Le poids par défaut, celui de la réserve de départ et d'un sort ajouté sans poids (game design
 * § 2, « Rareté » : égal pour tous par défaut).
 */
export const DEFAULT_WEIGHT = 1;

/** La somme des parts d'une recette, en % : une part se lit sur ce total. */
export const FULL_RECIPE = 100;
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
 *   le monstre — mesuré sur les armées des graines 1 à 2 000 : de 0,18 à 0,21 de la Vie maximale
 *   selon la recette, de 0,90 à 2,09 du dernier coup selon l'attaque d'un monstre de moyenne
 *   ×0,78 —, et aucune borne fixe n'y tiendrait ce « jamais ».
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
	const shares = sharesOf(recipe.shares);
	const errors = shares
		.filter(
			([, share]) =>
				!(Number.isInteger(share) && share >= 1 && share <= FULL_RECIPE),
		)
		.map(
			([stat, share]) =>
				`la part « ${stat} » de la recette doit être un entier de 1 à ${FULL_RECIPE}, reçu : ${share}`,
		);
	const total = shares.reduce((sum, [, share]) => sum + share, 0);
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
	if (!ends.every((value) => Number.isFinite(value) && value >= 0)) {
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
	return Number.isFinite(weight) && weight >= 0
		? []
		: [`le poids doit être un nombre fini ≥ 0, reçu : ${weight}`];
}

function textErrors(candidate: Omit<Spell, "number">): string[] {
	return TEXT_FIELDS.filter(([field]) => candidate[field].trim() === "").map(
		([, label]) => `${label} ne doit pas être vide`,
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

/** Les parts d'une recette, en paires `[stat, part]` ; une part `undefined` est absente. */
function sharesOf(shares: Shares): [string, number][] {
	return Object.entries(shares).filter(
		(entry): entry is [string, number] => entry[1] !== undefined,
	);
}
