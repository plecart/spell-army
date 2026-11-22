import { describe, expect, test, vi } from "vitest";

// La fraîcheur du CDN : 30 min fraîche, puis 30 min servie périmée pendant qu'il la revalide.
const CDN_CACHE = {
	key: "Vercel-CDN-Cache-Control",
	value: "max-age=1800, stale-while-revalidate=1800",
};

describe("cache du CDN", () => {
	test("l'annuaire, « Informations » et la fiche d'une recrue sont servis par le CDN de Vercel, aucune réponse n'y passant plus d'une heure", async () => {
		// La config charge le `.env` de la racine à son import : rien du poste n'entre dans le test.
		vi.spyOn(process, "loadEnvFile").mockImplementation(() => {});
		const { default: nextConfig } = await import("../next.config.ts");
		expect(await nextConfig.headers?.()).toEqual([
			{ source: "/", headers: [CDN_CACHE] },
			{ source: "/informations", headers: [CDN_CACHE] },
			{ source: "/recrues/:identifiant", headers: [CDN_CACHE] },
		]);
	});
});
