import { databaseTestConfig } from "donnees/test/vitest-config";

// Les fichiers de test qui ne joignent aucune base.
export default databaseTestConfig([
	"test/aucune-requete-libre.test.ts",
	"test/image.test.ts",
	"test/jeton.test.ts",
	"test/route.test.ts",
]);
