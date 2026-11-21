import { describe, expect, test } from "vitest";
import {
	type ArmyAction,
	type CombatLog,
	type Fighter,
	fight,
	type Monster,
	type MonsterAction,
} from "../src/index.ts";
import { fighterOf, harmless, monsterOf } from "./combattants.ts";

// Un monstre que l'armée n'entame pas en quelques dizaines d'actions.
const ENDLESS_LIFE = 1e9;

function run(army: readonly Fighter[], monster: Monster): CombatLog {
	return fight({ army, monster, seed: "1", poolVersion: "test" });
}

function sides(log: CombatLog, count: number): string[] {
	return log.actions.slice(0, count).map(({ side }) => side);
}

/** Les tirages, coupés en tours de `size`, chacun trié. */
function rounds(drawn: string[], size: number): string[][] {
	return Array.from({ length: drawn.length / size }, (_, round) =>
		drawn.slice(round * size, (round + 1) * size).toSorted(),
	);
}

function armyActions(log: CombatLog): ArmyAction[] {
	return log.actions.filter(
		(action): action is ArmyAction => action.side === "army",
	);
}

function monsterActions(log: CombatLog): MonsterAction[] {
	return log.actions.filter(
		(action): action is MonsterAction => action.side === "monster",
	);
}

describe("les entrées du combat", () => {
	test("une armée vide est refusée", () => {
		expect(() => run([], monsterOf({ life: 10 }))).toThrow(
			new RangeError("l'armée doit compter au moins un personnage"),
		);
	});

	test("un monstre sans attaque est refusé", () => {
		expect(() => run([fighterOf("1", 6)], monsterOf({ life: 10 }, []))).toThrow(
			new RangeError("le monstre doit avoir au moins une attaque"),
		);
	});

	test("une graine vide est refusée", () => {
		expect(() =>
			fight({
				army: [fighterOf("1", 6)],
				monster: monsterOf({ life: 10 }),
				seed: "",
				poolVersion: "test",
			}),
		).toThrow(new RangeError("la graine doit être un texte non vide"));
	});
});

describe("l'initiative", () => {
	test("R = 1,25 : l'armée joue 5 actions pour 4 du monstre, et à égalité joue d'abord", () => {
		// Le personnage 25 a une Vitesse de 5 : R = 5 / 4. Au deuxième tour, le compteur atteint 2
		// tout juste, et l'armée y joue deux fois.
		const log = run(
			[fighterOf("25", 6)],
			monsterOf({ life: ENDLESS_LIFE, speed: 4 }),
		);

		expect(sides(log, 9)).toEqual([
			"army",
			"monster",
			"army",
			"army",
			"monster",
			"army",
			"monster",
			"army",
			"monster",
		]);
	});

	test.each([
		[
			"de l'armée",
			"50", // Vitesse 0 : R = 1 / 1
			1,
			["army", "monster", "army", "monster"],
		],
		[
			"du monstre",
			"25", // Vitesse 5 : R = 5 / 1
			0,
			["army", "army", "army", "army", "army", "monster"],
		],
	])(
		"une vitesse totale de 0 %s compte pour 1",
		(_, id, monsterSpeed, expected) => {
			const log = run(
				[fighterOf(id, 6)],
				monsterOf({ life: ENDLESS_LIFE, speed: monsterSpeed }),
			);

			expect(sides(log, expected.length)).toEqual(expected);
		},
	);
});

describe("les tirages sans remise", () => {
	test("chaque personnage joue une fois avant qu'un autre ne rejoue", () => {
		const ids = ["1", "2", "3", "4"];
		// Des soins seuls, contre un monstre inoffensif : le combat ne finit pas.
		const log = run(
			ids.map((id) => fighterOf(id, 11)),
			monsterOf({ life: 10 }),
		);
		const drawn = armyActions(log)
			.slice(0, 3 * ids.length)
			.map(({ fighter }) => fighter.id);

		expect(rounds(drawn, ids.length)).toEqual([ids, ids, ids]);
	});

	test("chaque attaque du monstre sort une fois avant qu'une autre ne ressorte", () => {
		const names = ["Griffe", "Morsure", "Souffle"];
		const log = run(
			[fighterOf("1", 11)],
			monsterOf({ life: 10 }, names.map(harmless)),
		);
		const drawn = monsterActions(log)
			.slice(0, 3 * names.length)
			.map(({ attack }) => attack);

		expect(rounds(drawn, names.length)).toEqual([names, names, names]);
	});
});

