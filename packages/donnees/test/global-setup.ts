import type { TestProject } from "vitest/node";
import { applyMigrations } from "../src/migrate.ts";
import { DockerUnreachable, startTestDatabase } from "./base-de-test.ts";

declare module "vitest" {
	export interface ProvidedContext {
		testDatabaseUrl: string;
	}
}

/**
 * Démarre la base de test, y applique les migrations et en fournit l'URL aux tests par
 * `inject("testDatabaseUrl")`. L'URL vient du conteneur, jamais de l'environnement : un
 * `DATABASE_URL` de pré-prod ou de prod n'atteint aucun test.
 */
export default async function setup(project: Pick<TestProject, "provide">) {
	const database = await startTestDatabase().catch(exitIfDockerUnreachable);
	await applyMigrations(database.url);
	project.provide("testDatabaseUrl", database.url);
	return database.stop;
}

// Levée ici, l'erreur s'imprimerait en pile d'appels derrière un « No test files found » trompeur
// (Vitest 5.1) : Docker éteint, la suite s'arrête sur la seule ligne qui le dit. Toute autre erreur
// garde sa pile.
function exitIfDockerUnreachable(error: unknown): never {
	if (error instanceof DockerUnreachable) {
		console.error(error.message);
		process.exit(1);
	}
	throw error;
}
