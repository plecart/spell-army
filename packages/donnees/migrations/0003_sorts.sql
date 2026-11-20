CREATE TABLE "spells" (
	"number" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"recipe" jsonb NOT NULL,
	"form" jsonb NOT NULL,
	"effect" jsonb NOT NULL,
	"key" text NOT NULL,
	"weight" double precision NOT NULL,
	"description" text NOT NULL,
	"image" "bytea",
	"image_type" text,
	CONSTRAINT "spells_weight_check" CHECK ("spells"."weight" >= 0 and "spells"."weight" < 'Infinity'::double precision),
	CONSTRAINT "spells_description_check" CHECK ("spells"."description" ~ '[^[:space:]]'),
	CONSTRAINT "spells_image_check" CHECK (("spells"."image" is null) = ("spells"."image_type" is null)),
	CONSTRAINT "spells_image_type_check" CHECK ("spells"."image_type" in ('image/png', 'image/jpeg', 'image/webp'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "spells_key_unique" ON "spells" USING btree ("key");