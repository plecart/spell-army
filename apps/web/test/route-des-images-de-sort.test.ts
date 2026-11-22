import { Socket } from "node:net";
import { updateSpell } from "donnees";
import {
	createMigratedDatabase,
	UNREACHABLE_DATABASE_URL,
} from "donnees/test/base-de-test";
import { describe, expect, inject, onTestFinished, test, vi } from "vitest";

/** La route et le client de la base qu'elle prend, évalués à neuf sur le `DATABASE_URL` du moment. */
async function importRoute() {
	vi.resetModules();
	const { GET } = await import("../app/api/sorts/[numero]/image/route.ts");
	const { database } = await import("../app/environment.ts");
	return { GET, database };
}

/** `GET /api/sorts/<numero>/image`. */
function get(
	GET: Awaited<ReturnType<typeof importRoute>>["GET"],
	numero: string,
) {
	return GET(new Request(`http://localhost/api/sorts/${numero}/image`), {
		params: Promise.resolve({ numero }),
	});
}

// Une image WebP, pas PNG : le type rendu est celui que porte le sort, pas un défaut de la route.
const IMAGE = { bytes: new TextEncoder().encode("abc"), type: "image/webp" };

describe("route /api/sorts/[numero]/image", () => {
	test("un sort qui a une image : 200, ses octets sous son type, gardés une heure ; un sort sans image ou absent : 404", async () => {
		vi.stubEnv(
			"DATABASE_URL",
			await createMigratedDatabase(inject("testDatabaseUrl")),
		);
		const { GET, database } = await importRoute();
		onTestFinished(() => database().$client.end());
		await updateSpell(database(), 3, { image: IMAGE });

		const response = await get(GET, "3");
		expect({
			status: response.status,
			type: response.headers.get("content-type"),
			cache: response.headers.get("cache-control"),
			body: new Uint8Array(await response.arrayBuffer()),
		}).toEqual({
			status: 200,
			type: IMAGE.type,
			cache: "public, max-age=3600, s-maxage=3600",
			body: IMAGE.bytes,
		});
		expect((await get(GET, "4")).status).toBe(404);
		expect((await get(GET, "999")).status).toBe(404);
	});

	// Le numéro est la seule chose lue de la requête, et seul un entier de 1 à 9 chiffres sans zéro
	// de tête atteint la base : zéro, un mot, un décimal, une clé du prototype d'un objet, une
	// notation exponentielle, un nombre au-delà d'un `integer` de Postgres.
	test.each(["0", "abc", "3.5", "toString", "1e3", "2147483648"])(
		"%s : 404, sans connexion à la base",
		async (numero) => {
			vi.stubEnv("DATABASE_URL", UNREACHABLE_DATABASE_URL);
			const connect = vi.spyOn(Socket.prototype, "connect");
			const { GET } = await importRoute();
			expect((await get(GET, numero)).status).toBe(404);
			expect(connect).not.toHaveBeenCalled();
		},
	);
});
