import { describe, expect, test } from "vitest";
import { diceOf } from "../src/dice.ts";
import {
	type CombatLog,
	type Fighter,
	type Forced,
	fight,
	type Monster,
} from "../src/index.ts";
import { armyActions, fighterOf, monsterOf } from "./combattants.ts";

const SEED = "1";
// Un monstre inoffensif que l'armée n'entame pas : le combat va jusqu'au garde-fou.
const ENDLESS = monsterOf({ life: 1e9 });
// Les personnages 1 à 5, qui ne lancent que des soins.
const HEALERS = ["1", "2", "3", "4", "5"].map((id) => fighterOf(id, 11));

function run(
	army: readonly Fighter[],
	forced: readonly Forced[],
	monster: Monster = ENDLESS,
): CombatLog {
	return fight({ army, monster, seed: SEED, poolVersion: "test", forced });
}

function forcedOf(id: string, position: Forced["position"]): Forced {
	return { id, position, reason: "commentaire du jour" };
}

/** Les identifiants des actions de l'armée, des rangs `from` à `to` compris, dans l'ordre. */
function idsOf(log: CombatLog, from: number, to: number): string[] {
	return armyActions(log)
		.slice(from - 1, to)
		.map(({ fighter }) => fighter.id);
}

/** Les rangs, à partir de 1, des actions de l'armée jouées à une place forcée. */
function forcedRanks(log: CombatLog): number[] {
	return armyActions(log).flatMap(({ forced }, index) =>
		forced ? [index + 1] : [],
	);
}

/** Les identifiants des actions de l'armée, des rangs `from` à `to` compris, triés. */
function idsBetween(log: CombatLog, from: number, to: number): string[] {
	return idsOf(log, from, to).toSorted();
}

/** Le rang que tire le flux `stream` de la graine pour un forcé au milieu : de 2 à 10. */
function middleRank(stream: "army" | "forced"): number {
	return 2 + diceOf(stream, SEED).index(9);
}

describe("les forcés en premier", () => {
	test("jouent les premières actions de l'armée, dans l'ordre donné, à une place forcée", () => {
		const log = run(HEALERS, [forcedOf("4", "first"), forcedOf("2", "first")]);

		expect(
			armyActions(log)
				.slice(0, 2)
				.map(({ fighter }) => fighter.id),
		).toEqual(["4", "2"]);
		expect(forcedRanks(log)).toEqual([1, 2]);
		// Le bilan compte les forcés parmi les tirés.
		expect(log.summary.drawn.slice(0, 2)).toEqual(["4", "2"]);
	});

	test("sortent du tirage jusqu'à leur place, puis y rentrent sans rejouer avant le tour suivant", () => {
		const log = run(HEALERS, [forcedOf("4", "first"), forcedOf("2", "first")]);

		// Le premier tour du tirage, sans eux ; le suivant, avec eux.
		expect(idsBetween(log, 3, 5)).toEqual(["1", "3", "5"]);
		expect(idsBetween(log, 6, 10)).toEqual(["1", "2", "3", "4", "5"]);
	});
});

describe("les forcés en dernier", () => {
	test("jouent à la suite, dès la première action de l'armée en phase finale", () => {
		// Le personnage 38, Magie 15, frappe seul de 0,2 × 15 = 3 : les personnages 113 et 473, de
		// Magie 0, attendent leur place hors du tirage. Le monstre de 36 tombe à 9 après la 9e
		// action, 25 % tout juste, pas sous ; à 6 après la 10e : la phase finale s'ouvre à la 11e.
		const log = run(
			[fighterOf("38", 6), fighterOf("113", 11), fighterOf("473", 11)],
			[forcedOf("113", "last"), forcedOf("473", "last")],
			monsterOf({ life: 36 }),
		);
		const actions = armyActions(log);

		expect(actions[8]?.monsterLife).toEqual([12, 9]);
		expect(actions[9]?.monsterLife).toEqual([9, 6]);
		expect(actions.slice(10, 12).map(({ fighter }) => fighter.id)).toEqual([
			"113",
			"473",
		]);
		expect(forcedRanks(log)).toEqual([11, 12]);
		expect(log.summary.unreachedForced).toEqual([]);
	});

	test("la phase finale, une fois ouverte, le reste : un soin qui remonte l'armée au-dessus de 25 % n'arrête pas la suite", () => {
		// Le Météore du personnage 38 (3,6 de dégâts) coûte 0,54 de Vie à l'armée de 21 : sous 5,25
		// après la 30e action. Le Soin du personnage 113 (1,8) la remonte à 6,6.
		const log = run(
			[fighterOf("38", 7), fighterOf("113", 11), fighterOf("473", 11)],
			[forcedOf("113", "last"), forcedOf("473", "last")],
		);
		const actions = armyActions(log);

		expect(actions[29]?.armyLife[1]).toBeCloseTo(21 - 30 * 0.54, 10);
		expect(actions[30]?.armyLife[1]).toBeGreaterThan(0.25 * 21);
		expect(forcedRanks(log)).toEqual([31, 32]);
	});

	test("la phase finale qui s'ouvre au rang d'un forcé au milieu : le forcé en dernier passe au rang suivant", () => {
		// La graine « 1 » place le forcé au milieu au 6e rang. Le personnage 38 frappe seul de 3 : le
		// monstre de 16 tombe à 4 après la 4e action, 25 % tout juste, et à 1 après la 5e.
		expect(middleRank("forced")).toBe(6);

		const log = run(
			[fighterOf("38", 6), fighterOf("113", 11), fighterOf("473", 11)],
			[forcedOf("473", "last"), forcedOf("113", "middle")],
			monsterOf({ life: 16 }),
		);

		expect(idsOf(log, 6, 7)).toEqual(["113", "473"]);
		expect(forcedRanks(log)).toEqual([6, 7]);
	});
});

