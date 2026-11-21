// Schéma Drizzle de la base, lu par `drizzle-kit generate` (`drizzle.config.ts`). Chaque domaine y
// ajoute ses tables.
import { type SQL, sql } from "drizzle-orm";
import {
	boolean,
	check,
	customType,
	doublePrecision,
	integer,
	jsonb,
	type PgColumn,
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
 * Les fichiers 3D (direction artistique § 7) : un GLB par classe ou par monstre, désigné par son
 * nom, l'un des deux exactement (`model_files_owner_check`). `size` et `sha256` sont calculés par
 * la base, depuis les octets. `model-files.ts` écrit la table ; le contrat du fichier se vérifie
 * chez l'appelant.
 */
export const modelFiles = pgTable(
	"model_files",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		class: text(),
		monster: text(),
		content: bytea().notNull(),
		size: integer()
			.notNull()
			.generatedAlwaysAs((): SQL => sql`octet_length(${modelFiles.content})`),
		sha256: text()
			.notNull()
			.generatedAlwaysAs(
				(): SQL => sql`encode(sha256(${modelFiles.content}), 'hex')`,
			),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"model_files_owner_check",
			sql`(${table.class} is null) <> (${table.monster} is null)`,
		),
	],
);

/**
 * Le modèle par défaut de chaque classe (direction artistique § 5, « Valeurs par défaut ») : au
 * plus un par classe, un fichier de `model_files` de cette classe, que `model-files.ts` vérifie.
 */
export const classDefaultModels = pgTable("class_default_models", {
	class: text().primaryKey(),
	modelFileId: integer("model_file_id")
		.notNull()
		.references(() => modelFiles.id),
});

/**
 * La forme d'un identifiant Instagram reçu du fournisseur : un entier décimal positif, sans zéro de
 * tête (« 007 » et « 0 » sont hors forme, jamais normalisés). Contrôlée sur `players` et
 * `excluded_players`.
 */
export const INSTAGRAM_ID_PATTERN = /^[1-9][0-9]*$/;

/**
 * La forme d'un pseudo Instagram reçu du fournisseur : 1 à 30 lettres ASCII, chiffres, `.` ou `_`
 * (ADR 0003, « Pseudos, données non fiables »). Contrôlée sur `players`.
 */
export const INSTAGRAM_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

// Le contrôle qu'une colonne suive `pattern`, dont la source, sans apostrophe, est recopiée en clair
// dans la migration. `test/formes-instagram.ts` en éprouve les bornes côté base.
function matches(column: PgColumn, pattern: RegExp): SQL {
	return sql`${column} ~ ${sql.raw(`'${pattern.source}'`)}`;
}

/**
 * Les joueurs (ADR 0003, « Données stockées », « Écriture » et « Sort à l'inscription ») : de
 * l'abonné, l'identifiant et le pseudo du fournisseur, rien d'autre ; la date d'arrivée, l'instant
 * de la transaction qui l'écrit ; le numéro du sort tiré à l'inscription ; le fichier du modèle 3D,
 * nul tant que sa classe n'a pas de modèle par défaut. La classe et les statistiques se calculent
 * depuis l'identifiant, jamais stockées.
 */
export const players = pgTable(
	"players",
	{
		instagramId: text("instagram_id").primaryKey(),
		username: text().notNull(),
		arrivedAt: timestamp("arrived_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		spellNumber: integer("spell_number")
			.notNull()
			.references(() => spells.number),
		modelFileId: integer("model_file_id").references(() => modelFiles.id),
	},
	(table) => [
		check(
			"players_instagram_id_check",
			matches(table.instagramId, INSTAGRAM_ID_PATTERN),
		),
		check(
			"players_username_check",
			matches(table.username, INSTAGRAM_USERNAME_PATTERN),
		),
	],
);

/**
 * Les identifiants Instagram exclus de l'import (ADR 0003, « RGPD ») : l'import n'en crée jamais le
 * joueur.
 */
export const excludedPlayers = pgTable(
	"excluded_players",
	{ instagramId: text("instagram_id").primaryKey() },
	(table) => [
		check(
			"excluded_players_instagram_id_check",
			matches(table.instagramId, INSTAGRAM_ID_PATTERN),
		),
	],
);

/**
 * Journal d'audit des appels d'outils du serveur MCP : l'outil, l'entrée reçue (les octets d'une
 * image remplacés par leur taille et leur empreinte), l'issue, et pour un changement l'état avant
 * et après. Un appel réussi n'a pas de message d'erreur, un appel échoué en a un.
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
