import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
	afterCombat,
	budgetForLaunch,
	budgetOf,
	dayOf,
	type Outcome,
	SEASON_START,
	type SeasonSettings,
	type SeasonState,
	type Stats,
	seedOf,
} from "../src/index.ts";
import {
	ARMY_100,
	AVERAGE_RECRUIT,
	EXAMPLE_BUDGET,
	expectStatsCloseTo,
	TEN_RECRUITS,
} from "./budget.ts";

/** Les réglages de départ (game design § 6) : p 0,7, baisse de 10 points, 10 recrues au jour 2. */
const SETTINGS: SeasonSettings = {
	recruitShare: 0.7,
	recruitShareDrop: 0.1,
	averageRecruit: AVERAGE_RECRUIT,
	dayTwoBudgetRecruits: 10,
};

/** Une armée qui a grossi depuis : celle d'un lancement suivant. */
const GROWN_ARMY: Stats = { life: 500, strength: 500, magic: 500, speed: 500 };

/**
 * La saison après un combat de l'armée de 100, sur 20 recrues de référence, aux réglages de départ
 * sauf `settings`.
 */
function after(
	state: SeasonState,
	outcome: Outcome,
	settings: Partial<SeasonSettings> = {},
) {
	return afterCombat(state, {
		outcome,
		army: ARMY_100,
		referenceRecruits: 20,
		settings: { ...SETTINGS, ...settings },
	});
}

/**
 * La saison après la victoire d'une armée de 10 partout, sur 1 recrue de référence : la formule
 * (Vie 10 + 0,7 × 1 × 7,6 = 15,32) y reste sous 10 recrues (76).
 */
function wonBySmallArmy(state: SeasonState): SeasonState {
	return afterCombat(state, {
		outcome: "victory",
		army: { life: 10, strength: 10, magic: 10, speed: 10 },
		referenceRecruits: 1,
		settings: SETTINGS,
	}).state;
}

/**
 * `count` défaites de suite depuis `state`, la première à p = `recruitShare`, chacune des suivantes
 * au p que la précédente a écrit.
 */
function defeats(
	state: SeasonState,
	count: number,
	recruitShare = SETTINGS.recruitShare,
) {
	let result = { state, recruitShare };
	for (let index = 0; index < count; index++) {
		result = after(result.state, "defeat", {
			recruitShare: result.recruitShare,
		});
	}
	return result;
}

/** Le chapitre 3, son monstre fixé par la formule : armée de 100, 20 recrues, p 0,7. */
function chapterThree(): SeasonState {
	return after(after(SEASON_START, "victory").state, "victory").state;
}

/** Le budget du monstre au lancement suivant, l'armée ayant grossi entre-temps. */
function nextBudget(state: SeasonState): Stats {
	return budgetOf(budgetForLaunch(state, GROWN_ARMY));
}

/** Le budget de la formule sur l'armée de 100 et 20 recrues de référence, au p donné. */
function formulaAt(recruitShare: number): Stats {
	return budgetOf({
		kind: "formula",
		army: ARMY_100,
		referenceRecruits: 20,
		averageRecruit: AVERAGE_RECRUIT,
		recruitShare,
	});
}

describe("le premier lancement", () => {
	test("au premier combat de la saison, le monstre a la force de l'armée du jour", () => {
		const army = { life: 12, strength: 9, magic: 4, speed: 3 };

		expect(budgetOf(budgetForLaunch(SEASON_START, army))).toEqual(army);
	});
});

describe("après chaque combat", () => {
	test("le jour est le numéro du combat : trois combats, jours 1, 2 et 3", () => {
		const second = after(SEASON_START, "defeat").state;
		const third = after(second, "victory").state;

		expect([SEASON_START, second, third].map(dayOf)).toEqual([1, 2, 3]);
	});

	test.each<Outcome>(["victory", "defeat", "exhaustion"])(
		"le dernier résultat est l'issue du combat : %s",
		(outcome) => {
			expect(after(SEASON_START, outcome).state.lastOutcome).toBe(outcome);
		},
	);

	test("l'état passe en JSON et en revient à l'identique, budget compris", () => {
		const state = wonBySmallArmy(after(SEASON_START, "defeat").state);

		expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
	});
});

