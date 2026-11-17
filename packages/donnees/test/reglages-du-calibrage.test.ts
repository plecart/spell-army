import { sql } from "drizzle-orm";
import { describe, expect, inject, onTestFinished, test, vi } from "vitest";
import {
	auditLog,
	type CalibrationSettings,
	calibrationSettings,
	createClient,
	type Executor,
	readCalibrationSettings,
	updateCalibrationSettings,
} from "../src/index.ts";
import {
	createMigratedDatabase,
	UNREACHABLE_DATABASE_URL,
} from "./base-de-test.ts";

// Posées par la migration `0002_reglages_de_depart` : docs/game-design.md § 6, issue #11.
const STARTING_SETTINGS: CalibrationSettings = {
	recruitShare: 0.7,
	recruitShareDrop: 0.1,
	referenceWindowDays: 3,
	averageRecruitLife: 7.6,
	averageRecruitStrength: 7.6,
	averageRecruitMagic: 7.5,
	averageRecruitSpeed: 7.3,
	dayTwoBudgetRecruits: 10,
};

/** Client d'une base migrée neuve, fermé à la fin du test. */
async function freshDatabase() {
	const client = createClient(
		await createMigratedDatabase(inject("testDatabaseUrl")),
	);
	onTestFinished(() => client.$client.end());
	return client;
}

