import { defineConfig } from "drizzle-kit";

// Lu par `drizzle-kit generate`, qui écrit les migrations SQL dans `migrations/`. Les migrations
// s'appliquent par `src/migrate.ts`, jamais par `drizzle-kit migrate`.
export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema.ts",
	out: "./migrations",
});
