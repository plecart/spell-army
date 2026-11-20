CREATE TABLE "class_default_models" (
	"class" text PRIMARY KEY NOT NULL,
	"model_file_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "model_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"class" text,
	"monster" text,
	"content" "bytea" NOT NULL,
	"size" integer GENERATED ALWAYS AS (octet_length("model_files"."content")) STORED NOT NULL,
	"sha256" text GENERATED ALWAYS AS (encode(sha256("model_files"."content"), 'hex')) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_files_owner_check" CHECK (("model_files"."class" is null) <> ("model_files"."monster" is null))
);
--> statement-breakpoint
ALTER TABLE "class_default_models" ADD CONSTRAINT "class_default_models_model_file_id_model_files_id_fk" FOREIGN KEY ("model_file_id") REFERENCES "public"."model_files"("id") ON DELETE no action ON UPDATE no action;