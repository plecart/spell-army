import { describe, expect, test } from "vitest";
import { DockerUnreachable, startTestDatabase } from "./base-de-test.ts";

describe("base de test", () => {
	test("Docker éteint, le démarrage échoue en une ligne qui nomme Docker", async () => {
		const dockerOff = () =>
			Promise.reject(
				new Error("connect ENOENT //./pipe/dockerDesktopLinuxEngine"),
			);
		const error = await startTestDatabase(dockerOff).catch(
			(reason: unknown) => reason,
		);
		expect(error).toBeInstanceOf(DockerUnreachable);
		expect((error as Error).message).toMatch(/^[^\n]*Docker[^\n]*$/);
	});
});
