import { characterOf, type VerdictLevel, verdictOf } from "personnages";
import { population } from "personnages/test/identifiants";
import { expect, test } from "vitest";
import { verdictPhraseOf } from "../app/fiche/verdict-phrase.ts";

// Un vampire de chaque niveau, trouvé par `idsOf` et `verdictOf`.
test.each<[VerdictLevel, string, string]>([
	["ill_born", "21", "Un vampire mal né. Heureusement, l'armée est nombreuse."],
	["weak", "17", "Un vampire un peu juste. Le courage fera le reste."],
	["average", "4", "Un vampire dans la moyenne. Ni héros, ni boulet."],
	["gifted", "20", "Un vampire doué. Le monstre n'a qu'à bien se tenir."],
	["excellent", "60", "Un vampire d'exception. Les bardes en parlent déjà."],
])("un vampire %s (« %s ») : %s", (level, id, phrase) => {
	const character = characterOf(id);
	expect({
		class: character.class,
		level: verdictOf(character),
		phrase: verdictPhraseOf(character),
	}).toEqual({ class: "vampire", level, phrase });
});

test("une fée s'accorde au féminin (« 51 »)", () => {
	expect(verdictPhraseOf(characterOf("51"))).toBe(
		"Une fée douée. Le monstre n'a qu'à bien se tenir.",
	);
});

// Les barres de la fiche montrent les stats : la phrase n'en cite aucune valeur.
test("aucune phrase de verdict ne contient de chiffre, sur les identifiants 1 à 100 000", () => {
	const phrases = new Set(population().map(verdictPhraseOf));
	expect([...phrases].filter((phrase) => /\d/.test(phrase))).toEqual([]);
});
