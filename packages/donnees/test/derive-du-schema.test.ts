import { describe, expect, test } from "vitest";
import { type GenerateRun, schemaDriftFailure } from "../src/schema-drift.ts";

// Extrait de ce que `drizzle-kit generate` 0.31.11 écrit sur un schéma sans changement (mesuré le
// 2026-11-20).
const FINISHED: GenerateRun = {
	status: 0,
	timedOut: false,
	stdout: `No config path provided, using default 'drizzle.config.ts'
2 tables
No schema changes, nothing to migrate 😴
`,
	stderr: "",
};
const NEW_MIGRATION = "?? packages/donnees/migrations/0003_brave_wolf.sql";

describe("porte contre la dérive du schéma", () => {
	test("drizzle-kit affirme l'absence de changement, migrations propre : la porte passe", () => {
		expect(schemaDriftFailure(FINISHED, "")).toBeUndefined();
	});

	test("drizzle-kit a écrit une migration : la porte échoue et nomme chaque fichier", () => {
		const porcelain = [
			NEW_MIGRATION,
			" M packages/donnees/migrations/meta/_journal.json",
			"?? packages/donnees/migrations/meta/0003_snapshot.json",
		].join("\n");
		const failure = schemaDriftFailure(FINISHED, `${porcelain}\n`);
		expect(failure).toMatch(/^schema\.ts a dérivé des migrations/);
		expect(failure).toContain(porcelain);
	});

	// Sur un renommage, drizzle-kit pose une question ; sans terminal, il écrit l'erreur, n'écrit
	// aucune migration et sort en 0 (mesuré le 2026-11-20, 0.31.11).
	test("drizzle-kit sort en 0 sans affirmer l'absence de changement : la porte échoue sur sa sortie", () => {
		const stderr =
			"Error: Interactive prompts require a TTY terminal (process.stdin.isTTY or process.stdout.isTTY is false).";
		const failure = schemaDriftFailure(
			{
				...FINISHED,
				stdout: "Reading config file 'drizzle.config.ts'\n",
				stderr,
			},
			"",
		);
		expect(failure).toMatch(
			/^drizzle-kit generate n'a pas affirmé l'absence de changement/,
		);
		expect(failure).toContain(stderr);
	});

	test("drizzle-kit dépasse son délai : la porte échoue sur le délai, même s'il a déjà écrit", () => {
		const failure = schemaDriftFailure(
			{ status: null, timedOut: true, stdout: "", stderr: "" },
			`${NEW_MIGRATION}\n`,
		);
		expect(failure).toMatch(/^drizzle-kit generate n'a pas fini en 60 s/);
	});

	test("drizzle-kit sort en erreur : la porte échoue sur son code et sa sortie", () => {
		const failure = schemaDriftFailure(
			{ ...FINISHED, status: 1, stderr: "config illisible" },
			"",
		);
		expect(failure).toMatch(/^drizzle-kit generate a échoué \(code 1\)/);
		expect(failure).toContain("config illisible");
	});
});
