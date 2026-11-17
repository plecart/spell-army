// Fichier à part : testcontainers garde en cache, pour tout le processus, le premier Docker joint,
// et le pool `forks` de Vitest donne un processus neuf à chaque fichier de test.
import { beforeEach, expect, test, vi } from "vitest";
import { DockerUnreachable, startTestDatabase } from "./base-de-test.ts";
import setup, { exitIfDockerUnreachable } from "./global-setup.ts";

const ONE_LINE_NAMING_DOCKER = /^[^\n]*Docker[^\n]*$/;
// Levée par le `process.exit` intercepté : comme le vrai, elle arrête le code qui l'appelle.
const EXITED = new Error("process.exit");

beforeEach(() => {
	// Toute stratégie de testcontainers qui accepte une surcharge résout cet hôte
	// (`resolve-host.js`, `lookup-host-ips.js`), et un nom en `.invalid` ne se résout jamais
	// (RFC 6761) : Docker est injoignable, qu'il tourne ou non. Seule stratégie qui ignore la
	// surcharge : un `tc.host` posé dans `~/.testcontainers.properties`.
	vi.stubEnv("TESTCONTAINERS_HOST_OVERRIDE", "docker.invalid");
});

function interceptExit() {
	return {
		exit: vi.spyOn(process, "exit").mockImplementation(() => {
			throw EXITED;
		}),
		stderr: vi.spyOn(console, "error").mockImplementation(() => {}),
	};
}

test("Docker injoignable, le démarrage échoue en une ligne qui nomme Docker", async () => {
	const error = await startTestDatabase().catch((reason: unknown) => reason);
	expect(error).toBeInstanceOf(DockerUnreachable);
	expect(error).toMatchObject({
		message: expect.stringMatching(ONE_LINE_NAMING_DOCKER),
		cause: expect.any(Error),
	});
});

test("Docker injoignable, le harnais sort en 1 après une seule ligne qui nomme Docker", async () => {
	const { exit, stderr } = interceptExit();
	await expect(setup({ provide: () => {} })).rejects.toBe(EXITED);
	expect(stderr).toHaveBeenCalledExactlyOnceWith(
		expect.stringMatching(ONE_LINE_NAMING_DOCKER),
	);
	expect(exit).toHaveBeenCalledExactlyOnceWith(1);
});

test("toute autre erreur au démarrage de la base est relancée telle quelle, pile comprise", async () => {
	const { exit, stderr } = interceptExit();
	const other = new Error("autre panne");
	await expect(
		Promise.reject(other).catch(exitIfDockerUnreachable),
	).rejects.toBe(other);
	expect(stderr).not.toHaveBeenCalled();
	expect(exit).not.toHaveBeenCalled();
});