describe("réglages du calibrage", () => {
	test("une base migrée neuve porte les réglages de départ", async () => {
		expect(await readCalibrationSettings(await freshDatabase())).toEqual(
			STARTING_SETTINGS,
		);
	});

	test("modifier p seul ne change que p", async () => {
		const db = await freshDatabase();
		const expected = { ...STARTING_SETTINGS, recruitShare: 0.6 };
		expect(await updateCalibrationSettings(db, { recruitShare: 0.6 })).toEqual({
			before: STARTING_SETTINGS,
			after: expected,
		});
		expect(await readCalibrationSettings(db)).toEqual(expected);
	});

	test("modifier plusieurs réglages d'un coup", async () => {
		const db = await freshDatabase();
		const patch = {
			recruitShare: 0.5,
			referenceWindowDays: 5,
			averageRecruitMagic: 8.25,
		};
		const expected = { ...STARTING_SETTINGS, ...patch };
		expect(await updateCalibrationSettings(db, patch)).toEqual({
			before: STARTING_SETTINGS,
			after: expected,
		});
		expect(await readCalibrationSettings(db)).toEqual(expected);
	});

	test("les bornes incluses sont admises", async () => {
		const db = await freshDatabase();
		const lowest = {
			recruitShare: 0,
			recruitShareDrop: 0,
			referenceWindowDays: 1,
			dayTwoBudgetRecruits: 1,
		};
		const highest = { recruitShare: 1, recruitShareDrop: 1 };
		expect((await updateCalibrationSettings(db, lowest)).after).toEqual({
			...STARTING_SETTINGS,
			...lowest,
		});
		expect((await updateCalibrationSettings(db, highest)).after).toEqual({
			...STARTING_SETTINGS,
			...lowest,
			...highest,
		});
	});

	test.each<[string, Partial<CalibrationSettings>]>([
		["vide", {}],
		[
			"aux clés toutes undefined",
			{ recruitShare: undefined, dayTwoBudgetRecruits: undefined },
		],
	])("un patch %s est refusé avant toute requête", async (_, patch) => {
		const unreachable = createClient(UNREACHABLE_DATABASE_URL);
		onTestFinished(() => unreachable.$client.end());
		await expect(updateCalibrationSettings(unreachable, patch)).rejects.toThrow(
			"Aucun réglage à modifier",
		);
	});

	test("la table n'admet qu'une ligne", async () => {
		const db = await freshDatabase();
		await expect(
			db.insert(calibrationSettings).values({ id: 2, ...STARTING_SETTINGS }),
		).rejects.toMatchObject({
			cause: { constraint: "calibration_settings_id_check" },
		});
	});

	// Valeurs hors bornes par colonne, en littéraux : chacune est refusée par la contrainte `check`
	// de sa colonne, et une fraction par le type `integer` (code 22P02) avant toute contrainte.
	const OUTSIDE_A_FRACTION = [-0.1, 1.1, Number.NaN];
	const NOT_FINITE_POSITIVE = [0, -1, Number.POSITIVE_INFINITY, Number.NaN];
	const OUT_OF_BOUNDS: [keyof CalibrationSettings, string, number[]][] = [
		["recruitShare", "recruit_share", OUTSIDE_A_FRACTION],
		["recruitShareDrop", "recruit_share_drop", OUTSIDE_A_FRACTION],
		["referenceWindowDays", "reference_window_days", [0]],
		["averageRecruitLife", "average_recruit_life", NOT_FINITE_POSITIVE],
		["averageRecruitStrength", "average_recruit_strength", NOT_FINITE_POSITIVE],
		["averageRecruitMagic", "average_recruit_magic", NOT_FINITE_POSITIVE],
		["averageRecruitSpeed", "average_recruit_speed", NOT_FINITE_POSITIVE],
		["dayTwoBudgetRecruits", "day_two_budget_recruits", [0]],
	];
	const INTEGERS: (keyof CalibrationSettings)[] = [
		"referenceWindowDays",
		"dayTwoBudgetRecruits",
	];
	type Refusal = [Partial<CalibrationSettings>, object];
	test.each<Refusal>([
		...OUT_OF_BOUNDS.flatMap(([field, column, values]) =>
			values.map(
				(value): Refusal => [
					{ [field]: value },
					{ cause: { constraint: `calibration_settings_${column}_check` } },
				],
			),
		),
		...INTEGERS.map(
			(field): Refusal => [{ [field]: 2.5 }, { cause: { code: "22P02" } }],
		),
	])("la base refuse %o, la ligne inchangée", async (patch, refusal) => {
		const db = await freshDatabase();
		await expect(updateCalibrationSettings(db, patch)).rejects.toMatchObject(
			refusal,
		);
		expect(await readCalibrationSettings(db)).toEqual(STARTING_SETTINGS);
	});

	test.each<[string, (db: Executor) => Promise<unknown>]>([
		["la lecture", readCalibrationSettings],
		[
			"la modification",
			(db) => updateCalibrationSettings(db, { recruitShare: 0.5 }),
		],
	])("%s lève une erreur claire quand la ligne manque", async (_, run) => {
		const db = await freshDatabase();
		await db.delete(calibrationSettings);
		await expect(run(db)).rejects.toThrow("Réglages du calibrage absents");
	});

	test("dans la transaction de l'appelant, une modification refusée la laisse utilisable", async () => {
		const db = await freshDatabase();
		const settings = await db.transaction(async (tx) => {
			await expect(
				updateCalibrationSettings(tx, { recruitShare: 2 }),
			).rejects.toMatchObject({
				cause: { constraint: "calibration_settings_recruit_share_check" },
			});
			return readCalibrationSettings(tx);
		});
		expect(settings).toEqual(STARTING_SETTINGS);
	});

	test("une modification concurrente attend la précédente et lit son après pour avant", async () => {
		const db = await freshDatabase();
		let concurrent: ReturnType<typeof updateCalibrationSettings> | undefined;
		await db.transaction(async (tx) => {
			await updateCalibrationSettings(tx, { recruitShare: 0.6 });
			concurrent = updateCalibrationSettings(db, { recruitShare: 0.5 });
			await vi.waitFor(async () => {
				const { rows } = await db.execute(
					sql`select count(*)::int as waiting from pg_stat_activity
						where datname = current_database() and wait_event_type = 'Lock'`,
				);
				expect(rows).toEqual([{ waiting: 1 }]);
			});
		});
		expect((await concurrent)?.before.recruitShare).toBe(0.6);
	});
});

describe("journal d'audit", () => {
	const line = { tool: "modifier_reglages", input: { recruitShare: 2 } };
	const failure = "p hors de [0, 1]";

	test.each([
		{ succeeded: true, error: null },
		{ succeeded: false, error: failure },
	])(
		"une ligne succeeded=$succeeded, error=$error est admise, horodatée par la base",
		async (outcome) => {
			const db = await freshDatabase();
			const [row] = await db
				.insert(auditLog)
				.values({ ...line, ...outcome })
				.returning({ at: auditLog.at });
			expect(row?.at).toBeInstanceOf(Date);
		},
	);

	test.each([
		{ succeeded: false, error: null },
		{ succeeded: true, error: failure },
	])(
		"une ligne succeeded=$succeeded, error=$error est refusée",
		async (outcome) => {
			const db = await freshDatabase();
			await expect(
				db.insert(auditLog).values({ ...line, ...outcome }),
			).rejects.toMatchObject({
				cause: { constraint: "audit_log_succeeded_check" },
			});
		},
	);
});
