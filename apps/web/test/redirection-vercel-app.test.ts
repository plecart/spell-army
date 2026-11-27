import { describe, expect, test, vi } from "vitest";
import { importNextConfig } from "./config-next.ts";

/** Les redirections que la config rend au build, sous les variables système de Vercel données. */
async function redirectsAt(
	vercelEnv: string | undefined,
	productionUrl: string | undefined,
) {
	vi.stubEnv("VERCEL_ENV", vercelEnv);
	vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", productionUrl);
	const nextConfig = await importNextConfig();
	return nextConfig.redirects?.();
}

describe("redirection de l'adresse .vercel.app", () => {
	test("au build de production, tout hôte .vercel.app est redirigé en 308 vers le domaine de production, chemin gardé", async () => {
		expect(await redirectsAt("production", "beta.spellarmy.com")).toEqual([
			{
				source: "/:path*",
				has: [{ type: "host", value: ".*\\.vercel\\.app" }],
				destination: "https://beta.spellarmy.com/:path*",
				permanent: true,
			},
		]);
	});

	test.each<[string, string | undefined, string | undefined]>([
		["une prévisualisation", "preview", "beta.spellarmy.com"],
		["un build local", undefined, "beta.spellarmy.com"],
		["la production sans domaine de production", "production", undefined],
		["la production au domaine de production vide", "production", ""],
		[
			"la production dont le domaine est lui-même en .vercel.app, où la redirection bouclerait",
			"production",
			"spell-army.vercel.app",
		],
	])("aucune redirection pour %s", async (_, vercelEnv, productionUrl) => {
		expect(await redirectsAt(vercelEnv, productionUrl)).toEqual([]);
	});
});
