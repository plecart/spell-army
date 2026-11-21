import { readFileSync } from "node:fs";
import { Socket } from "node:net";
import { UNREACHABLE_DATABASE_URL } from "donnees/test/base-de-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTickEndpoint } from "../app/tick.ts";
import { TICK_SECRET, tickRequest } from "./montage.ts";

// Secret factice de 31 octets, un de moins que le minimum admis.
const SHORT_SECRET = "s".repeat(31);

/** La route, évaluée à neuf : son import ne doit lire aucune variable ni ouvrir de connexion. */
async function importRoute() {
	vi.resetModules();
	return import("../app/api/tic/route.ts");
}

describe("tic : refus avant toute base et tout fournisseur", () => {
	// Le dénombrement des refus : l'en-tête absent, un mauvais secret, un secret configuré trop court
	// ou absent. Le contrôle lui-même se dénombre dans `jeton.test.ts`.
	test.each<[string, Record<string, string>, string | undefined]>([
		["sans en-tête", {}, TICK_SECRET],
		[
			"un mauvais secret de même longueur",
			{ authorization: `Bearer ${"u".repeat(32)}` },
			TICK_SECRET,
		],
		[
			"un secret configuré de 31 octets, présenté tel quel",
			{ authorization: `Bearer ${SHORT_SECRET}` },
			SHORT_SECRET,
		],
		["sans secret configuré", { authorization: "Bearer undefined" }, undefined],
	])(
		"%s : 401, WWW-Authenticate: Bearer, corps vide ; ni base ni fournisseur demandés",
		async (_, headers, secret) => {
			const database = vi.fn();
			const provider = vi.fn();
			const response = await createTickEndpoint({
				secret: () => secret,
				database,
				provider,
			})(tickRequest(headers));
			expect(response.status).toBe(401);
			expect(response.headers.get("www-authenticate")).toBe("Bearer");
			expect(await response.text()).toBe("");
			expect(database).not.toHaveBeenCalled();
			expect(provider).not.toHaveBeenCalled();
		},
	);
});

describe("route /api/tic", () => {
	beforeEach(() => {
		vi.stubEnv("CRON_SECRET", undefined);
		vi.stubEnv("DATABASE_URL", UNREACHABLE_DATABASE_URL);
		vi.stubEnv("HIKERAPI_ACCESS_KEY", undefined);
		vi.stubEnv("INSTAGRAM_ACCOUNT_ID", undefined);
	});

	test("exporte POST seul, et une durée maximale de 300 s, sous laquelle le tic court jusqu'à 240 s", async () => {
		const route = await importRoute();
		expect(Object.keys(route).toSorted()).toEqual(["POST", "maxDuration"]);
		expect(route.maxDuration).toBe(300);
	});

	test("sans CRON_SECRET, 401, et ni l'import ni le refus n'ouvrent de connexion", async () => {
		const connect = vi.spyOn(Socket.prototype, "connect");
		const { POST } = await importRoute();
		const response = await POST(tickRequest());
		expect(response.status).toBe(401);
		expect(connect).not.toHaveBeenCalled();
	});

	test("CRON_SECRET se lit à la requête ; admise sans configuration du fournisseur, la requête rend 500 au message fixe, sans joindre la base", async () => {
		const connect = vi.spyOn(Socket.prototype, "connect");
		const serverLog = vi.spyOn(console, "error").mockReturnValue();
		const { POST } = await importRoute();
		vi.stubEnv("CRON_SECRET", TICK_SECRET);
		const response = await POST(tickRequest());
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			message: "configuration de l'import incomplète",
		});
		expect(connect).not.toHaveBeenCalled();
		expect(serverLog).toHaveBeenCalledOnce();
	});

	test("chaque variable que lit le tic est nommée dans .env.example, sans valeur", () => {
		const lines = readFileSync(
			new URL("../../../.env.example", import.meta.url),
			"utf8",
		).split(/\r?\n/);
		for (const name of [
			"CRON_SECRET",
			"DATABASE_URL",
			"HIKERAPI_ACCESS_KEY",
			"INSTAGRAM_ACCOUNT_ID",
		]) {
			expect(lines).toContain(`${name}=`);
		}
	});
});