describe("après une victoire", () => {
	test("au premier combat : chapitre 2, tentative 1, et son monstre vaut 10 recrues moyennes", () => {
		const { state } = after(SEASON_START, "victory");

		expect(state).toMatchObject({ chapter: 2, attempt: 1 });
		expectStatsCloseTo(nextBudget(state), TEN_RECRUITS);
	});

	test("au chapitre 1 après une défaite : le chapitre 2 vaut le plus grand de 10 recrues et de la formule", () => {
		// La formule (206,4…) dépasse 10 recrues (76…) sur chaque stat.
		const { state } = after(after(SEASON_START, "defeat").state, "victory");

		expect(state).toMatchObject({ chapter: 2, attempt: 1 });
		expectStatsCloseTo(nextBudget(state), EXAMPLE_BUDGET);
	});

	test("au chapitre 1 après une défaite, une armée restée petite : 10 recrues l'emportent", () => {
		const state = wonBySmallArmy(after(SEASON_START, "defeat").state);

		expectStatsCloseTo(nextBudget(state), TEN_RECRUITS);
	});

	test("au chapitre 2 et au-delà : la formule seule, fût-elle sous 10 recrues", () => {
		// Vie 10 + 0,7 × 1 × 7,6 = 15,32 ; Magie 10 + 5,25 ; Vitesse 10 + 5,11.
		const state = wonBySmallArmy(after(SEASON_START, "victory").state);

		expect(state).toMatchObject({ chapter: 3, attempt: 1 });
		expectStatsCloseTo(nextBudget(state), {
			life: 15.32,
			strength: 15.32,
			magic: 15.25,
			speed: 15.11,
		});
	});

	test("p reste tel quel, même baissé : le monstre suivant est fixé avec lui", () => {
		const lowered = defeats(chapterThree(), 2);
		const { state, recruitShare } = after(lowered.state, "victory", {
			recruitShare: lowered.recruitShare,
		});

		expect(recruitShare).toBe(0.6);
		expectStatsCloseTo(nextBudget(state), formulaAt(0.6));
	});

	test("les défaites de suite repartent de zéro : défaite, victoire, défaite ne baissent pas p", () => {
		const won = after(after(chapterThree(), "defeat").state, "victory").state;
		const { state, recruitShare } = after(won, "defeat");

		expect(recruitShare).toBe(0.7);
		expectStatsCloseTo(nextBudget(state), formulaAt(0.7));
	});
});

describe("après une défaite", () => {
	test("même chapitre, tentative + 1, et le même monstre au lancement suivant, l'armée eût-elle grossi", () => {
		const { state } = after(SEASON_START, "defeat");

		expect(state).toMatchObject({ chapter: 1, attempt: 2 });
		expect(nextBudget(state)).toEqual(ARMY_100);
	});

	test("par épuisement (garde-fou) : une défaite, comptée dans les défaites de suite", () => {
		const exhausted = after(chapterThree(), "exhaustion").state;
		const { recruitShare } = after(exhausted, "defeat");

		expect(exhausted).toMatchObject({ chapter: 3, attempt: 2 });
		expect(recruitShare).toBe(0.6);
	});
});

