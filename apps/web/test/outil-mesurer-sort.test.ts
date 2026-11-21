import type { CallToolResult } from "@modelcontextprotocol/client";
import { measureSpell, STARTING_POOL, type Spell } from "combat";
import {
	createClient,
	listSpells,
	type SpellRecord,
	updateSpell,
} from "donnees";
import { createMigratedDatabase } from "donnees/test/base-de-test";
import { simulationArmies } from "personnages";
import { afterAll, beforeAll, describe, expect, inject, test } from "vitest";
import { measureSpellTool } from "../app/mcp/spell-tools.ts";
import { callTool } from "../app/mcp/tool.ts";
import { auditOf, expectRefusal, publishedTools } from "./montage.ts";

// Un sort candidat qui n'est pas dans la réserve de départ : dégâts selon 50 % de Vie et 50 % de
// Magie, dans le vocabulaire des outils.
const CANDIDATE = {
	nom: "Sort d'essai",
	recette: { type: "parts", parts: { vie: 50, magie: 50 } },
	forme: { type: "sur" },
	effet: { base: "stat_de_l_armee", degats: { constante: 0.9, par_jauge: 0 } },
	description: "Dégâts selon 50 % de la Vie et 50 % de la Magie.",
};

// Le même dans le modèle de `combat`, de poids 1, sous le n° 25 qu'ajouter_sort lui donnerait.
const MODEL_CANDIDATE: Spell = {
	number: 25,
	name: "Sort d'essai",
	recipe: { kind: "shares", shares: { life: 50, magic: 50 } },
	form: { kind: "safe" },
	effect: { base: "armyStat", damage: { constant: 0.9, perGauge: 0 } },
	weight: 1,
	description: "Dégâts selon 50 % de la Vie et 50 % de la Magie.",
};

// Les seuls sorts tirables de la réserve en base, Coup d'épée, Boule de feu et Le Sacrifice, pour
// qu'elle diffère de la réserve de départ. Le n° 24, le plus grand, se tire : un candidat qui
// prendrait son numéro l'ôterait des deux mesures. `drawSpell` range les sorts par numéro en texte :
// le n° 25 du candidat se tire entre eux (« 24 » < « 25 » < « 6 »), là où un n° 0 se tirerait avant.
const DRAWABLE = [1, 6, 24];

// L'échantillon réduit des tests : les graines 1 à 20, contre 2 000 dans le registre.
const LAST_SEED = 20;

describe("mesurer_sort : tools/list", () => {
	test("publie mesurer_sort en lecture seule, l'entrée d'ajouter_sort, une sortie stricte, sur les graines 1 à 2 000", () => {
		const [addSpell, measure] = publishedTools([
			"ajouter_sort",
			"mesurer_sort",
		]);

		expect(measure).toMatchObject({
			title: "Mesurer un sort candidat",
			description: expect.stringContaining("sur les graines 1 à 2 000"),
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
			inputSchema: addSpell?.inputSchema,
			outputSchema: { type: "object", additionalProperties: false },
		});
	});
});

describe("mesurer_sort sur une réserve en base où seuls Coup d'épée, Boule de feu et Le Sacrifice se tirent", () => {
	let db: ReturnType<typeof createClient>;
	let reserve: SpellRecord[];
	let result: CallToolResult;
	beforeAll(async () => {
		db = createClient(await createMigratedDatabase(inject("testDatabaseUrl")));
		for (const { number } of STARTING_POOL) {
			if (!DRAWABLE.includes(number)) {
				await updateSpell(db, number, { weight: 0 });
			}
		}
		reserve = await listSpells(db);
		result = await callTool(
			[measureSpellTool(LAST_SEED)],
			db,
			"mesurer_sort",
			CANDIDATE,
		);
	});
	afterAll(() => db.$client.end());

	test("rend les parts et l'écart de la mesure de combat sur la réserve en base entière, le candidat sous le n° 25", () => {
		const drawable = STARTING_POOL.map((spell) =>
			DRAWABLE.includes(spell.number) ? spell : { ...spell, weight: 0 },
		);
		const { withSpell, withoutSpell, gap } = measureSpell({
			pool: drawable,
			candidate: MODEL_CANDIDATE,
			seeds: Array.from({ length: LAST_SEED }, (_, index) => String(index + 1)),
			armyOf: simulationArmies(),
		});

		expect(result.structuredContent).toMatchObject({
			part_avec: withSpell,
			part_sans: withoutSpell,
			ecart: gap,
		});
	});

	test("chaque part est de 0 à 1, et l'écart vaut (avec − sans) × 100", () => {
		const { part_avec, part_sans, ecart } = result.structuredContent as {
			part_avec: number;
			part_sans: number;
			ecart: number;
		};

		for (const share of [part_avec, part_sans]) {
			expect(share).toBeGreaterThanOrEqual(0);
			expect(share).toBeLessThanOrEqual(1);
		}
		expect(ecart).toBeCloseTo((part_avec - part_sans) * 100);
	});

	test("nomme l'échantillon : les graines 1 à 20", () => {
		expect(result.structuredContent).toMatchObject({
			graines: { premiere: 1, derniere: LAST_SEED },
		});
	});

	test("ne modifie pas la réserve", async () => {
		expect(await listSpells(db)).toEqual(reserve);
	});

	test("écrit une ligne d'audit en succès, l'entrée reçue, sans avant ni après", async () => {
		expect(await auditOf(db, "mesurer_sort")).toEqual([
			expect.objectContaining({
				input: CANDIDATE,
				succeeded: true,
				before: null,
				after: null,
			}),
		]);
	});
});

// Les refus de `validateSpell`, comme pour ajouter_sort, puis celui du schéma strict.
test.each<[string, Record<string, unknown>, string]>([
	[
		"une recette qui ne fait pas 100 %",
		{
			...CANDIDATE,
			recette: { type: "parts", parts: { vie: 50, magie: 40 } },
		},
		"les parts de la recette doivent faire 100 %, reçu : 90 %",
	],
	[
		"un poids négatif",
		{ ...CANDIDATE, poids: -1 },
		"le poids doit être un nombre fini ≥ 0, reçu : -1",
	],
	[
		"un champ inconnu",
		{ ...CANDIDATE, numero: 3 },
		'Unrecognized key: "numero"',
	],
])(
	"mesurer_sort, %s : refusé, une ligne d'audit en erreur avec l'entrée reçue, la réserve intacte",
	async (_, args, message) => {
		const { db } = await expectRefusal("mesurer_sort", args, message);
		expect(await listSpells(db)).toHaveLength(STARTING_POOL.length);
	},
);
