CREATE TABLE "audit_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb NOT NULL,
	"succeeded" boolean NOT NULL,
	"error" text,
	"before" jsonb,
	"after" jsonb,
	CONSTRAINT "audit_log_succeeded_check" CHECK ("audit_log"."succeeded" = ("audit_log"."error" is null))
);
--> statement-breakpoint
CREATE TABLE "calibration_settings" (
	"id" smallint PRIMARY KEY NOT NULL,
	"recruit_share" double precision NOT NULL,
	"recruit_share_drop" double precision NOT NULL,
	"reference_window_days" integer NOT NULL,
	"average_recruit_life" double precision NOT NULL,
	"average_recruit_strength" double precision NOT NULL,
	"average_recruit_magic" double precision NOT NULL,
	"average_recruit_speed" double precision NOT NULL,
	"day_two_budget_recruits" integer NOT NULL,
	CONSTRAINT "calibration_settings_id_check" CHECK ("calibration_settings"."id" = 1),
	CONSTRAINT "calibration_settings_recruit_share_check" CHECK ("calibration_settings"."recruit_share" between 0 and 1),
	CONSTRAINT "calibration_settings_recruit_share_drop_check" CHECK ("calibration_settings"."recruit_share_drop" between 0 and 1),
	CONSTRAINT "calibration_settings_reference_window_days_check" CHECK ("calibration_settings"."reference_window_days" >= 1),
	CONSTRAINT "calibration_settings_average_recruit_life_check" CHECK ("calibration_settings"."average_recruit_life" > 0 and "calibration_settings"."average_recruit_life" < 'Infinity'::double precision),
	CONSTRAINT "calibration_settings_average_recruit_strength_check" CHECK ("calibration_settings"."average_recruit_strength" > 0 and "calibration_settings"."average_recruit_strength" < 'Infinity'::double precision),
	CONSTRAINT "calibration_settings_average_recruit_magic_check" CHECK ("calibration_settings"."average_recruit_magic" > 0 and "calibration_settings"."average_recruit_magic" < 'Infinity'::double precision),
	CONSTRAINT "calibration_settings_average_recruit_speed_check" CHECK ("calibration_settings"."average_recruit_speed" > 0 and "calibration_settings"."average_recruit_speed" < 'Infinity'::double precision),
	CONSTRAINT "calibration_settings_day_two_budget_recruits_check" CHECK ("calibration_settings"."day_two_budget_recruits" >= 1)
);
