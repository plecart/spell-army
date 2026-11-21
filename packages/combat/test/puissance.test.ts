import { describe, expect, test } from "vitest";
import type { ArmySummary, Fighter } from "../src/army.ts";
import {
	type CharacterClass,
	STARTING_POOL,
	type Stats,
} from "../src/index.ts";
import { cast, type Situation, strike } from "../src/power.ts";
import { spellNumbered } from "./combattants.ts";

const PRECISION = 10;

function casterOf(
	spellNumber: number,
	stats: Stats,
	characterClass: CharacterClass = "wizard",
): Fighter {
	return { id: "1", characterClass, stats, spell: spellNumbered(spellNumber) };
}

function stats(
	life: number,
	strength: number,
	magic: number,
	speed: number,
): Stats {
	return { life, strength, magic, speed };
}

// Une armée de dix personnages aux stats égales, à moitié blessée, contre un monstre aux trois
// quarts de sa Vie et dont le dernier coup valait 10 : une stat de l'armée vaut 100 selon toute
// recette, donc un coup normal (×1,0) vaut 0,2 × 100 = 20 avant l'efficacité.
const ARMY: ArmySummary = {
	size: 10,
	stats: stats(100, 100, 100, 100),
	classShares: { golem: 0.2, wizard: 0.3, fairy: 0.5 },
};
const SITUATION: Situation = {
	army: ARMY,
	armyLife: 50,
	monsterLife: 75,
	monsterStartLife: 100,
	monsterLastHit: 10,
};

// Un magicien de Vie 15, Force 0, Magie 15, Vitesse 0 : son efficacité vaut 1 sur la Vie et la
// Magie, 0,5 sur la Force et la Vitesse — l'inverse pour un sort inversé.
const CASTER_STATS = stats(15, 0, 15, 0);

describe("la puissance d'un sort lancé par l'armée", () => {
	test("la stat de l'armée est la somme de ses stats, pondérée par les parts de la recette", () => {
		const army = { ...ARMY, stats: stats(10, 20, 30, 40) };
		// Lancer de rocher : 60 % Force + 40 % Vie.
		const { armyStat } = cast(casterOf(2, stats(8, 8, 7, 7)), {
			...SITUATION,
			army,
		});

		expect(armyStat).toBeCloseTo(0.6 * 20 + 0.4 * 10, PRECISION);
	});

	test.each([
		["nulle", stats(15, 15, 0, 0), 0.5],
		["à 15", stats(0, 0, 15, 15), 1],
		["à 10,5 (70 % de 15)", stats(15, 0, 15, 0), 0.85],
	])(
		"l'efficacité d'un lanceur dont la stat selon la recette est %s : 50 % + 50 % × stat / 15",
		(_, casterStats, efficiency) => {
			// Éclair : 70 % Magie + 30 % Vitesse.
			expect(cast(casterOf(8, casterStats), SITUATION).efficiency).toBeCloseTo(
				efficiency,
				PRECISION,
			);
		},
	);

	test("l'efficacité d'un sort inversé : 50 % + 50 % × (15 − stat du lanceur) / 15", () => {
		// Le Barbare ignorant : 100 % Magie, inversé ; un lanceur de Magie 3.
		const { efficiency } = cast(casterOf(16, stats(9, 9, 3, 9)), SITUATION);

		expect(efficiency).toBeCloseTo(0.9, PRECISION);
	});

	test("la meilleure stat : celle où le lanceur est le plus fort, l'armée y donne sa somme", () => {
		const army = { ...ARMY, stats: stats(10, 20, 30, 40) };
		// Talent caché, lancé par un personnage de Force 12.
		const result = cast(casterOf(19, stats(5, 12, 9, 4)), {
			...SITUATION,
			army,
		});

		expect(result.recipe).toEqual({ strength: 100 });
		expect(result.efficiency).toBeCloseTo(0.9, PRECISION);
		expect(result.armyStat).toBe(20);
	});

	test.each([
		["la Vie avant la Force", stats(10, 10, 5, 5), { life: 100 }],
		["la Force avant la Magie", stats(5, 10, 10, 5), { strength: 100 }],
		["la Magie avant la Vitesse", stats(5, 5, 10, 10), { magic: 100 }],
	])("la meilleure stat à égalité : %s", (_, casterStats, recipe) => {
		expect(cast(casterOf(19, casterStats), SITUATION).recipe).toEqual(recipe);
	});

	test("une classe absente de l'armée compte pour une part nulle", () => {
		// Les golems se relèvent, dans une armée sans golem : soin ×0,6, efficacité 1 sur la Vie.
		const army = { ...ARMY, classShares: { wizard: 1 } };
		const { heal } = cast(casterOf(17, CASTER_STATS), { ...SITUATION, army });

		expect(heal).toBeCloseTo(0.6 * 20, PRECISION);
	});
});

