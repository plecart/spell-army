import { databaseTestConfig } from "donnees/test/vitest-config";

// Les fichiers de test qui ne joignent aucune base.
export default databaseTestConfig([
	"test/annuaire-adresse.test.ts",
	"test/annuaire-ecran.test.ts",
	"test/annuaire-seule-voie.test.ts",
	"test/annuaire-variables.test.tsx",
	"test/aucune-requete-libre.test.ts",
	"test/cache-du-cdn.test.ts",
	"test/image.test.ts",
	"test/informations.test.tsx",
	"test/jeton.test.ts",
	"test/route-du-tic.test.ts",
	"test/route.test.ts",
	"test/vignettes.test.ts",
	"test/wiki-dossier.test.ts",
	"test/wiki-generation.test.ts",
	"test/wiki-pages.test.ts",
	"test/wiki-transcription.test.ts",
]);
