import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { diceOf } from "../src/dice.ts";

// Aucun identifiant de 1 à 300 000 ne lit plus de 32 octets (relevé le 2026-11-17) : le passage au
// bloc suivant s'épingle ici, sur les dés eux-mêmes. Avec 256 faces, aucun octet n'est rejeté.
test("les dés lisent dans l'ordre les blocs SHA-256 de « domaine:identifiant:compteur »", () => {
	const dice = diceOf("stats", "42");
	const faces = Array.from({ length: 256 }, (_, face) => face);
	const read = Array.from({ length: 40 }, () => dice.pick(faces));
	const blocks = [0, 1].flatMap((counter) => [
		...createHash("sha256").update(`stats:42:${counter}`).digest(),
	]);

	expect(read).toEqual(blocks.slice(0, 40));
});

// Hors de 1 à 256 éléments, aucun octet ne serait accepté : le tirage doit échouer, pas boucler
// sans fin. Zéro, c'est une classe dont les maximums ne font pas 30, à court de stat ouverte : sans
// cet échec, la suite bloquerait avant que le test de validité des classes ne dise laquelle.
test.each([0, 257])("les dés refusent de tirer parmi %i éléments", (count) => {
	const items = Array.from({ length: count }, (_, index) => index);

	expect(() => diceOf("stats", "42").pick(items)).toThrow(
		new RangeError(`le tirage demande de 1 à 256 éléments, reçu : ${count}`),
	);
});