describe("la fin du combat", () => {
	test("victoire quand la Vie du monstre tombe à 0, sans descendre en dessous", () => {
		// Le personnage 38, Magie 15, frappe de 0,2 × 15 = 3 : 10 → 7 → 4 → 1 → 0.
		const log = run([fighterOf("38", 6)], monsterOf({ life: 10 }));

		expect(armyActions(log).map(({ monsterLife }) => monsterLife)).toEqual([
			[10, 7],
			[7, 4],
			[4, 1],
			[1, 0],
		]);
		// Le journal garde les dégâts du sort, avant le plancher : 3, là où le monstre n'a perdu que 1.
		expect(armyActions(log).at(-1)?.damage).toBe(3);
		expect(log.summary).toMatchObject({ outcome: "victory", monsterLife: 0 });
	});

	test("défaite quand la Vie de l'armée tombe à 0, sans descendre en dessous", () => {
		// Le personnage 25 a une Vie de 5 ; l'attaque en ôte 0,2 × 100 = 20.
		const log = run(
			[fighterOf("25", 11)],
			monsterOf({ life: 10, strength: 100 }, [
				{ name: "Écrasement", recipe: { strength: 100 }, coefficient: 1 },
			]),
		);

		expect(monsterActions(log).map(({ armyLife }) => armyLife)).toEqual([
			[5, 0],
		]);
		expect(log.summary).toMatchObject({ outcome: "defeat", armyLife: 0 });
	});

	test.each([
		["le monstre", "1", 0, "victory"],
		["l'armée", "723", 10, "defeat"], // le personnage 723 a une Vie de 0
	])(
		"%s à 0 au départ : le combat se clôt à 0 action",
		(_, id, monsterLife, outcome) => {
			const log = run([fighterOf(id, 6)], monsterOf({ life: monsterLife }));

			expect(log.actions).toEqual([]);
			expect(log.summary).toMatchObject({ outcome, actionCount: 0 });
		},
	);

	test("un sort coûteux qui abat le monstre et, par sa perte, l'armée : victoire, le monstre se regarde d'abord", () => {
		// Météore, Magie 15 + 15 : 1,2 × 0,2 × 30 = 7,2 de dégâts, 7 infligés, 1,05 de perte pour
		// une armée de Vie 1 + 0.
		const log = run(
			[fighterOf("63", 7), fighterOf("968", 7)],
			monsterOf({ life: 7 }),
		);

		expect(log.actions).toHaveLength(1);
		expect(log.summary).toMatchObject({
			outcome: "victory",
			armyLife: 0,
			monsterLife: 0,
		});
	});

	test("au-delà de 10 000 actions : défaite par épuisement, signalée au journal", () => {
		// Des soins seuls contre un monstre inoffensif : personne ne perd de Vie.
		const log = run([fighterOf("1", 11)], monsterOf({ life: 10 }));

		expect(log.actions).toHaveLength(10_000);
		expect(log.summary).toMatchObject({
			outcome: "exhaustion",
			actionCount: 10_000,
		});
	});
});

describe("les effets sur la Vie", () => {
	test("le soin ne dépasse pas la Vie maximale de l'armée", () => {
		// Le personnage 1 a une Vie de 8, l'armée est intacte.
		const log = run([fighterOf("1", 11)], monsterOf({ life: 10 }));

		expect(armyActions(log)[0]?.armyLife).toEqual([8, 8]);
	});

	test("un sort coûteux fait perdre à l'armée la part des dégâts infligés", () => {
		// Météore (15 %) lancé par le personnage 38, Vie 3 : 3,6 de dégâts, 0,54 de perte.
		const log = run([fighterOf("38", 7)], monsterOf({ life: ENDLESS_LIFE }));
		const [first] = armyActions(log);

		expect(first?.damage).toBeCloseTo(3.6, 10);
		expect(first?.armyLife[1]).toBeCloseTo(3 - 0.15 * 3.6, 10);
	});

	test("la perte d'un sort coûteux peut tuer l'armée", () => {
		const log = run([fighterOf("38", 7)], monsterOf({ life: ENDLESS_LIFE }));

		expect(log.summary).toMatchObject({ outcome: "defeat", armyLife: 0 });
		expect(monsterActions(log).every(({ damage }) => damage === 0)).toBe(true);
	});

	test("la perte d'un sort coûteux suit les dégâts infligés, que borne la Vie restante du monstre", () => {
		const log = run([fighterOf("38", 7)], monsterOf({ life: 1 }));
		const [first] = armyActions(log);

		expect(first?.monsterLife).toEqual([1, 0]);
		expect(first?.armyLife[1]).toBeCloseTo(3 - 0.15 * 1, 10);
		expect(log.summary.outcome).toBe("victory");
	});

	test("Vengeance : le dernier coup du monstre vaut 0 avant sa première attaque, puis la valeur de sa dernière attaque", () => {
		// Le personnage 25, Vie 5 : efficacité 0,5 + 0,5 × 5 / 15. R = 1 : l'armée, puis le monstre.
		const efficiency = 0.5 + (0.5 * 5) / 15;
		const log = run(
			[fighterOf("25", 20)],
			monsterOf({ life: ENDLESS_LIFE, speed: 5 }, [
				{ name: "Pichenette", recipe: { strength: 100 }, coefficient: 0.5 },
				{ name: "Chiquenaude", recipe: { strength: 100 }, coefficient: 1 },
			]),
		);
		const [first, ...next] = armyActions(log);
		const hits = monsterActions(log).map(({ damage }) => damage);

		expect(first?.damage).toBe(0);
		expect(next.slice(0, 3).map(({ damage }) => damage)).toEqual(
			hits.slice(0, 3).map((hit) => expect.closeTo(1.4 * hit * efficiency, 10)),
		);
	});
});
