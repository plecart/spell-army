import { configDefaults, defineConfig } from "vitest/config";

// Fichiers de test qui ne joignent aucune base : un projet sans `globalSetup` les fait tourner sans
// le Postgres jetable, donc sans Docker. Vitest ne lance le `globalSetup` d'un projet que si l'un
// de ses tests est sélectionné. Un fichier absent de la liste tourne avec la base.
const WITHOUT_DATABASE = ["test/jeton.test.ts", "test/route.test.ts"];

export default defineConfig({
	test: {
		// Chaque test repart de l'environnement et des méthodes d'origine (`vi.stubEnv`, `vi.spyOn`).
		unstubEnvs: true,
		restoreMocks: true,
		projects: [
			{
				test: {
					name: "database",
					exclude: [...configDefaults.exclude, ...WITHOUT_DATABASE],
					globalSetup: "./test/global-setup.ts",
				},
			},
			{ test: { name: "no-database", include: WITHOUT_DATABASE } },
		],
	},
});
