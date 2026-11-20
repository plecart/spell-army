import { DEFAULT_WEIGHT } from "./rules.ts";
import type { Linear, Recipe, Shares, Spell } from "./spell.ts";

function shares(parts: Shares): Recipe {
	return { kind: "shares", shares: parts };
}

function fixed(constant: number): Linear {
	return { constant, perGauge: 0 };
}

/**
 * La réserve de départ : les 24 sorts de l'annexe B du game design, dans son ordre et sous son
 * numéro, tous de poids 1. Les coefficients sont ceux de l'annexe, en multiplicateurs (×1,0 = un
 * coup normal). Chaque description écrit ses variables dans la phrase (direction artistique § 4,
 * « Description ») : la recette après « selon », la forme, le partage d'un vol de vie ; « gros »
 * ne qualifie que les coûteux, plus forts par définition (game design § 2, « Formes »).
 */
export const STARTING_POOL: readonly Spell[] = [
	{
		number: 1,
		name: "Coup d'épée",
		recipe: shares({ strength: 100 }),
		form: { kind: "safe" },
		effect: { base: "armyStat", damage: fixed(1) },
		weight: DEFAULT_WEIGHT,
		description: "Dégâts selon la Force.",
	},
	{
		number: 2,
		name: "Lancer de rocher",
		recipe: shares({ strength: 60, life: 40 }),
		form: { kind: "safe" },
		effect: { base: "armyStat", damage: fixed(1) },
		weight: DEFAULT_WEIGHT,
		description: "Dégâts selon 60 % de la Force et 40 % de la Vie.",
	},
	{
		number: 3,
		name: "Charge",
		recipe: shares({ strength: 50, speed: 50 }),
		form: { kind: "costly", armyLossShare: 0.1 },
		effect: { base: "armyStat", damage: fixed(1.15) },
		weight: DEFAULT_WEIGHT,
		description:
			"Gros dégâts selon 50 % de la Force et 50 % de la Vitesse. L'armée perd 10 % des dégâts infligés.",
	},
	{
		number: 4,
		name: "Coup de marteau",
		recipe: shares({ strength: 100 }),
		form: { kind: "conditional", gauge: "monsterLifeLost" },
		effect: { base: "armyStat", damage: { constant: 1.4, perGauge: -1 } },
		weight: DEFAULT_WEIGHT,
		description:
			"Dégâts selon la Force, d'autant plus forts que le monstre est intact.",
	},
	{
		number: 5,
		name: "Coup vampirique",
		recipe: shares({ strength: 100 }),
		form: { kind: "safe" },
		effect: { base: "armyStat", damage: fixed(0.5), heal: fixed(0.5) },
		weight: DEFAULT_WEIGHT,
		description:
			"Vol de vie selon la Force : moitié en dégâts, moitié en soin de l'armée.",
	},
	{
		number: 6,
		name: "Boule de feu",
		recipe: shares({ magic: 100 }),
		form: { kind: "safe" },
		effect: { base: "armyStat", damage: fixed(1) },
		weight: DEFAULT_WEIGHT,
		description: "Dégâts selon la Magie.",
	},
	{
		number: 7,
		name: "Météore",
		recipe: shares({ magic: 100 }),
		form: { kind: "costly", armyLossShare: 0.15 },
		effect: { base: "armyStat", damage: fixed(1.2) },
		weight: DEFAULT_WEIGHT,
		description:
			"Gros dégâts selon la Magie. L'armée perd 15 % des dégâts infligés.",
	},
	{
		number: 8,
		name: "Éclair",
		recipe: shares({ magic: 70, speed: 30 }),
		form: { kind: "safe" },
		effect: { base: "armyStat", damage: fixed(1) },
		weight: DEFAULT_WEIGHT,
		description: "Dégâts selon 70 % de la Magie et 30 % de la Vitesse.",
	},
	{
		number: 9,
		name: "Drain de vie",
		recipe: shares({ magic: 100 }),
		form: { kind: "safe" },
		effect: { base: "armyStat", damage: fixed(0.5), heal: fixed(0.5) },
		weight: DEFAULT_WEIGHT,
		description:
			"Vol de vie selon la Magie : moitié en dégâts, moitié en soin de l'armée.",
	},
	{
		number: 10,
		name: "Tornade",
		recipe: shares({ speed: 100 }),
		form: { kind: "safe" },
		effect: { base: "armyStat", damage: fixed(1) },
		weight: DEFAULT_WEIGHT,
		description: "Dégâts selon la Vitesse.",
	},
	{
		number: 11,
		name: "Soin",
		recipe: shares({ magic: 100 }),
		form: { kind: "safe" },
		effect: { base: "armyStat", heal: fixed(1.2) },
		weight: DEFAULT_WEIGHT,
		description: "Soin de l'armée selon la Magie.",
	},
	{
		number: 12,
		name: "Prière",
		recipe: shares({ strength: 20, magic: 80 }),
		form: { kind: "safe" },
		effect: { base: "armyStat", heal: fixed(0.6), damage: fixed(0.4) },
		weight: DEFAULT_WEIGHT,
		description:
			"Vol de vie selon 20 % de la Force et 80 % de la Magie : un peu plus de soin de l'armée que de dégâts.",
	},
	{
		number: 13,
		name: "Soin des blessés graves",
		recipe: shares({ magic: 100 }),
		form: { kind: "conditional", gauge: "armyWounds" },
		effect: { base: "armyStat", heal: { constant: 0.6, perGauge: 1 } },
		weight: DEFAULT_WEIGHT,
		description:
			"Soin de l'armée selon la Magie, d'autant plus fort que l'armée est blessée.",
	},
	{
		number: 14,
		name: "Cri de ralliement",
		recipe: shares({ life: 100 }),
		form: { kind: "safe" },
		effect: { base: "armyMaxLife", heal: fixed(0.2) },
		weight: DEFAULT_WEIGHT,
		description: "Soin de 20 % de la Vie maximale de l'armée, selon la Vie.",
	},
	{
		number: 15,
		name: "Rage du désespoir",
		recipe: shares({ strength: 100 }),
		form: { kind: "conditional", gauge: "armyWounds" },
		effect: { base: "armyStat", damage: { constant: 0.5, perGauge: 1 } },
		weight: DEFAULT_WEIGHT,
		description:
			"Dégâts selon la Force, d'autant plus forts que l'armée est blessée.",
	},
	{
		number: 16,
		name: "Le Barbare ignorant",
		recipe: shares({ magic: 100 }),
		form: { kind: "inverted" },
		effect: { base: "armyStat", damage: fixed(1) },
		weight: DEFAULT_WEIGHT,
		description:
			"Dégâts selon la Magie, d'autant plus forts que le lanceur en manque.",
	},
	{
		number: 17,
		name: "Les golems se relèvent",
		recipe: shares({ life: 100 }),
		form: { kind: "conditional", gauge: "classShare", characterClass: "golem" },
		effect: { base: "armyStat", heal: { constant: 0.6, perGauge: 4 } },
		weight: DEFAULT_WEIGHT,
		description:
			"Soin de l'armée selon la Vie, d'autant plus fort que l'armée compte de golems.",
	},
	{
		number: 18,
		name: "Appel du clan",
		recipe: { kind: "bestStat" },
		form: { kind: "conditional", gauge: "casterClassShare" },
		effect: { base: "armyStat", damage: { constant: 0.4, perGauge: 3.5 } },
		weight: DEFAULT_WEIGHT,
		description:
			"Dégâts selon la meilleure stat du lanceur, d'autant plus forts que l'armée compte de membres de sa classe.",
	},
	{
		number: 19,
		name: "Talent caché",
		recipe: { kind: "bestStat" },
		form: { kind: "safe" },
		effect: { base: "armyStat", damage: fixed(0.85) },
		weight: DEFAULT_WEIGHT,
		description: "Dégâts selon la meilleure stat du lanceur.",
	},
	{
		number: 20,
		name: "Vengeance",
		recipe: shares({ life: 100 }),
		form: { kind: "safe" },
		effect: { base: "monsterLastHit", damage: fixed(1.4) },
		weight: DEFAULT_WEIGHT,
		description: "Dégâts de 140 % du dernier coup du monstre, selon la Vie.",
	},
	{
		number: 21,
		name: "Le Poids plume",
		recipe: shares({ strength: 100 }),
		form: { kind: "inverted" },
		effect: { base: "armyStat", damage: fixed(1) },
		weight: DEFAULT_WEIGHT,
		description:
			"Dégâts selon la Force, d'autant plus forts que le lanceur en manque.",
	},
	{
		number: 22,
		name: "Le Rebouteux",
		recipe: shares({ magic: 100 }),
		form: { kind: "inverted" },
		effect: { base: "armyStat", heal: fixed(1.2) },
		weight: DEFAULT_WEIGHT,
		description:
			"Soin de l'armée selon la Magie, d'autant plus fort que le lanceur en manque.",
	},
	{
		number: 23,
		name: "Le Coup lent",
		recipe: shares({ speed: 100 }),
		form: { kind: "inverted" },
		effect: { base: "armyStat", damage: fixed(1) },
		weight: DEFAULT_WEIGHT,
		description:
			"Dégâts selon la Vitesse, d'autant plus forts que le lanceur en manque.",
	},
	{
		number: 24,
		name: "Le Sacrifice",
		recipe: shares({ life: 100 }),
		form: { kind: "inverted" },
		effect: { base: "armyStat", heal: fixed(1.1) },
		weight: DEFAULT_WEIGHT,
		description:
			"Soin de l'armée selon la Vie, d'autant plus fort que le lanceur en manque.",
	},
];
