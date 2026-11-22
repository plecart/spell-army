import { characterOf, type VerdictLevel, verdictOf } from "personnages";
import { expect, test } from "vitest";
import { STAT_LABELS, verdictPhraseOf } from "../app/fiche/verdict-phrase.ts";

// Les phrases s'écrivent ici en toutes lettres, une espace insécable (U+00A0) avant le deux-points.

// Un vampire de chaque niveau, trouvé par `idsOf` et `verdictOf` : ses deux stats fortes sont citées.
test.each<[VerdictLevel, string, string]>([
	[
		"ill_born",
		"21",
		"Un vampire mal né\u00a0: Magie 6, Vitesse 6. Heureusement, l'armée est nombreuse.",
	],
	[
		"weak",
		"17",
		"Un vampire un peu juste\u00a0: Magie 8, Vitesse 7. Le courage fera le reste.",
	],
	["average", "4", "Un vampire dans la moyenne\u00a0: Magie 7, Vitesse 9."],
	[
		"gifted",
		"20",
		"Un vampire doué\u00a0: Magie 11, Vitesse 8. Le monstre n'a qu'à bien se tenir.",
	],
	[
		"excellent",
		"60",
		"Un vampire d'exception\u00a0: Magie 8, Vitesse 12. Les bardes en parlent déjà.",
	],
])("un vampire %s (« %s ») : %s", (level, id, phrase) => {
	const character = characterOf(id);
	expect({
		class: character.class,
		level: verdictOf(character),
		phrase: verdictPhraseOf(character),
	}).toEqual({ class: "vampire", level, phrase });
});

test.each([
	[
		"un paysan ne cite que sa meilleure stat",
		"57",
		"Un paysan d'exception\u00a0: Magie 13. Les bardes en parlent déjà.",
	],
	[
		"un paysan à égalité cite la première de STAT_KEYS (Vie 8, Magie 8)",
		"74",
		"Un paysan mal né\u00a0: Vie 8. Heureusement, l'armée est nombreuse.",
	],
	[
		"une fée s'accorde au féminin",
		"51",
		"Une fée douée\u00a0: Magie 13, Vitesse 12. Le monstre n'a qu'à bien se tenir.",
	],
	[
		"un magicien ne cite que Magie",
		"11",
		"Un magicien dans la moyenne\u00a0: Magie 12.",
	],
])("%s (« %s »)", (_, id, phrase) => {
	expect(verdictPhraseOf(characterOf(id))).toBe(phrase);
});

test("les stats se nomment Vie, Force, Magie et Vitesse", () => {
	expect(STAT_LABELS).toEqual({
		life: "Vie",
		strength: "Force",
		magic: "Magie",
		speed: "Vitesse",
	});
});
