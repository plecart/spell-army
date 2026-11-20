// Schéma Drizzle de la base, lu par `drizzle-kit generate` (`drizzle.config.ts`). Chaque domaine y
// ajoute ses tables.
import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	customType,
	doublePrecision,
	integer,
	jsonb,
	pgTable,
	smallint,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Réglages du calibrage (`docs/game-design.md` § 6), en une seule ligne (`id = 1`) que pose la
 * migration `0002_reglages_de_depart`, lue et modifiée par `calibration-settings.ts`. Chaque borne
 * est une contrainte `check`, nommée `calibration_settings_<colonne>_check`.
 */
export const calibrationSettings = pgTable(
	"calibration_settings",
	{
		id: smallint().primaryKey(),
		recruitShare: doublePrecision("recruit_share").notNull(),
		recruitShareDrop: doublePrecision("recruit_share_drop").notNull(),
		referenceWindowDays: integer("reference_window_days").notNull(),
		averageRecruitLife: doublePrecision("average_recruit_life").notNull(),
		averageRecruitStrength: doublePrecision(
			"average_recruit_strength",
		).notNull(),
		averageRecruitMagic: doublePrecision("average_recruit_magic").notNull(),
		averageRecruitSpeed: doublePrecision("average_recruit_speed").notNull(),
		dayTwoBudgetRecruits: integer("day_two_budget_recruits").notNull(),
	},
	(table) => [
		check("calibration_settings_id_check", sql`${table.id} = 1`),
		check(
			"calibration_settings_recruit_share_check",
			sql`${table.recruitShare} between 0 and 1`,
		),
		check(
			"calibration_settings_recruit_share_drop_check",
			sql`${table.recruitShareDrop} between 0 and 1`,
		),
		check(
			"calibration_settings_reference_window_days_check",
			sql`${table.referenceWindowDays} >= 1`,
		),
		// Postgres tient `NaN` pour plus grand que tout nombre, `Infinity` compris : `> 0` l'admet,
		// la borne haute `< 'Infinity'` l'écarte avec `Infinity`.
		...[
			table.averageRecruitLife,
			table.averageRecruitStrength,
			table.averageRecruitMagic,
			table.averageRecruitSpeed,
		].map((stat) =>
			check(
				`calibration_settings_${stat.name}_check`,
				sql`${stat} > 0 and ${stat} < 'Infinity'::double precision`,
			),
		),
		check(
			"calibration_settings_day_two_budget_recruits_check",
			sql`${table.dayTwoBudgetRecruits} >= 1`,
		),
	],
);

// `bytea`, que `pg-core` ne fournit pas (drizzle-orm 0.45.4) : `pg` envoie un `Uint8Array` en
// paramètre binaire et rend un `Buffer` (`prepareValue` de `pg/lib/utils.js` 8.23.1, `writeValues`
// de `pg-protocol` 1.16.1, parseur 17 de `pg-types` 2.2.0, lus le 2026-11-20).
const bytea = customType<{ data: Uint8Array }>({ dataType: () => "bytea" });

/**
 * La réserve de sorts (game design § 2), sous leur numéro, l'identifiant stable du pied de la carte.
 * La migration `0004_reserve_de_depart` pose la réserve de départ ; `spells.ts` lit et écrit la
 * table. `recipe`, `form` et `effect` portent le modèle de `combat` tel quel, `key` sa clé
 * d'unicité (`spellKey`), sous un index unique. Chaque borne est une contrainte `check`, nommée
 * `spells_<colonne>_check` ; l'image, des octets et leur type, est facultative.
 */
export const spells = pgTable(
	"spells",
	{
		number: integer().primaryKey(),
		name: text().notNull(),
		recipe: jsonb().notNull(),
		form: jsonb().notNull(),
		effect: jsonb().notNull(),
		key: text().notNull(),
		weight: doublePrecision().notNull(),
		description: text().notNull(),
		image: bytea(),
		imageType: text("image_type"),
	},
	(table) => [
		uniqueIndex("spells_key_unique").on(table.key),
		// Même garde que les réglages : la borne haute écarte `NaN` avec `Infinity`.
		check(
			"spells_weight_check",
			sql`${table.weight} >= 0 and ${table.weight} < 'Infinity'::double precision`,
		),
		// Un texte non blanc : au moins un caractère hors des blancs.
		...[table.name, table.description].map((column) =>
			check(`spells_${column.name}_check`, sql`${column} ~ '[^[:space:]]'`),
		),
		// Les octets et leur type, ensemble ou pas du tout.
		check(
			"spells_image_check",
			sql`(${table.image} is null) = (${table.imageType} is null)`,
		),
		check(
			"spells_image_type_check",
			sql`${table.imageType} in ('image/png', 'image/jpeg', 'image/webp')`,
		),
	],
);

/**
 * Journal d'audit des appels d'outils du serveur MCP : l'outil, l'entrée brute reçue, l'issue, et
 * pour une modification les réglages avant et après. Un appel réussi n'a pas de message d'erreur,
 * un appel échoué en a un.
 */
export const auditLog = pgTable(
	"audit_log",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		at: timestamp({ withTimezone: true }).notNull().defaultNow(),
		tool: text().notNull(),
		input: jsonb().notNull(),
		succeeded: boolean().notNull(),
		error: text(),
		before: jsonb(),
		after: jsonb(),
	},
	(table) => [
		check(
			"audit_log_succeeded_check",
			sql`${table.succeeded} = (${table.error} is null)`,
		),
	],
);
