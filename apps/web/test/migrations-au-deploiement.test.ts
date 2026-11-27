import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { migrateOnProductionOrPreprodDeploy } from "../scripts/migration-prod-et-preprod.ts";
import { runScript } from "./commande.ts";

// La commande `migration` du projet, que lisent les skills de la pipeline.
const MIGRATION_COMMAND = readFileSync(
	new URL("../../../.claude/pipeline.config.md", import.meta.url),
	"utf8",
).match(/^- migration +: `([^`]+)`/m)?.[1];

// Le script `build` d'`apps/web`.
const BUILD_SCRIPT = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).scripts.build;

describe("migrations au déploiement", () => {
	test("le build migre après next build : un build en échec ne laisse aucune base migrée sous l'ancien déploiement", () => {
		expect(BUILD_SCRIPT).toBe(
			"next build && node scripts/migrer-prod-et-preprod.ts",
		);
	});

	test.each<[string, string, string | undefined]>([
		["un déploiement de production", "production", undefined],
		["la prévisualisation de main, la pré-prod", "preview", "main"],
	])(
		"%s lance une fois la commande migration du projet",
		(_, vercelEnv, ref) => {
			const run = vi.fn<(command: string, args: string[]) => void>();
			expect(
				migrateOnProductionOrPreprodDeploy(
					{ VERCEL_ENV: vercelEnv, VERCEL_GIT_COMMIT_REF: ref },
					run,
				),
			).toBe(true);
			expect(run.mock.calls).toEqual([
				["pnpm", ["--filter", "donnees", "run", "migrate"]],
			]);
			expect(
				run.mock.calls.map(([command, args]) => [command, ...args].join(" ")),
			).toEqual([MIGRATION_COMMAND]);
		},
	);

	test.each<[string, string | undefined, string | undefined]>([
		["la prévisualisation d'une autre branche que main", "preview", "fix/x"],
		["une prévisualisation sans branche", "preview", undefined],
		["vercel dev", "development", "main"],
		["un build hors de Vercel, la CI comprise", undefined, "main"],
	])("%s ne migre rien", (_, vercelEnv, ref) => {
		const run = vi.fn();
		expect(
			migrateOnProductionOrPreprodDeploy(
				{ VERCEL_ENV: vercelEnv, VERCEL_GIT_COMMIT_REF: ref },
				run,
			),
		).toBe(false);
		expect(run).not.toHaveBeenCalled();
	});

	test("l'étape de migration du build, hors de Vercel, ne migre rien et le dit", async () => {
		expect(
			await runScript("migrer-prod-et-preprod.ts", [], {
				VERCEL_ENV: undefined,
			}),
		).toEqual({
			code: 0,
			stdout:
				"Migrations : aucune, hors d'un déploiement de la prod ou de la pré-prod.\n",
			stderr: "",
		});
	});
});
