import { configDefaults, defineConfig } from "vitest/config";

/**
 * La config Vitest d'un paquet dont les tests joignent la base de test, par le `globalSetup` de son
 * `test/global-setup.ts`. Les fichiers de `withoutDatabase` ne joignent aucune base : un projet sans
 * `globalSetup` les fait tourner sans le Postgres jetable, donc sans Docker. Vitest ne lance le
 * `globalSetup` d'un projet que si l'un de ses tests est sélectionné. Un fichier absent de la liste
 * tourne avec la base.
 */
export function databaseTestConfig(withoutDatabase: string[]) {
	return defineConfig({
		test: {
			// Chaque test repart de l'environnement et des méthodes d'origine (`vi.stubEnv`, `vi.spyOn`).
			unstubEnvs: true,
			restoreMocks: true,
			projects: [
				{
					test: {
						name: "database",
						exclude: [...configDefaults.exclude, ...withoutDatabase],
						globalSetup: "./test/global-setup.ts",
					},
				},
				{ test: { name: "no-database", include: withoutDatabase } },
			],
		},
	});
}
