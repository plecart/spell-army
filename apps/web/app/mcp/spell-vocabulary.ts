// Le vocabulaire des outils des sorts : un sort du modèle de `combat` dans les noms français des
// outils, ses schémas Zod, et sa traduction dans les deux sens.
import {
	DEFAULT_WEIGHT,
	type Effect,
	type EffectBase,
	type EffectCategory,
	effectCategory,
	type Form,
	type Gauge,
	type Linear,
	type Recipe,
	type Spell,
	type Stat,
} from "combat";
import type { SpellRecord } from "donnees";
import { z } from "zod";
import {
	CLASS_OF,
	CLASSES,
	inverse,
	renamed,
	STAT_OF,
	STATS,
} from "./vocabulary.ts";

// Les tables du vocabulaire fermé de `combat`, sur le modèle de `vocabulary.ts`, qui porte celles des
// classes et des stats. Les noms viennent du game design (§ 2, « Formes », « Effets ») et de l'issue
// #12 (« Décisions », « Modèle d'un sort »).
const RECIPES = {
	shares: "parts",
	bestStat: "meilleure_stat",
} as const satisfies Record<Recipe["kind"], string>;
const FORMS = {
	safe: "sur",
	costly: "couteux",
	conditional: "conditionnel",
	inverted: "inverse",
} as const satisfies Record<Form["kind"], string>;
const GAUGES = {
	monsterLifeLost: "vie_perdue_par_le_monstre",
	armyWounds: "blessures_de_l_armee",
	classShare: "part_d_une_classe",
	casterClassShare: "part_de_la_classe_du_lanceur",
} as const satisfies Record<Gauge, string>;
const BASES = {
	armyStat: "stat_de_l_armee",
	armyMaxLife: "vie_maximale_de_l_armee",
	monsterLastHit: "dernier_coup_du_monstre",
} as const satisfies Record<EffectBase, string>;
const CATEGORIES = {
	damage: "degats",
	heal: "soin",
	lifesteal: "vol_de_vie",
} as const satisfies Record<EffectCategory, string>;

const FORM_OF = inverse(FORMS);
const GAUGE_OF = inverse(GAUGES);
const BASE_OF = inverse(BASES);

// Les longueurs d'un nom et d'une description : bornées, comme toute chaîne d'une entrée d'outil
// (`test/aucune-requete-libre.test.ts`), au-delà des textes de la réserve de départ.
export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Le nom qui discrimine une variante, en `enum` d'une valeur : le schéma JSON le publie fermé, là
 * où un `z.literal` publie un `const`, que `test/aucune-requete-libre.test.ts` tient pour libre.
 */
const variant = <const Name extends string>(name: Name) => z.enum([name]);

// Une part par stat, chacune facultative : un objet fermé, sous les noms de `STATS`.
const shares = z.strictObject(
	Object.fromEntries(
		Object.values(STATS).map((stat) => [stat, z.number().optional()]),
	) as Record<(typeof STATS)[Stat], z.ZodOptional<z.ZodNumber>>,
);

const linear = z.strictObject({
	constante: z.number(),
	par_jauge: z.number(),
});

const recipe = z.discriminatedUnion("type", [
	z.strictObject({
		type: variant(RECIPES.shares),
		parts: shares,
	}),
	z.strictObject({ type: variant(RECIPES.bestStat) }),
]);

const form = z.discriminatedUnion("type", [
	z.strictObject({ type: variant(FORMS.safe) }),
	z.strictObject({ type: variant(FORMS.costly), part_perdue: z.number() }),
	z.strictObject({
		type: variant(FORMS.conditional),
		jauge: z.enum(GAUGES),
		classe: z.enum(CLASSES).optional(),
	}),
	z.strictObject({ type: variant(FORMS.inverted) }),
]);

const effect = z.strictObject({
	base: z.enum(BASES),
	degats: linear.optional(),
	soin: linear.optional(),
});

/** Un sort dans le vocabulaire des outils, que rendent les trois outils. */
export const toolSpellSchema = z.strictObject({
	numero: z
		.number()
		.int()
		.describe(
			"Le numéro du sort, son identifiant stable, celui du pied de la carte (« 3/24 »).",
		),
	nom: z
		.string()
		.max(MAX_NAME_LENGTH)
		.describe(
			`Le nom du sort, en tête de la carte : au plus ${MAX_NAME_LENGTH} caractères.`,
		),
	recette: recipe.describe(
		"La part de chaque stat qu'utilise le sort, pour la puissance de l'armée comme pour l'efficacité du lanceur : des parts entières en %, de somme 100 (type parts) ; ou la meilleure stat du lanceur (type meilleure_stat).",
	),
	forme: form.describe(
		"La forme du sort : sûr ; coûteux, l'armée perdant part_perdue des dégâts infligés, entre 0 et 1 ; conditionnel, selon sa jauge de 0 à 1, qui nomme une classe si et seulement si elle est part_d_une_classe ; inversé, plus fort quand la stat du lanceur est basse.",
	),
	effet: effect.describe(
		"Des dégâts, du soin ou les deux, chacun constante + par_jauge × jauge, par_jauge à 0 hors forme conditionnelle. Les coefficients multiplient la base : la stat de l'armée selon la recette (×1,0 = un coup normal), sa Vie maximale ou le dernier coup du monstre, telles quelles. Un sort mixte (dégâts et soin) ne prend que la stat de l'armée, et dégâts + soin y valent au plus 1 aux deux bouts de la jauge.",
	),
	categorie: z
		.enum(CATEGORIES)
		.describe(
			"Dégâts, soin ou vol de vie (les deux), la pastille de la carte : déduite de l'effet, jamais saisie.",
		),
	poids: z
		.number()
		.describe(
			"Le poids de tirage, un nombre ≥ 0 : 1 par défaut ; 0, jamais tiré, seulement donné à la main.",
		),
	description: z
		.string()
		.max(MAX_DESCRIPTION_LENGTH)
		.describe(
			`La phrase de la carte, ses variables comprises : non vide, au plus ${MAX_DESCRIPTION_LENGTH} caractères.`,
		),
	image: z
		.strictObject({ type: z.string(), taille: z.number(), sha256: z.string() })
		.nullable()
		.describe(
			"L'image de la carte : son type, sa taille en octets et son empreinte SHA-256, jamais ses octets ; null sans image.",
		),
});