// Chaque sort de la réserve de départ, lancé dans la situation ci-dessus par le magicien de
// `CASTER_STATS`. Les valeurs se calculent à la main, sur l'annexe B.
const POOL_VALUES = [
	[1, "Coup d'épée", 10, 0],
	[2, "Lancer de rocher", 14, 0], // efficacité 0,5 + 0,5 × (40 % × 15) / 15 = 0,7
	[3, "Charge", 11.5, 0],
	[4, "Coup de marteau", 11.5, 0], // monstre à 75 % : ×(1,4 − 0,25)
	[5, "Coup vampirique", 5, 5],
	[6, "Boule de feu", 20, 0],
	[7, "Météore", 24, 0],
	[8, "Éclair", 17, 0], // efficacité 0,85
	[9, "Drain de vie", 10, 10],
	[10, "Tornade", 10, 0],
	[11, "Soin", 0, 24],
	[12, "Prière", 7.2, 10.8], // efficacité 0,5 + 0,5 × (80 % × 15) / 15 = 0,9
	[13, "Soin des blessés graves", 0, 22], // armée blessée à 50 % : ×(0,6 + 0,5)
	[14, "Cri de ralliement", 0, 20], // 20 % de la Vie maximale, 100
	[15, "Rage du désespoir", 10, 0], // ×(0,5 + 0,5), efficacité 0,5
	[16, "Le Barbare ignorant", 10, 0],
	[17, "Les golems se relèvent", 0, 28], // 20 % de golems : ×(0,6 + 4 × 0,2)
	[18, "Appel du clan", 29, 0], // meilleure stat la Vie ; 30 % de magiciens : ×(0,4 + 3,5 × 0,3)
	[19, "Talent caché", 17, 0],
	[20, "Vengeance", 14, 0], // 140 % du dernier coup, 10
	[21, "Le Poids plume", 20, 0],
	[22, "Le Rebouteux", 0, 12],
	[23, "Le Coup lent", 20, 0],
	[24, "Le Sacrifice", 0, 11],
] as const;

describe("les 24 sorts de la réserve de départ se calculent", () => {
	test.each(POOL_VALUES)(
		"n° %i, %s : dégâts %d, soin %d",
		(number, name, damage, heal) => {
			const caster = casterOf(number, CASTER_STATS);
			const result = cast(caster, SITUATION);

			expect(caster.spell.name).toBe(name);
			expect(result.damage).toBeCloseTo(damage, PRECISION);
			expect(result.heal).toBeCloseTo(heal, PRECISION);
		},
	);

	test("la table couvre toute la réserve", () => {
		expect(POOL_VALUES.map(([number]) => number)).toEqual(
			STARTING_POOL.map(({ number }) => number),
		);
	});
});

describe("la puissance d'une attaque du monstre", () => {
	test("coefficient × 0,2 × stat du monstre selon la recette, sans efficacité", () => {
		const result = strike(
			{
				name: "Souffle",
				recipe: { strength: 50, magic: 50 },
				coefficient: 0.78,
			},
			stats(500, 100, 200, 50),
		);

		expect(result.monsterStat).toBe(150);
		expect(result.damage).toBeCloseTo(0.78 * 0.2 * 150, PRECISION);
	});
});
