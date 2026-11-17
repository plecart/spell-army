// Image et réglages de la base de test, qu'un seul fichier porte (issue #9) : un Postgres 18
// jetable dans Docker, la version de Neon. Image Debian, pas alpine : les collations glibc de Neon.
import { randomUUID } from "node:crypto";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { getContainerRuntimeClient } from "testcontainers";
import { createClient } from "../src/client.ts";
import { applyMigrations } from "../src/migrate.ts";

const IMAGE = "postgres:18";

/** Port 9 (discard) : aucune base n'y répond, une requête qui la joindrait échouerait. */
export const UNREACHABLE_DATABASE_URL =
	"postgres://piege:piege@127.0.0.1:9/piege";

/** Docker ne répond pas : la base de test ne peut pas démarrer. */
export class DockerUnreachable extends Error {
	constructor(options?: ErrorOptions) {
		super(
			"Docker est injoignable : démarre Docker Desktop pour lancer les tests de la base (packages/donnees).",
			options,
		);
	}
}

export interface TestDatabase {
	url: string;
	stop(): Promise<void>;
}

/**
 * Démarre la base de test. Joint Docker avant tout conteneur, pour qu'un Docker injoignable lève
 * `DockerUnreachable`, cause jointe, plutôt qu'une erreur de testcontainers.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
	try {
		await getContainerRuntimeClient();
	} catch (cause) {
		throw new DockerUnreachable({ cause });
	}
	const container = await new PostgreSqlContainer(IMAGE).start();
	return {
		url: container.getConnectionUri(),
		stop: async () => {
			await container.stop();
		},
	};
}

/**
 * Crée sur le serveur de `serverUrl` une base au nom unique, y applique les migrations et en rend
 * l'URL : une base migrée neuve par test qui écrit. Sans dépendance au lanceur de tests, pour
 * servir depuis un autre paquet.
 */
export async function createMigratedDatabase(
	serverUrl: string,
): Promise<string> {
	const name = `test_${randomUUID().replaceAll("-", "")}`;
	const server = createClient(serverUrl);
	try {
		await server.execute(sql`create database ${sql.identifier(name)}`);
	} finally {
		await server.$client.end();
	}
	const url = new URL(serverUrl);
	url.pathname = `/${name}`;
	await applyMigrations(url.href);
	return url.href;
}
