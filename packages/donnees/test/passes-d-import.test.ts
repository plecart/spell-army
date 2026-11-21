import { describe, expect, test } from "vitest";
import { importLock, importPasses } from "../src/index.ts";
import { freshDatabase } from "./base-neuve.ts";

type NewPass = typeof importPasses.$inferInsert;
// Un écart à la passe valide, valeurs hors des types de Drizzle comprises.
type PassChange = { [column in keyof NewPass]?: unknown };
type Refusal = [name: string, change: PassChange, constraint: string];

const AT = new Date("2026-11-21T10:00:00Z");
const RUNNING_QUICK: NewPass = {
	kind: "quick",
	trigger: "tick",
	status: "running",
	startedAt: AT,
};
const RUNNING_FULL: NewPass = {
	...RUNNING_QUICK,
	kind: "full",
	trigger: "weekly",
};

function pass(change: PassChange): NewPass {
	return { ...RUNNING_QUICK, ...change } as NewPass;
}

describe("journal des passes d'import", () => {
	test("une passe en cours s'inscrit avec ses compteurs à zéro, sans fin, sans erreur ni curseur", async () => {
		const db = await freshDatabase();
		expect(
			await db.insert(importPasses).values(RUNNING_QUICK).returning(),
		).toEqual([
			{
				id: expect.any(Number),
				...RUNNING_QUICK,
				finishedAt: null,
				pages: 0,
				added: 0,
				invalidIds: 0,
				invalidUsernames: 0,
				error: null,
				cursor: null,
			},
		]);
	});

	test.each<[name: string, change: PassChange]>([
		["une rapide du tic", {}],
		["une rapide du MCP", { trigger: "mcp" }],
		[
			"une complète de la semaine, à son curseur",
			{ kind: "full", trigger: "weekly", cursor: "c" },
		],
		["une complète d'auto-contrôle", { kind: "full", trigger: "self_check" }],
		["une complète du MCP", { kind: "full", trigger: "mcp" }],
		["une passe interrompue", { status: "interrupted", finishedAt: AT }],
		[
			"une passe en échec, avec son erreur",
			{ status: "failed", finishedAt: AT, error: "e" },
		],
		["une passe terminée", { status: "done", finishedAt: AT }],
	])("%s : acceptée", async (_, change) => {
		const db = await freshDatabase();
		await db.insert(importPasses).values(pass(change));
		expect(await db.select().from(importPasses)).toMatchObject([change]);
	});

	test.each<Refusal>([
		[
			"une rapide de la semaine",
			{ trigger: "weekly" },
			"import_passes_trigger_check",
		],
		[
			"une rapide d'auto-contrôle",
			{ trigger: "self_check" },
			"import_passes_trigger_check",
		],
		[
			"une complète du tic",
			{ kind: "full", trigger: "tick" },
			"import_passes_trigger_check",
		],
		["un type inconnu", { kind: "partial" }, "import_passes_trigger_check"],
		[
			"un déclencheur inconnu",
			{ trigger: "cron" },
			"import_passes_trigger_check",
		],
		[
			"un état inconnu",
			{ status: "paused", finishedAt: AT },
			"import_passes_status_check",
		],
		[
			"une passe en cours qui a une fin",
			{ finishedAt: AT },
			"import_passes_finished_at_check",
		],
		[
			"une passe interrompue sans fin",
			{ status: "interrupted" },
			"import_passes_finished_at_check",
		],
		[
			"une passe en échec sans fin",
			{ status: "failed", error: "e" },
			"import_passes_finished_at_check",
		],
		[
			"une passe terminée sans fin",
			{ status: "done" },
			"import_passes_finished_at_check",
		],
		[
			"une passe en échec sans erreur",
			{ status: "failed", finishedAt: AT },
			"import_passes_error_check",
		],
		[
			"une passe terminée avec une erreur",
			{ status: "done", finishedAt: AT, error: "e" },
			"import_passes_error_check",
		],
		[
			"une passe interrompue avec une erreur",
			{ status: "interrupted", finishedAt: AT, error: "e" },
			"import_passes_error_check",
		],
		[
			"une passe en cours avec une erreur",
			{ error: "e" },
			"import_passes_error_check",
		],
		[
			"une rapide avec un curseur",
			{ cursor: "c" },
			"import_passes_cursor_check",
		],
		["un nombre de pages négatif", { pages: -1 }, "import_passes_pages_check"],
		["un nombre d'ajouts négatif", { added: -1 }, "import_passes_added_check"],
		[
			"un nombre d'identifiants invalides négatif",
			{ invalidIds: -1 },
			"import_passes_invalid_ids_check",
		],
		[
			"un nombre de pseudos invalides négatif",
			{ invalidUsernames: -1 },
			"import_passes_invalid_usernames_check",
		],
	])(
		"%s : refusée par le contrôle d'import_passes",
		async (_, change, constraint) => {
			const db = await freshDatabase();
			await expect(
				db.insert(importPasses).values(pass(change)),
			).rejects.toMatchObject({
				cause: { code: "23514", constraint },
			});
		},
	);

	test.each<[name: string, change: PassChange]>([
		["en cours", {}],
		["interrompue", { status: "interrupted", finishedAt: AT }],
		["en échec", { status: "failed", finishedAt: AT, error: "e" }],
	])(
		"une complète %s : une seconde complète non terminée est refusée",
		async (_, change) => {
			const db = await freshDatabase();
			await db
				.insert(importPasses)
				.values({ ...RUNNING_FULL, ...change } as NewPass);
			await expect(
				db.insert(importPasses).values(RUNNING_FULL),
			).rejects.toMatchObject({
				cause: {
					code: "23505",
					constraint: "import_passes_one_unfinished_full",
				},
			});
		},
	);

	test("une complète terminée n'empêche pas d'en commencer une autre, ni les rapides de se suivre", async () => {
		const db = await freshDatabase();
		await db
			.insert(importPasses)
			.values([
				{ ...RUNNING_FULL, status: "done", finishedAt: AT },
				RUNNING_FULL,
				RUNNING_QUICK,
				RUNNING_QUICK,
			]);
		expect(await db.$count(importPasses)).toBe(4);
	});
});

describe("verrou de l'import", () => {
	test("une seule ligne, d'identifiant 1 : un autre est refusé", async () => {
		const db = await freshDatabase();
		const lease = { holder: crypto.randomUUID(), expiresAt: AT };
		await db.insert(importLock).values({ id: 1, ...lease });
		await expect(
			db.insert(importLock).values({ id: 2, ...lease }),
		).rejects.toMatchObject({
			cause: { code: "23514", constraint: "import_lock_id_check" },
		});
	});
});
