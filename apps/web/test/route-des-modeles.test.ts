import { Socket } from "node:net";
import { setClassDefaultModel, storeModelFile } from "donnees";
import {
	createMigratedDatabase,
	UNREACHABLE_DATABASE_URL,
} from "donnees/test/base-de-test";
import { glb } from "personnages/test/glb";
import { describe, expect, inject, onTestFinished, test, vi } from "vitest";
import { CONFORMING } from "./fichiers-3d.ts";

/** La route et le client de la base qu'elle prend, évalués à neuf sur le `DATABASE_URL` du moment. */
async function importRoute() {
	vi.resetModules();
	const { GET } = await import("../app/api/modeles/[classe]/route.ts");
	const { database } = await import("../app/environment.ts");
	return { GET, database };
}

/** `GET /api/modeles/<classe>`. */
function get(
	GET: Awaited<ReturnType<typeof importRoute>>["GET"],
	classe: string,
) {
	return GET(new Request(`http://localhost/api/modeles/${classe}`), {
		params: Promise.resolve({ classe }),
	});
}

describe("route /api/modeles/[classe]", () => {
	test("une classe qui a un modèle par défaut : 200, ses octets en GLB, gardés une heure ; une classe sans modèle : 404", async () => {
		vi.stubEnv(
			"DATABASE_URL",
			await createMigratedDatabase(inject("testDatabaseUrl")),
		);
		const { GET, database } = await importRoute();
		onTestFinished(() => database().$client.end());
		const model = glb(CONFORMING);
		const { id } = await storeModelFile(database(), {
			target: { class: "wizard" },
			content: model,
		});
		await setClassDefaultModel(database(), "wizard", id);

		const response = await get(GET, "wizard");
		expect({
			status: response.status,
			type: response.headers.get("content-type"),
			cache: response.headers.get("cache-control"),
			body: new Uint8Array(await response.arrayBuffer()),
		}).toEqual({
			status: 200,
			type: "model/gltf-binary",
			cache: "public, max-age=3600, s-maxage=3600",
			body: model,
		});
		expect((await get(GET, "golem")).status).toBe(404);
	});

	// La classe est la seule chose lue de la requête, et seule une clé de `CLASS_KEYS` atteint la
	// base : le nom à l'écran, une autre casse, une clé du prototype d'un objet, un nom de fichier.
	test.each(["magicien", "WIZARD", "toString", "wizard.glb"])(
		"%s : 404, sans connexion à la base",
		async (classe) => {
			vi.stubEnv("DATABASE_URL", UNREACHABLE_DATABASE_URL);
			const connect = vi.spyOn(Socket.prototype, "connect");
			const { GET } = await importRoute();
			expect((await get(GET, classe)).status).toBe(404);
			expect(connect).not.toHaveBeenCalled();
		},
	);
});
