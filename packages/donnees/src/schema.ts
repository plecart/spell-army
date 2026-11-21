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
	uuid,
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
 * tête (« 007 » et « 0 » sont hors forme, jamais normalisés), de 20 chiffres au plus, la largeur
 * d'un entier de 64 bits : un identifiant démesuré dépasserait la taille d'une entrée d'index et
 * ferait échouer sa page à chaque passe. Contrôlée sur `players` et `excluded_players`, et lue par
 * le tri des entrées du paquet `joueurs`.
 */
export const INSTAGRAM_ID_PATTERN = /^[1-9][0-9]{0,19}$/;

/**
 * La forme d'un pseudo Instagram reçu du fournisseur : 1 à 30 lettres ASCII, chiffres, `.` ou `_`
 * (ADR 0003, « Pseudos, données non fiables »). Contrôlée sur `players`, et lue par le tri des
 * entrées du paquet `joueurs`.
 */
export const INSTAGRAM_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

// Un texte recopié en clair dans la migration, entre apostrophes : il n'en porte donc aucune.
function literal(value: string): SQL {
	if (value.includes("'")) {
		throw new Error(
			`un texte recopié dans la migration ne doit porter aucune apostrophe : ${value}`,
		);
	}
	return sql.raw(`'${value}'`);
}

// Le contrôle qu'une colonne suive `pattern`. `test/formes-instagram.ts` en éprouve les bornes, côté
// base et côté JavaScript.
function matches(column: PgColumn, pattern: RegExp): SQL {
	return sql`${column} ~ ${literal(pattern.source)}`;
}

// Le contrôle qu'une colonne vaille l'une des `values`.
function oneOf(column: PgColumn, values: readonly string[]): SQL {
	return sql`${column} in (${sql.join(values.map(literal), sql`, `)})`;
}

/**
 * Les joueurs (ADR 0003, « Données stockées », « Écriture » et « Sort à l'inscription ») : de
 * l'abonné, l'identifiant et le pseudo du fournisseur, rien d'autre ; la date d'arrivée, l'instant
 * de la transaction qui l'écrit ; le numéro du sort tiré à l'inscription ; le fichier du modèle 3D,
 * celui par défaut de sa classe à l'inscription, nul si elle n'en avait pas. La classe et les
 * statistiques se calculent depuis l'identifiant, jamais stockées.
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

// Les déclencheurs de chaque type de passe d'import, que `import_passes_trigger_check` apparie.
const QUICK_PASS_TRIGGERS = ["tick", "mcp"] as const;
const FULL_PASS_TRIGGERS = ["weekly", "self_check", "mcp"] as const;

/** Le déclencheur d'une passe rapide d'import : le tic, ou le MCP. */
export type QuickPassTrigger = (typeof QUICK_PASS_TRIGGERS)[number];

/** Le déclencheur d'une passe complète d'import : la semaine, l'auto-contrôle, ou le MCP. */
export type FullPassTrigger = (typeof FULL_PASS_TRIGGERS)[number];

// L'état d'une passe : en cours, interrompue (budget, fonction tuée), en échec, terminée.
const PASS_STATUSES = ["running", "interrupted", "failed", "done"] as const;

/**
 * Le journal des passes d'import (ADR 0003, « Journal ») : une ligne par passe, qu'une complète
 * garde sur plusieurs tics, partie de l'un des déclencheurs de son type. `finished_at` est
 * l'instant du dernier arrêt, nul pendant que la passe tourne ; `error` n'existe que pour une passe
 * en échec ; `cursor`, le curseur de la prochaine page d'une complète, reste nul pour une rapide.
 * Les entrées écartées se comptent par motif, jamais gardées. Une seule complète non terminée à la
 * fois (`import_passes_one_unfinished_full`). `packages/joueurs` écrit la table.
 */
export const importPasses = pgTable(
	"import_passes",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		kind: text({ enum: ["quick", "full"] }).notNull(),
		trigger: text({
			enum: [...QUICK_PASS_TRIGGERS, ...FULL_PASS_TRIGGERS],
		}).notNull(),
		status: text({ enum: PASS_STATUSES }).notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		pages: integer().notNull().default(0),
		added: integer().notNull().default(0),
		invalidIds: integer("invalid_ids").notNull().default(0),
		invalidUsernames: integer("invalid_usernames").notNull().default(0),
		error: text(),
		cursor: text(),
	},
	(table) => [
		check(
			"import_passes_trigger_check",
			sql`(${table.kind} = 'quick' and ${oneOf(table.trigger, QUICK_PASS_TRIGGERS)}) or (${table.kind} = 'full' and ${oneOf(table.trigger, FULL_PASS_TRIGGERS)})`,
		),
		check("import_passes_status_check", oneOf(table.status, PASS_STATUSES)),
		check(
			"import_passes_finished_at_check",
			sql`(${table.finishedAt} is null) = (${table.status} = 'running')`,
		),
		check(
			"import_passes_error_check",
			sql`(${table.error} is not null) = (${table.status} = 'failed')`,
		),
		check(
			"import_passes_cursor_check",
			sql`${table.kind} = 'full' or ${table.cursor} is null`,
		),
		...[table.pages, table.added, table.invalidIds, table.invalidUsernames].map(
			(count) => check(`import_passes_${count.name}_check`, sql`${count} >= 0`),
		),
		uniqueIndex("import_passes_one_unfinished_full")
			.on(table.kind)
			.where(sql`${table.kind} = 'full' and ${table.status} <> 'done'`),
	],
);

/**
 * Le verrou à bail de l'import (ADR 0002, « Verrou à bail ») : au plus une ligne (`id = 1`), son
 * porteur et l'échéance de son bail. `packages/joueurs` le prend et le rend.
 */
export const importLock = pgTable(
	"import_lock",
	{
		id: smallint().primaryKey(),
		holder: uuid().notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(table) => [check("import_lock_id_check", sql`${table.id} = 1`)],
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
