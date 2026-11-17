import {
	type CalibrationSettings,
	readCalibrationSettings,
	updateCalibrationSettings,
} from "donnees";
import { z } from "zod";
import type { McpTool } from "./tool.ts";

/**
 * Le nom de chaque réglage dans les outils, en français (décision du mainteneur, 2026-11-17) : la
 * table de correspondance avec les champs de `CalibrationSettings`, que `toToolSettings` et
 * `toPatch` lisent chacune dans un sens. Le type exige un nom pour chaque champ.
 */
const SETTING_NAMES = {
	recruitShare: "p",
	recruitShareDrop: "baisse_p",
	referenceWindowDays: "fenetre_jours",
	averageRecruitLife: "recrue_moyenne_vie",
	averageRecruitStrength: "recrue_moyenne_force",
	averageRecruitMagic: "recrue_moyenne_magie",
	averageRecruitSpeed: "recrue_moyenne_vitesse",
	dayTwoBudgetRecruits: "budget_jour_2",
} as const satisfies Record<keyof CalibrationSettings, string>;

type Field = keyof typeof SETTING_NAMES;
type ToolSettings = Record<(typeof SETTING_NAMES)[Field], number>;

const FIELDS = Object.keys(SETTING_NAMES) as Field[];

/** Les réglages sous leurs noms d'outil. */
function toToolSettings(settings: CalibrationSettings): ToolSettings {
	return Object.fromEntries(
		FIELDS.map((field) => [SETTING_NAMES[field], settings[field]]),
	) as ToolSettings;
}

/** Les seuls champs que donne l'entrée, sous leurs noms de `CalibrationSettings`. */
function toPatch(input: Partial<ToolSettings>): Partial<CalibrationSettings> {
	return Object.fromEntries(
		FIELDS.filter((field) => input[SETTING_NAMES[field]] !== undefined).map(
			(field) => [field, input[SETTING_NAMES[field]]],
		),
	);
}

// La plus grande valeur d'une colonne `integer` de Postgres : la validation la dit, la base ne la
// découvre pas.
const POSTGRES_INTEGER_MAX = 2_147_483_647;

// Les bornes de l'issue #11 (« Décisions ») ; `z.number()` refuse déjà `Infinity` et `NaN` (Zod 4).
const fraction = z.number().min(0).max(1);
const positiveInteger = z.number().int().min(1).max(POSTGRES_INTEGER_MAX);

function averageRecruitStat(name: string) {
	return z
		.number()
		.positive()
		.describe(
			`${name} de la recrue moyenne, dans le budget du monstre : un nombre strictement positif.`,
		);
}

const settingsUpdate = z
	.strictObject({
		p: fraction.describe(
			"Part des recrues de référence comptée dans le budget du prochain monstre, en fraction de 0 à 1 : 0,7 pour 70 %. Le calibrage la baisse après des défaites ; ce réglage la relève.",
		),
		baisse_p: fraction.describe(
			"Baisse de p à chaque paire de défaites de suite, en fraction de 0 à 1 : 0,1 pour 10 points.",
		),
		fenetre_jours: positiveInteger.describe(
			"Nombre de jours dont la médiane des recrues donne les recrues de référence : un entier, au moins 1.",
		),
		recrue_moyenne_vie: averageRecruitStat("Vie"),
		recrue_moyenne_force: averageRecruitStat("Force"),
		recrue_moyenne_magie: averageRecruitStat("Magie"),
		recrue_moyenne_vitesse: averageRecruitStat("Vitesse"),
		budget_jour_2: positiveInteger.describe(
			"Budget du monstre du jour 2, en nombre de recrues moyennes : un entier, au moins 1.",
		),
	})
	.partial()
	.refine(
		(input) => Object.values(input).some((value) => value !== undefined),
		"Aucun réglage à modifier : l'entrée doit donner au moins un réglage.",
	);

export const readSettingsTool: McpTool = {
	name: "lire_reglages",
	description:
		"Lit les réglages du calibrage, qui dimensionnent le prochain monstre : budget = stats réelles de l'armée + p × recrues de référence × recrue moyenne. Rend les huit réglages, sous les noms qu'attend modifier_reglages.",
	input: z.strictObject({}),
	run: async (executor) => ({
		output: toToolSettings(await readCalibrationSettings(executor)),
	}),
};

export const updateSettingsTool: McpTool<typeof settingsUpdate> = {
	name: "modifier_reglages",
	description:
		"Modifie un ou plusieurs réglages du calibrage : seuls les réglages donnés changent, au moins un est requis. Rend les réglages après la modification ; le journal d'audit garde les valeurs d'avant et d'après.",
	input: settingsUpdate,
	run: async (executor, input) => {
		const { before, after } = await updateCalibrationSettings(
			executor,
			toPatch(input),
		);
		const settingsAfter = toToolSettings(after);
		return {
			output: settingsAfter,
			before: toToolSettings(before),
			after: settingsAfter,
		};
	},
};
