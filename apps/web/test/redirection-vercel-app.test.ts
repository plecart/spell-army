import type { IncomingMessage } from "node:http";
import { format } from "node:url";
import { getRedirectStatus } from "next/dist/lib/redirect-status";
import { buildCustomRoute } from "next/dist/server/lib/router-utils/filesystem";
import {
	matchHas,
	prepareDestination,
} from "next/dist/shared/lib/router/utils/prepare-destination";
import { describe, expect, test, vi } from "vitest";
import { importNextConfig } from "./config-next.ts";

// L'adresse `.vercel.app` de production, et le domaine de production vers lequel elle redirige.
const VERCEL_APP_HOST = "spell-army.vercel.app";
const PRODUCTION_DOMAIN = "beta.spellarmy.com";

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

/**
 * La redirection que reçoit, au build de production, une requête `pathname` sur l'hôte `host` :
 * son statut et son adresse, ou `null`. Les redirections passent par le matcher du serveur de
 * Next.js, comme `server/lib/router-utils/resolve-routes.js` les applique — `buildCustomRoute`,
 * `matchHas`, `prepareDestination` —, puis l'adresse s'écrit par `url.format`, comme
 * `router-server.js`, et se normalise par `URL` : c'est le comportement de la `source` qu'on
 * éprouve, pas sa chaîne. Ces modules internes de Next peuvent bouger à une montée de version :
 * le test rougit alors sans que la redirection ait changé ; rebrancher sur les nouveaux chemins.
 */
async function redirectionOf(host: string, pathname: string) {
	const redirects = (await redirectsAt("production", PRODUCTION_DOMAIN)) ?? [];
	for (const redirect of redirects) {
		const route = buildCustomRoute("redirect", redirect);
		const params = route.match(pathname);
		const hostParams =
			params &&
			matchHas(
				{ headers: { host } } as IncomingMessage,
				{},
				route.has,
				route.missing,
			);
		if (hostParams) {
			const { parsedDestination } = prepareDestination({
				appendParamsToQuery: false,
				destination: route.destination,
				params: { ...params, ...hostParams },
				query: {},
			});
			return {
				status: getRedirectStatus(route),
				location: new URL(format(parsedDestination)).href,
			};
		}
	}
	return null;
}

describe("redirection de l'adresse .vercel.app", () => {
	test.each([
		["/", `https://${PRODUCTION_DOMAIN}/`],
		["/x", `https://${PRODUCTION_DOMAIN}/x`],
		["/recrues/abc", `https://${PRODUCTION_DOMAIN}/recrues/abc`],
	])(
		"au build de production, %s sur l'hôte .vercel.app est redirigé en 308 vers le domaine de production, chemin gardé",
		async (pathname, location) => {
			expect(await redirectionOf(VERCEL_APP_HOST, pathname)).toEqual({
				status: 308,
				location,
			});
		},
	);

	test.each(["/api/tic", "/api/tic/", "/api/tic/x"])(
		"au build de production, la route du tic n'est pas redirigée sur l'hôte .vercel.app, où Vercel Schedules peut l'appeler : %s",
		async (pathname) => {
			expect(await redirectionOf(VERCEL_APP_HOST, pathname)).toBeNull();
		},
	);

	test("au build de production, le domaine de production n'est pas redirigé", async () => {
		expect(await redirectionOf(PRODUCTION_DOMAIN, "/x")).toBeNull();
	});

	test.each<[string, string | undefined, string | undefined]>([
		["une prévisualisation", "preview", PRODUCTION_DOMAIN],
		["un build local", undefined, PRODUCTION_DOMAIN],
		["la production sans domaine de production", "production", undefined],
		["la production au domaine de production vide", "production", ""],
		[
			"la production dont le domaine est lui-même en .vercel.app, où la redirection bouclerait",
			"production",
			VERCEL_APP_HOST,
		],
	])("aucune redirection pour %s", async (_, vercelEnv, productionUrl) => {
		expect(await redirectsAt(vercelEnv, productionUrl)).toEqual([]);
	});
});
