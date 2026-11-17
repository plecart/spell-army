import { expect, test } from "vitest";
import { characterOf, drawSpell, type SpellEntry } from "../src/index.ts";
import { identifiers } from "./identifiants.ts";

const WEIGHTED_POOL: SpellEntry[] = [
	{ id: "eclair", weight: 1 },
	{ id: "meteore", weight: 0 },
	{ id: "boule-de-feu", weight: 2 },
];

function drawCounts(ids: readonly string[], pool: readonly SpellEntry[]) {
	const counts = new Map<string, number>();
	for (const id of ids) {
		const spell = drawSpell(id, pool);
		counts.set(spell, (counts.get(spell) ?? 0) + 1);
	}
	return counts;
}

test("un sort de poids 0 n'est jamais tiré sur les identifiants 1 à 100 000", () => {
	const counts = drawCounts(identifiers(100_000), WEIGHTED_POOL);

	expect(counts.get("meteore") ?? 0).toBe(0);
});

test("un sort de poids 2 est tiré entre 1,9 et 2,1 fois plus souvent qu'un sort de poids 1", () => {
	const counts = drawCounts(identifiers(100_000), WEIGHTED_POOL);
	const ratio = (counts.get("boule-de-feu") ?? 0) / (counts.get("eclair") ?? 0);

	expect(ratio).toBeGreaterThanOrEqual(1.9);
	expect(ratio).toBeLessThanOrEqual(2.1);
});

test("le sort est indépendant de la classe : sur 1 à 80 000, chaque sort reste à ± 20 % de sa fréquence attendue dans chaque classe", () => {
	const pool = Array.from({ length: 24 }, (_, index) => ({
		id: `sort-${index}`,
		weight: 1,
	}));
	const byClass = Map.groupBy(
		identifiers(80_000),
		(id) => characterOf(id).class,
	);
	const outside = [...byClass].flatMap(([classKey, ids]) => {
		const expected = ids.length / pool.length;
		const counts = drawCounts(ids, pool);
		return pool
			.map(({ id }) => ({ classKey, id, count: counts.get(id) ?? 0 }))
			.filter(({ count }) => Math.abs(count - expected) > 0.2 * expected);
	});

	expect(byClass.size).toBe(8);
	expect(outside).toEqual([]);
});

test("le tirage du sort ne dépend pas de l'ordre de la réserve : mélangée, elle rend le même sort de 1 à 1 000", () => {
	const pool: SpellEntry[] = [
		{ id: "bouclier", weight: 3 },
		{ id: "eclair", weight: 1 },
		{ id: "soin", weight: 2.5 },
		{ id: "meteore", weight: 0 },
		{ id: "Tempete", weight: 4 },
		{ id: "gel", weight: 1 },
		{ id: "eclair", weight: 0.5 },
		{ id: "boule-de-feu", weight: 2 },
		{ id: "poison", weight: 1.5 },
	];
	// Mélange déterministe : une rotation de cinq rangs, puis l'ordre inverse.
	const shuffled = [...pool.slice(5), ...pool.slice(0, 5)].toReversed();
	const differences = identifiers(1_000).filter(
		(id) => drawSpell(id, pool) !== drawSpell(id, shuffled),
	);

	expect(shuffled).not.toEqual(pool);
	expect(differences).toEqual([]);
});

test("quand l'arrondi rattrape une somme de poids sous-normale, le dernier sort tirable est tiré", () => {
	const pool = [{ id: "eclair", weight: Number.MIN_VALUE }];
	const drawn = new Set(identifiers(100).map((id) => drawSpell(id, pool)));

	expect(drawn).toEqual(new Set(["eclair"]));
});
