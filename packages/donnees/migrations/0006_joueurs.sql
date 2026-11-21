CREATE TABLE "excluded_players" (
	"instagram_id" text PRIMARY KEY NOT NULL,
	CONSTRAINT "excluded_players_instagram_id_check" CHECK ("excluded_players"."instagram_id" ~ '^[1-9][0-9]*$')
);
--> statement-breakpoint
CREATE TABLE "players" (
	"instagram_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"arrived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"spell_number" integer NOT NULL,
	"model_file_id" integer,
	CONSTRAINT "players_instagram_id_check" CHECK ("players"."instagram_id" ~ '^[1-9][0-9]*$'),
	CONSTRAINT "players_username_check" CHECK ("players"."username" ~ '^[A-Za-z0-9._]{1,30}$')
);
--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_spell_number_spells_number_fk" FOREIGN KEY ("spell_number") REFERENCES "public"."spells"("number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_model_file_id_model_files_id_fk" FOREIGN KEY ("model_file_id") REFERENCES "public"."model_files"("id") ON DELETE no action ON UPDATE no action;