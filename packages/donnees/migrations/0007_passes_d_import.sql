CREATE TABLE "import_lock" (
	"id" smallint PRIMARY KEY NOT NULL,
	"holder" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "import_lock_id_check" CHECK ("import_lock"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "import_passes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_passes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"pages" integer DEFAULT 0 NOT NULL,
	"added" integer DEFAULT 0 NOT NULL,
	"invalid_ids" integer DEFAULT 0 NOT NULL,
	"invalid_usernames" integer DEFAULT 0 NOT NULL,
	"error" text,
	"cursor" text,
	CONSTRAINT "import_passes_trigger_check" CHECK (("import_passes"."kind" = 'quick' and "import_passes"."trigger" in ('tick', 'mcp')) or ("import_passes"."kind" = 'full' and "import_passes"."trigger" in ('weekly', 'self_check', 'mcp'))),
	CONSTRAINT "import_passes_status_check" CHECK ("import_passes"."status" in ('running', 'interrupted', 'failed', 'done')),
	CONSTRAINT "import_passes_finished_at_check" CHECK (("import_passes"."finished_at" is null) = ("import_passes"."status" = 'running')),
	CONSTRAINT "import_passes_error_check" CHECK (("import_passes"."error" is not null) = ("import_passes"."status" = 'failed')),
	CONSTRAINT "import_passes_cursor_check" CHECK ("import_passes"."kind" = 'full' or "import_passes"."cursor" is null),
	CONSTRAINT "import_passes_pages_check" CHECK ("import_passes"."pages" >= 0),
	CONSTRAINT "import_passes_added_check" CHECK ("import_passes"."added" >= 0),
	CONSTRAINT "import_passes_invalid_ids_check" CHECK ("import_passes"."invalid_ids" >= 0),
	CONSTRAINT "import_passes_invalid_usernames_check" CHECK ("import_passes"."invalid_usernames" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "import_passes_one_unfinished_full" ON "import_passes" USING btree ("kind") WHERE "import_passes"."kind" = 'full' and "import_passes"."status" <> 'done';