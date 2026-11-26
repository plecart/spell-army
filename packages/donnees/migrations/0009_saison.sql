CREATE TABLE "combats" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "combats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"fought_on" date NOT NULL,
	"season" integer NOT NULL,
	"chapter" integer NOT NULL,
	"day" integer NOT NULL,
	"attempt" integer NOT NULL,
	"monster_id" integer NOT NULL,
	"outcome" text NOT NULL,
	"log" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combats_season_check" CHECK ("combats"."season" >= 1),
	CONSTRAINT "combats_chapter_check" CHECK ("combats"."chapter" >= 1),
	CONSTRAINT "combats_day_check" CHECK ("combats"."day" >= 1),
	CONSTRAINT "combats_attempt_check" CHECK ("combats"."attempt" >= 1),
	CONSTRAINT "combats_outcome_check" CHECK ("combats"."outcome" in ('victory', 'defeat', 'exhaustion'))
);
--> statement-breakpoint
CREATE TABLE "next_combat_forced" (
	"rank" integer PRIMARY KEY NOT NULL,
	"instagram_id" text NOT NULL,
	"position" text NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "next_combat_forced_rank_check" CHECK ("next_combat_forced"."rank" >= 1),
	CONSTRAINT "next_combat_forced_instagram_id_check" CHECK ("next_combat_forced"."instagram_id" ~ '^[1-9][0-9]{0,19}$'),
	CONSTRAINT "next_combat_forced_position_check" CHECK ("next_combat_forced"."position" in ('first', 'last', 'middle')),
	CONSTRAINT "next_combat_forced_reason_check" CHECK ("next_combat_forced"."reason" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "season_state" (
	"id" smallint PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"chapter" integer NOT NULL,
	"attempt" integer NOT NULL,
	"combats_played" integer NOT NULL,
	"defeat_streak" integer NOT NULL,
	"budget" jsonb,
	"last_outcome" text,
	"end_day" integer,
	CONSTRAINT "season_state_id_check" CHECK ("season_state"."id" = 1),
	CONSTRAINT "season_state_season_check" CHECK ("season_state"."season" >= 1),
	CONSTRAINT "season_state_chapter_check" CHECK ("season_state"."chapter" >= 1),
	CONSTRAINT "season_state_attempt_check" CHECK ("season_state"."attempt" >= 1),
	CONSTRAINT "season_state_end_day_check" CHECK ("season_state"."end_day" >= 1),
	CONSTRAINT "season_state_combats_played_check" CHECK ("season_state"."combats_played" >= 0),
	CONSTRAINT "season_state_defeat_streak_check" CHECK ("season_state"."defeat_streak" >= 0),
	CONSTRAINT "season_state_last_outcome_check" CHECK ("season_state"."last_outcome" in ('victory', 'defeat', 'exhaustion'))
);
--> statement-breakpoint
ALTER TABLE "combats" ADD CONSTRAINT "combats_monster_id_monsters_id_fk" FOREIGN KEY ("monster_id") REFERENCES "public"."monsters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "combats_fought_on_unique" ON "combats" USING btree ("fought_on");--> statement-breakpoint
CREATE UNIQUE INDEX "combats_season_day_unique" ON "combats" USING btree ("season","day");--> statement-breakpoint
CREATE UNIQUE INDEX "next_combat_forced_instagram_id_unique" ON "next_combat_forced" USING btree ("instagram_id");--> statement-breakpoint
-- La ligne de l'état de la saison, au début de la saison 1 : chapitre 1, tentative 1, aucun combat
-- joué (issue #21 ; SEASON_START de packages/combat/src/season.ts).
INSERT INTO "season_state" (
	"id",
	"season",
	"chapter",
	"attempt",
	"combats_played",
	"defeat_streak"
) VALUES (1, 1, 1, 1, 0, 0);
