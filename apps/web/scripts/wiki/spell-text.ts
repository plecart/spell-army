// La transcription d'un sort du modèle de `combat` dans le vocabulaire de l'annexe B du game design :
// la page du wiki d'un sort ajouté par le MCP, qui n'a pas de ligne d'annexe, s'écrit comme celle
// d'un sort de la réserve de départ. `test/wiki-transcription.test.ts` confronte la transcription
// des 24 sorts de départ à l'annexe, lue à la source, et en dénombre les exceptions.
import {
	type CharacterClass,
	type Effect,
	type EffectBase,
	effectCategory,
	type Form,
	type Linear,
	type Recipe,
	type Spell,
} from "combat";
import { STAT_KEYS, type StatKey } from "personnages";
import { CLASS_NAMES } from "../../app/annuaire/address.ts";

/** La recette, la forme et l'effet d'un sort, en mots. */
export interface SpellText {
	recipe: string;
	form: string;
	effect: string;
}

/** Le nom de chaque stat (game design § 1, « Statistiques »). */
export const STAT_NAMES = {
	life: "Vie",
	strength: "Force",
	magic: "Magie",
	speed: "Vitesse",
} as const satisfies Record<StatKey, string>;

// Neuf décimales au plus, la tolérance d'arrondi des règles de `combat` (`rules.ts`) : l'arrondi
// binaire s'efface (1,4 − 1 y vaut 0,3999999999999999), et un coefficient saisi garde jusqu'à neuf
// décimales.
const MAX_DECIMALS = 9;
/** Un coefficient après « × » : une décimale au moins, « ×1,0 » pour un coup normal. */
const COEFFICIENT = new Intl.NumberFormat("fr-FR", {
	minimumFractionDigits: 1,
	maximumFractionDigits: MAX_DECIMALS,
	useGrouping: false,
});
/** Un nombre sans décimale imposée : la pente d'une jauge, un pourcentage. */
const NUMBER = new Intl.NumberFormat("fr-FR", {
	maximumFractionDigits: MAX_DECIMALS,
	useGrouping: false,
});
const PERCENT = 100;

const PARTS = [
	["damage", "dégâts"],
	["heal", "soin"],
] as const;

/** Ce que multiplie le coefficient, écrit après lui ; rien pour la stat de l'armée selon la recette. */
const BASES = {
	armyStat: "",
	armyMaxLife: " de la Vie maximale de l'armée",
	monsterLastHit: " du dernier coup du monstre",
} as const satisfies Record<EffectBase, string>;

/** Le nom d'une forme, et l'écriture du coefficient d'une part sous cette forme. */
interface FormWriting {
	name: string;
	coefficient: (linear: Linear) => string;
}

/** Hors forme conditionnelle, le coefficient ne suit aucune jauge : « ×1,15 ». */
const fixed = ({ constant }: Linear) => `×${COEFFICIENT.format(constant)}`;

/** Une jauge d'état, par ses deux bouts nommés : « ×1,4 (monstre intact) → ×0,4 (monstre à bout) ». */
const byEnds =
	(atZero: string, atOne: string) =>
	({ constant, perGauge }: Linear) =>
		`×${COEFFICIENT.format(constant)} (${atZero}) → ×${COEFFICIENT.format(constant + perGauge)} (${atOne})`;

/** Une part de l'armée, en formule : « ×(0,6 + 4 × part de golems) ». */
const byShare =
	(share: string) =>
	({ constant, perGauge }: Linear) =>
		`×(${COEFFICIENT.format(constant)} ${perGauge < 0 ? "−" : "+"} ${NUMBER.format(Math.abs(perGauge))} × ${share})`;

/**
 * Les membres d'une classe, au pluriel : « golems ».
 * ponytail: pluriel en « s », juste pour les huit libellés ; une table des pluriels si une classe
 * finissant en « s », « x » ou « z » arrive.
 */
function members(characterClass: CharacterClass): string {
	return `${CLASS_NAMES[characterClass].label.toLowerCase()}s`;
}

function formWriting(form: Form): FormWriting {
	switch (form.kind) {
		case "safe":
			return { name: "sûr", coefficient: fixed };
		case "costly":
			return { name: "coûteux", coefficient: fixed };
		case "inverted":
			return { name: "inversé", coefficient: fixed };
		case "conditional":
			return gaugeWriting(form);
	}
}

function gaugeWriting({
	gauge,
	characterClass,
}: Extract<Form, { kind: "conditional" }>): FormWriting {
	switch (gauge) {
		case "monsterLifeLost":
			return {
				name: "selon la Vie du monstre",
				coefficient: byEnds("monstre intact", "monstre à bout"),
			};
		case "armyWounds":
			return {
				name: "selon les blessures de l'armée",
				coefficient: byEnds("armée intacte", "armée presque morte"),
			};
		case "classShare": {
			// Un sort valide nomme la classe de cette jauge, et seulement d'elle (`validateSpell`).
			const named = members(characterClass as CharacterClass);
			return {
				name: `selon la part de ${named}`,
				coefficient: byShare(`part de ${named}`),
			};
		}
		case "casterClassShare":
			return {
				name: "selon la part de la classe du lanceur",
				coefficient: byShare("part de sa classe"),
			};
	}
}

/** « 60 % Force + 40 % Vie », les stats dans l'ordre du game design § 1 ; ou « meilleure stat ». */
function recipeText(recipe: Recipe): string {
	if (recipe.kind === "bestStat") return "meilleure stat";
	return STAT_KEYS.flatMap((stat) => {
		const share = recipe.shares[stat];
		return share === undefined ? [] : [`${share} % ${STAT_NAMES[stat]}`];
	}).join(" + ");
}

/**
 * Les dégâts puis le soin, liés par « + » et précédés de « vol de vie : » quand l'effet fait les
 * deux ; pour un coûteux, la part des dégâts que perd l'armée.
 */
function effectText(effect: Effect, form: Form, writing: FormWriting): string {
	const parts = PARTS.flatMap(([part, word]) => {
		const linear = effect[part];
		return linear
			? [`${word} ${writing.coefficient(linear)}${BASES[effect.base]}`]
			: [];
	}).join(" + ");
	const lifesteal =
		effectCategory(effect) === "lifesteal" ? "vol de vie : " : "";
	const loss =
		form.kind === "costly"
			? ` ; l'armée perd ${NUMBER.format(form.armyLossShare * PERCENT)} % des dégâts infligés`
			: "";
	return `${lifesteal}${parts}${loss}`;
}

/**
 * La recette, la forme et l'effet d'un sort dans le vocabulaire de l'annexe B : « 50 % Force + 50 %
 * Vitesse », « coûteux », « dégâts ×1,15 ; l'armée perd 10 % des dégâts infligés ». Les coefficients
 * s'écrivent en multiplicateurs de leur base, en virgule française.
 *
 * Précondition : un sort valide (`validateSpell` de `combat`) ; sinon le texte n'est pas garanti, et
 * un effet sans dégâts ni soin lève la `RangeError` d'`effectCategory`.
 */
export function spellText({
	recipe,
	form,
	effect,
}: Pick<Spell, "recipe" | "form" | "effect">): SpellText {
	const writing = formWriting(form);
	return {
		recipe: recipeText(recipe),
		form: writing.name,
		effect: effectText(effect, form, writing),
	};
}
