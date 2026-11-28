import { describe, expect, test, vi } from "vitest";
import { importNextConfig } from "./config-next.ts";

// La CSP sans jeton d'ADR 0004 (« Protections Vercel », ligne « En-têtes »), hors développement.
const CSP =
	"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/** Les en-têtes que la config pose sur toutes les pages, `/` compris, sous `NODE_ENV` = `nodeEnv`. */
async function securityHeaders(nodeEnv: string) {
	vi.stubEnv("NODE_ENV", nodeEnv);
	const nextConfig = await importNextConfig();
	const everyPage = (await nextConfig.headers?.())?.find(
		({ source }) => source === "/:path*",
	);
	return new Map(everyPage?.headers.map(({ key, value }) => [key, value]));
}

describe("en-têtes de sécurité", () => {
	test("hors développement, la CSP est exactement celle d'ADR 0004, sans 'unsafe-eval'", async () => {
		expect(
			(await securityHeaders("production")).get("Content-Security-Policy"),
		).toBe(CSP);
	});

	test("en développement, 'unsafe-eval' s'ajoute aux scripts, et à eux seuls", async () => {
		expect(
			(await securityHeaders("development")).get("Content-Security-Policy"),
		).toBe(
			CSP.replace(
				"script-src 'self' 'unsafe-inline'",
				"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
			),
		);
	});

	test("HSTS de deux ans sur les sous-domaines sans preload, nosniff, Referrer-Policy et Permissions-Policy", async () => {
		const headers = await securityHeaders("production");
		expect(Object.fromEntries(headers)).toEqual({
			"Strict-Transport-Security": "max-age=63072000; includeSubDomains",
			"Content-Security-Policy": CSP,
			"X-Content-Type-Options": "nosniff",
			"Referrer-Policy": "strict-origin-when-cross-origin",
			"Permissions-Policy":
				"camera=(), microphone=(), geolocation=(), browsing-topics=()",
		});
	});
});
