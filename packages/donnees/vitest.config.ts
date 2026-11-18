import { databaseTestConfig } from "./test/vitest-config.ts";

// Les fichiers de test qui ne joignent aucune base.
export default databaseTestConfig([
	"test/docker-unreachable.test.ts",
	"test/exception-audit.test.ts",
	"test/migrate-command.test.ts",
	"test/version-node.test.ts",
]);
