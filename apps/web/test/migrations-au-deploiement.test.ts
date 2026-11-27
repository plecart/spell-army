import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { migrateOnProductionDeploy } from "../scripts/migration-de-production.ts";
import { runScript } from "./commande.ts";

// La commande `migration` du projet, que lisent les skills de la pipeline.
const MIGRATION_COMMAND = readFileSync(
	new URL("../../../.claude/pipeline.config.md", import.meta.url),
	"utf8",
).match(/^- migration +: `([^`]+)`/m)?.[1];

describe("migrations au déploiement", () => {
	test("un déploiement de production lance une fois la commande migration du projet", () => {
		const run = vi.fn<(command: string, args: string[]) => void>();
		expect(migrateOnProductionDeploy({ VERCEL_ENV: "production" }, run)).toBe(
			true,
		);
		expect(run.mock.calls).toEqual([
			["pnpm", ["--filter", "donnees", "run", "migrate"]],
		]);
		expect(
			run.mock.calls.map(([command, args]) => [command, ...args].join(" ")),
		).toEqual([MIGRATION_COMMAND]);
	});

	test.each([
		["une prévisualisation", "preview"],
		["vercel dev", "development"],
		["un build hors de Vercel, la CI comprise", undefined],
	])("%s ne migre rien", (_, vercelEnv) => {
		const run = vi.fn();
		expect(migrateOnProductionDeploy({ VERCEL_ENV: vercelEnv }, run)).toBe(
			false,
		);
		expect(run).not.toHaveBeenCalled();
	});

	test("la commande du build, hors de Vercel, ne migre rien et le dit", async () => {
		expect(
			await runScript("migrer-en-production.ts", [], { VERCEL_ENV: undefined }),
		).toEqual({
			code: 0,
			stdout: "Migrations : aucune, hors d'un déploiement de production.\n",
			stderr: "",
		});
	});
});