type ToolSpell = z.output<typeof toolSpellSchema>;
type ToolRecipe = z.output<typeof recipe>;
type ToolForm = z.output<typeof form>;
type ToolEffect = z.output<typeof effect>;
type ToolLinear = z.output<typeof linear>;

/** Un sort à ajouter : sans numéro, ni catégorie, déduite, ni image ; de poids 1 sans poids donné. */
export const newSpellSchema = toolSpellSchema
	.pick({
		nom: true,
		recette: true,
		forme: true,
		effet: true,
		poids: true,
		description: true,
	})
	.partial({ poids: true });

const toolLinear = ({ constant, perGauge }: Linear): ToolLinear => ({
	constante: constant,
	par_jauge: perGauge,
});

const modelLinear = ({ constante, par_jauge }: ToolLinear): Linear => ({
	constant: constante,
	perGauge: par_jauge,
});

function toolRecipe(recipe: Recipe): ToolRecipe {
	if (recipe.kind === "bestStat") return { type: RECIPES.bestStat };
	return { type: RECIPES.shares, parts: renamed(recipe.shares, STATS) };
}

function modelRecipe(recette: ToolRecipe): Recipe {
	if (recette.type === RECIPES.bestStat) return { kind: "bestStat" };
	return { kind: "shares", shares: renamed(recette.parts, STAT_OF) };
}

function toolForm(form: Form): ToolForm {
	switch (form.kind) {
		case "costly":
			return { type: FORMS.costly, part_perdue: form.armyLossShare };
		case "conditional":
			return {
				type: FORMS.conditional,
				jauge: GAUGES[form.gauge],
				...(form.characterClass && { classe: CLASSES[form.characterClass] }),
			};
		default:
			return { type: FORMS[form.kind] };
	}
}

function modelForm(forme: ToolForm): Form {
	switch (forme.type) {
		case FORMS.costly:
			return { kind: "costly", armyLossShare: forme.part_perdue };
		case FORMS.conditional:
			return {
				kind: "conditional",
				gauge: GAUGE_OF[forme.jauge],
				...(forme.classe && { characterClass: CLASS_OF[forme.classe] }),
			};
		default:
			return { kind: FORM_OF[forme.type] };
	}
}

function toolEffect({ base, damage, heal }: Effect): ToolEffect {
	return {
		base: BASES[base],
		...(damage && { degats: toolLinear(damage) }),
		...(heal && { soin: toolLinear(heal) }),
	};
}

function modelEffect({ base, degats, soin }: ToolEffect): Effect {
	return {
		base: BASE_OF[base],
		...(degats && { damage: modelLinear(degats) }),
		...(soin && { heal: modelLinear(soin) }),
	};
}

/**
 * Le sort d'une ligne de la table, que `donnees` rend sans lire `recipe`, `form` et `effect` : le
 * modèle de `combat`, validé avant d'être écrit. Le schéma de sortie de chaque outil le revalide
 * une fois traduit ; le wiki, par `validateSpell`. L'image de la ligne, résumée ou en octets, n'y
 * entre pas.
 */
export function spellOf({
	number,
	name,
	recipe,
	form,
	effect,
	weight,
	description,
}: Omit<SpellRecord, "image">): Spell {
	return {
		number,
		name,
		recipe: recipe as Recipe,
		form: form as Form,
		effect: effect as Effect,
		weight,
		description,
	};
}

/** Un sort de la table dans le vocabulaire des outils, sa catégorie déduite de son effet. */
export function toToolSpell(record: SpellRecord): ToolSpell {
	const { number, name, recipe, form, effect, weight, description } =
		spellOf(record);
	return {
		numero: number,
		nom: name,
		recette: toolRecipe(recipe),
		forme: toolForm(form),
		effet: toolEffect(effect),
		categorie: CATEGORIES[effectCategory(effect)],
		poids: weight,
		description,
		image: record.image && {
			type: record.image.type,
			taille: record.image.size,
			sha256: record.image.sha256,
		},
	};
}

/** Un sort à ajouter, dans le modèle de `combat`, de poids 1 sans poids donné. */
export function toModelSpell({
	nom,
	recette,
	forme,
	effet,
	poids = DEFAULT_WEIGHT,
	description,
}: z.output<typeof newSpellSchema>): Omit<Spell, "number"> {
	return {
		name: nom,
		recipe: modelRecipe(recette),
		form: modelForm(forme),
		effect: modelEffect(effet),
		weight: poids,
		description,
	};
}