describe("les forcés au milieu", () => {
	test("un forcé joue au rang que tire le flux « forced », de la 2e à la 10e action de l'armée", () => {
		const rank = middleRank("forced");
		// Le flux de l'armée tirerait un autre rang : le test distingue bien les flux.
		expect(middleRank("army")).not.toBe(rank);

		const log = run(HEALERS, [forcedOf("3", "middle")]);

		expect(rank).toBeGreaterThanOrEqual(2);
		expect(rank).toBeLessThanOrEqual(10);
		expect(forcedRanks(log)).toEqual([rank]);
		expect(armyActions(log)[rank - 1]?.fighter.id).toBe("3");
		expect(idsBetween(log, 1, rank - 1)).not.toContain("3");
	});

	test("deux forcés tirés au même rang : le second passe au rang libre suivant", () => {
		// La graine « 1 » tire deux fois le même rang dans le flux « forced ».
		const dice = diceOf("forced", SEED);
		const [first, second] = [dice.index(9), dice.index(9)];
		expect(second).toBe(first);

		const log = run(HEALERS, [
			forcedOf("3", "middle"),
			forcedOf("5", "middle"),
		]);
		const rank = 2 + first;

		expect(forcedRanks(log)).toEqual([rank, rank + 1]);
		expect(idsBetween(log, rank, rank + 1)).toEqual(["3", "5"]);
	});

	test("un rang pris par un forcé en premier passe au rang libre suivant", () => {
		const rank = middleRank("forced");
		const army = Array.from({ length: rank + 3 }, (_, index) =>
			fighterOf(String(index + 1), 11),
		);
		// Les forcés en premier tiennent les rangs 1 à `rank` ; le forcé au milieu prend le suivant.
		const firsts = army.slice(0, rank).map(({ id }) => forcedOf(id, "first"));
		const middle = army[rank]?.id ?? "";

		const log = run(army, [...firsts, forcedOf(middle, "middle")]);

		expect(forcedRanks(log)).toEqual(
			Array.from({ length: rank + 1 }, (_, index) => index + 1),
		);
		expect(armyActions(log)[rank]?.fighter.id).toBe(middle);
	});
});

describe("un forcé que le combat n'atteint pas", () => {
	test("va au bilan, avec son identifiant et sa position, sans jouer", () => {
		// Le personnage 38 abat d'un coup le monstre de Vie 3 : ni phase finale, ni 2e action.
		const log = run(
			[fighterOf("38", 6), fighterOf("113", 11), fighterOf("473", 11)],
			[
				forcedOf("473", "last"),
				forcedOf("38", "first"),
				forcedOf("113", "middle"),
			],
			monsterOf({ life: 3 }),
		);

		expect(armyActions(log).map(({ fighter }) => fighter.id)).toEqual(["38"]);
		expect(log.summary.unreachedForced).toEqual([
			{ id: "473", position: "last" },
			{ id: "113", position: "middle" },
		]);
	});
});

describe("les forcés refusés", () => {
	test.each([
		[
			"un forcé absent de l'armée",
			HEALERS,
			[forcedOf("99", "first")],
			"le forcé « 99 » n'est pas dans l'armée",
		],
		[
			"un personnage forcé deux fois",
			HEALERS,
			[forcedOf("2", "first"), forcedOf("2", "last")],
			"le personnage « 2 » est forcé deux fois",
		],
		[
			"une armée où un identifiant revient",
			[...HEALERS, fighterOf("3", 6)],
			[],
			"l'identifiant « 3 » revient deux fois dans l'armée",
		],
		[
			"une armée toute forcée, sans forcé en premier",
			HEALERS.slice(0, 2),
			[forcedOf("1", "middle"), forcedOf("2", "last")],
			"l'armée doit garder un personnage à tirer : hors des forcés, ou forcé en premier",
		],
	])("%s", (_, army, forced, message) => {
		expect(() => run(army, forced)).toThrow(new RangeError(message));
	});
});
