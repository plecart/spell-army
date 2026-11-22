CREATE TABLE "monsters" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "monsters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season" integer NOT NULL,
	"chapter" integer NOT NULL,
	"name" text NOT NULL,
	"profile" jsonb NOT NULL,
	"attacks" jsonb NOT NULL,
	"scale_factor" double precision NOT NULL,
	"trait" text NOT NULL,
	CONSTRAINT "monsters_season_check" CHECK ("monsters"."season" >= 1),
	CONSTRAINT "monsters_chapter_check" CHECK ("monsters"."chapter" >= 1),
	CONSTRAINT "monsters_name_check" CHECK ("monsters"."name" ~ '[^[:space:]]' and char_length("monsters"."name") <= 64),
	CONSTRAINT "monsters_trait_check" CHECK ("monsters"."trait" ~ '[^[:space:]]'),
	CONSTRAINT "monsters_scale_factor_check" CHECK ("monsters"."scale_factor" > 0 and "monsters"."scale_factor" < 'Infinity'::double precision)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "monsters_name_unique" ON "monsters" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "monsters_season_chapter_unique" ON "monsters" USING btree ("season","chapter");