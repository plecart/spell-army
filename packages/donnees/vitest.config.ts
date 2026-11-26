import { databaseTestConfig } from "./test/vitest-config.ts";

// Les fichiers de test qui ne joignent aucune base.
export default databaseTestConfig([
	"test/derive-du-schema.test.ts",
	"test/docker-unreachable.test.ts",
	"test/env-des-scripts.test.ts",
	"test/exception-audit.test.ts",
	"test/fermeture-du-pool.test.ts",
	"test/migrate-command.test.ts",
	"test/refus-dependabot.test.ts",
	"test/sources-du-wiki.test.ts",
	"test/surcharges-pnpm.test.ts",
	"test/version-node.test.ts",
]);
