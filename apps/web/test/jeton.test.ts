import { timingSafeEqual } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { isAuthorized } from "../app/mcp/token.ts";

// `timingSafeEqual` garde son comportement d'origine ; le test lit ce qu'il reçoit.
vi.mock(import("node:crypto"), async (importOriginal) => {
	const crypto = await importOriginal();
	return { ...crypto, timingSafeEqual: vi.fn(crypto.timingSafeEqual) };
});

// Jetons factices : 32 octets UTF-8, le minimum admis, en ASCII puis en caractères de 2 octets.
const TOKEN = "t".repeat(32);
const MULTIBYTE_TOKEN = "é".repeat(16);

describe("jeton du serveur MCP", () => {
	test.each<[string, string | null, string | undefined]>([
		["en-tête absent", null, TOKEN],
		["en-tête vide", "", TOKEN],
		["autre schéma", `Basic ${TOKEN}`, TOKEN],
		["Bearer sans jeton", "Bearer", TOKEN],
		["Bearer et une espace, sans jeton", "Bearer ", TOKEN],
		["mauvais jeton de même longueur", `Bearer ${"u".repeat(32)}`, TOKEN],
		["bon jeton suivi d'un caractère", `Bearer ${TOKEN}u`, TOKEN],
		["préfixe du bon jeton", `Bearer ${"t".repeat(31)}`, TOKEN],
		["jeton configuré absent", "Bearer undefined", undefined],
		["jeton configuré vide", "Bearer ", ""],
		[
			"jeton configuré de 31 octets",
			`Bearer ${"t".repeat(31)}`,
			"t".repeat(31),
		],
		[
			"jeton configuré de 31 octets, dont des caractères de 2 octets",
			`Bearer ${"é".repeat(15)}t`,
			`${"é".repeat(15)}t`,
		],
	])("refus : %s", (_, authorization, configuredToken) => {
		expect(isAuthorized(authorization, configuredToken)).toBe(false);
	});

	test.each([
		["en ASCII", TOKEN],
		["en caractères de 2 octets", MULTIBYTE_TOKEN],
	])("le bon jeton de 32 octets %s est admis", (_, token) => {
		expect(isAuthorized(`Bearer ${token}`, token)).toBe(true);
	});

	test.each([
		["un mauvais jeton de même longueur", "u".repeat(32)],
		["un mauvais jeton d'une autre longueur", "u".repeat(100)],
		["le bon jeton", TOKEN],
	])(
		"comparaison à temps constant de deux empreintes de 32 octets pour %s",
		(_, token) => {
			const comparison = vi.mocked(timingSafeEqual);
			comparison.mockClear();
			isAuthorized(`Bearer ${token}`, TOKEN);
			const lengths = comparison.mock.calls.map((buffers) =>
				buffers.map((buffer) => buffer.byteLength),
			);
			expect(lengths).toEqual([[32, 32]]);
		},
	);
});
