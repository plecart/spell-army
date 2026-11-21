import { databaseTestConfig } from "donnees/test/vitest-config";

// Les fichiers de test qui ne joignent aucune base.
export default databaseTestConfig(["test/entrees.test.ts"]);
