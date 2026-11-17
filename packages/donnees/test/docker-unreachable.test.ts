// Fichier à part : testcontainers garde en cache, pour tout le processus, le premier Docker joint,
// et le pool `forks` de Vitest donne un processus neuf à chaque fichier de test.
import { expect, test, vi } from "vitest";
import { DockerUnreachable, startTestDatabase } from "./base-de-test.ts";

test("Docker injoignable, le démarrage échoue en une ligne qui nomme Docker", async () => {
	// Toute stratégie de testcontainers qui accepte une surcharge résout cet hôte
	// (`resolve-host.js`, `lookup-host-ips.js`), et un nom en `.invalid` ne se résout jamais
	// (RFC 6761) : Docker est injoignable, qu'il tourne ou non. Seule stratégie qui ignore la
	// surcharge : un `tc.host` posé dans `~/.testcontainers.properties`.
	vi.stubEnv("TESTCONTAINERS_HOST_OVERRIDE", "docker.invalid");
	const error = await startTestDatabase().catch((reason: unknown) => reason);
	expect(error).toBeInstanceOf(DockerUnreachable);
	expect(error).toMatchObject({
		message: expect.stringMatching(/^[^\n]*Docker[^\n]*$/),
		cause: expect.any(Error),
	});
});
