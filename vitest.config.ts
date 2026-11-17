import { defineConfig } from "vitest/config";

// Chaque dossier de `packages/` est un projet Vitest, réglé par sa propre config : la racine ne
// lance aucun test, elle permet `pnpm vitest run <chemin>` depuis la racine du dépôt.
export default defineConfig({
	test: {
		projects: ["packages/*"],
	},
});
