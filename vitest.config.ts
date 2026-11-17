import { defineConfig } from "vitest/config";

// Chaque dossier de `packages/` apporte ses projets Vitest, réglés par sa propre config : la racine
// ne lance aucun test, elle permet `pnpm vitest run <chemin>` depuis la racine du dépôt.
export default defineConfig({
	test: {
		projects: ["packages/*"],
	},
});
