import { vi } from "vitest";

/**
 * La config Next.js de l'application. Elle charge le `.env` de la racine à son import : ce
 * chargement est neutralisé, et rien du poste n'entre dans le test.
 */
export async function importNextConfig() {
	vi.spyOn(process, "loadEnvFile").mockImplementation(() => {});
	return (await import("../next.config.ts")).default;
}