describe("les défaites de suite", () => {
	test("à la 2e : p baisse de 10 points et le monstre est recalculé avec lui", () => {
		const { state, recruitShare } = defeats(chapterThree(), 2);

		expect(recruitShare).toBe(0.6);
		// 100 + 0,6 × 20 × 7,6 = 191,2 ; 100 + 0,6 × 20 × 7,5 = 190 ; 100 + 0,6 × 20 × 7,3 = 187,6.
		expectStatsCloseTo(nextBudget(state), {
			life: 191.2,
			strength: 191.2,
			magic: 190,
			speed: 187.6,
		});
	});

	test("à la 3e : ni p ni le monstre ne changent", () => {
		const { state, recruitShare } = defeats(chapterThree(), 3);

		expect(recruitShare).toBe(0.6);
		expectStatsCloseTo(nextBudget(state), formulaAt(0.6));
	});

	test("à la 4e : p baisse de nouveau, et le monstre est recalculé encore", () => {
		const { state, recruitShare } = defeats(chapterThree(), 4);

		expect(recruitShare).toBe(0.5);
		expectStatsCloseTo(nextBudget(state), formulaAt(0.5));
	});

	test("p ne descend jamais sous 0 : 0,05 → 0, le monstre réduit à l'armée", () => {
		const fixed = after(after(SEASON_START, "victory").state, "victory", {
			recruitShare: 0.05,
		}).state;
		const { state, recruitShare } = defeats(fixed, 2, 0.05);

		expect(recruitShare).toBe(0);
		expect(nextBudget(state)).toEqual(ARMY_100);
	});

	test("chaque baisse tombe juste : de 0,7, sept paires de défaites mènent p à 0, sans résidu de virgule flottante", () => {
		const shares: number[] = [];
		let result = { state: chapterThree(), recruitShare: 0.7 };
		for (let pair = 0; pair < 7; pair++) {
			result = defeats(result.state, 2, result.recruitShare);
			shares.push(result.recruitShare);
		}

		expect(shares).toEqual([0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0]);
	});

	test.each([
		["le chapitre 1, l'armée seule", SEASON_START, ARMY_100],
		[
			"le chapitre 2 après une victoire au premier combat, 10 recrues",
			after(SEASON_START, "victory").state,
			TEN_RECRUITS,
		],
	])(
		"%s, sans terme en p : le monstre ne change pas, mais p baisse quand même",
		(_, start, budget) => {
			const { state, recruitShare } = defeats(start, 2);

			expect(recruitShare).toBe(0.6);
			expectStatsCloseTo(nextBudget(state), budget);
		},
	);

	test("p changé par le mainteneur avant la 1re : le même monstre, il ne se recalcule qu'à une paire", () => {
		const { state, recruitShare } = after(chapterThree(), "defeat", {
			recruitShare: 0.5,
		});

		expect(recruitShare).toBe(0.5);
		expectStatsCloseTo(nextBudget(state), formulaAt(0.7));
	});

	test("p relevé à 0,9 par le mainteneur après la 1re : à la 2e, p tombe à 0,8, mais le monstre fixé à 0,7 ne grossit pas", () => {
		const first = after(chapterThree(), "defeat").state;
		const { state, recruitShare } = after(first, "defeat", {
			recruitShare: 0.9,
		});

		expect(recruitShare).toBe(0.8);
		expectStatsCloseTo(nextBudget(state), formulaAt(0.7));
	});
});

describe("la fin de la saison", () => {
	/** Le chapitre `chapter`, au 34e combat de la saison. */
	function atChapter(chapter: number): SeasonState {
		return { ...chapterThree(), chapter, combatsPlayed: 33 };
	}

	test("victoire du chapitre 30 : saison terminée au jour de ce combat, sans monstre suivant", () => {
		const { state } = after(atChapter(30), "victory");

		expect(state).toMatchObject({ chapter: 30, endDay: 34, budget: null });
	});

	test("victoire du chapitre 29 : le chapitre 30, la saison continue", () => {
		const { state } = after(atChapter(29), "victory");

		expect(state).toMatchObject({ chapter: 30, endDay: null });
	});

	test.each([
		["lancer un combat", (state: SeasonState) => nextBudget(state)],
		["compter une victoire", (state: SeasonState) => after(state, "victory")],
		["compter une défaite", (state: SeasonState) => after(state, "defeat")],
	])("saison terminée : refus de %s, le message dit quand", (_, act) => {
		const ended = after(atChapter(30), "victory").state;

		expect(() => act(ended)).toThrow(
			new RangeError("saison 1 terminée au jour 34"),
		);
	});
});

describe("la graine d'un combat", () => {
	test("au premier combat : le SHA-256 de « 1:1:1 », en hexadécimal", () => {
		expect(seedOf(SEASON_START)).toBe(
			createHash("sha256").update("1:1:1").digest("hex"),
		);
	});

	test("même saison, même chapitre, même tentative : la même graine", () => {
		const coordinates = { season: 1, chapter: 4, attempt: 2 };

		expect(seedOf(coordinates)).toBe(seedOf({ ...coordinates }));
	});

	test.each([
		[
			{ season: 1, chapter: 1, attempt: 1 },
			{ season: 1, chapter: 1, attempt: 2 },
		],
		[
			{ season: 1, chapter: 11, attempt: 1 },
			{ season: 11, chapter: 1, attempt: 1 },
		],
		[
			{ season: 1, chapter: 1, attempt: 11 },
			{ season: 1, chapter: 11, attempt: 1 },
		],
	])("%o et %o : deux graines distinctes", (first, second) => {
		expect(seedOf(first)).not.toBe(seedOf(second));
	});
});
