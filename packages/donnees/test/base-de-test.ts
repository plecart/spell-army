// Image et réglages de la base de test, qu'un seul fichier porte (issue #9) : un Postgres 18
// jetable dans Docker, la version de Neon. Image Debian, pas alpine : les collations glibc de Neon.
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { getContainerRuntimeClient } from "testcontainers";

const IMAGE = "postgres:18";

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
