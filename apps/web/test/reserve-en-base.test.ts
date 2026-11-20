// La réserve de départ, posée en base par la migration `0004_reserve_de_depart`, comparée à celle
// de `combat` : seul `apps/web` dépend des deux paquets (ADR 0001, « Paquets »).
import { STARTING_POOL, spellKey } from "combat";
import {
	createClient,
	listSpells,
	readDrawablePool,
	type SpellRecord,
} from "donnees";
import { createMigratedDatabase } from "donnees/test/base-de-test";
import { afterAll, beforeAll, describe, expect, inject, test } from "vitest";

const STARTING_NUMBERS = Array.from({ length: 24 }, (_, index) => index + 1);

// Une base migrée neuve, que les tests du fichier ne font que lire.
let db: ReturnType<typeof createClient>;
let listed: SpellRecord[];
beforeAll(async () => {
	db = createClient(await createMigratedDatabase(inject("testDatabaseUrl")));
	listed = await listSpells(db);
});
afterAll(() => db.$client.end());

describe("réserve de départ en base", () => {
	test("après migrations, la base porte 24 sorts, numérotés de 1 à 24", () => {
		expect(listed.map(({ number }) => number)).toEqual(STARTING_NUMBERS);
	});

	test.each(
		STARTING_POOL.map((spell) => [spell.number, spell.name, spell] as const),
	)(
		"le sort n° %i, %s, est en base tel que la réserve de départ le décrit, clé comprise",
		(number, _, spell) => {
			expect(listed.find((row) => row.number === number)).toEqual({
				...spell,
				key: spellKey(spell),
				image: null,
			});
		},
	);

	test('la réserve tirable compte 24 entrées, id de "1" à "24", de poids 1', async () => {
		expect(await readDrawablePool(db)).toEqual(
			STARTING_NUMBERS.map((number) => ({ id: String(number), weight: 1 })),
		);
	});
});
