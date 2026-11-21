import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { bagOf, diceOf } from "../src/dice.ts";

const INTEGER_RANGE = 2 ** 48;

/**
 * Les entiers de 48 bits que les dés doivent lire, recalculés par `node:crypto` : six octets
 * gros-boutistes à la suite dans SHA-256(`<flux>:<graine>:0`), puis SHA-256(`<flux>:<graine>:1`).
 */
function referenceIntegers(stream: string, seed: string): number[] {
	const bytes = Buffer.concat(
		[0, 1].map((counter) =>
			createHash("sha256").update(`${stream}:${seed}:${counter}`).digest(),
		),
	);
	return Array.from({ length: 10 }, (_, index) =>
		bytes.readUIntBE(index * 6, 6),
	);
}

describe("les dés d'une graine", () => {
	test.each(["", 1])(
		"une graine qui n'est pas un texte non vide (%j) est refusée",
		(seed) => {
			expect(() => diceOf("army", seed as string)).toThrow(
				new RangeError("la graine doit être un texte non vide"),
			);
		},
	);

	test.each(["army", "monster"] as const)(
		"le flux « %s » lit à la suite les octets de SHA-256(flux:graine:compteur)",
		(stream) => {
			const dice = diceOf(stream, "graine");
			// Le sixième tirage prend les octets 30 à 35 : il passe du compteur 0 au compteur 1.
			const drawn = Array.from({ length: 6 }, () => dice.index(INTEGER_RANGE));

			expect(drawn).toEqual(referenceIntegers(stream, "graine").slice(0, 6));
		},
	);

	test("un rang se tire parmi plus de 256 éléments", () => {
		const dice = diceOf("army", "1");
		const drawn = Array.from({ length: 200 }, () => dice.index(1000));

		expect(drawn.every((index) => index >= 0 && index < 1000)).toBe(true);
		expect(drawn.some((index) => index >= 256)).toBe(true);
	});

	test("un entier de la dernière tranche incomplète est rejeté : le dé passe au suivant", () => {
		// Sur 2⁴⁷ + 1 éléments, la tranche incomplète va de 2⁴⁷ + 1 à 2⁴⁸ − 1 : près d'un entier sur
		// deux. La graine « 1 » y tombe au premier entier, pas au deuxième.
		const length = 2 ** 47 + 1;
		const [first = 0, second = 0] = referenceIntegers("army", "1");
		expect(first).toBeGreaterThanOrEqual(length);
		expect(second).toBeLessThan(length);

		expect(diceOf("army", "1").index(length)).toBe(second);
	});

	test.each([0, 1.5, INTEGER_RANGE + 1])(
		"une longueur hors de 1 à 2⁴⁸ (%d) est refusée",
		(length) => {
			expect(() => diceOf("army", "1").index(length)).toThrow(RangeError);
		},
	);
});

describe("le tirage sans remise", () => {
	test("chaque élément sort une fois avant qu'un autre ne ressorte, et le sac vidé se remplit", () => {
		const items = ["a", "b", "c", "d", "e"];
		const draw = bagOf(items, diceOf("army", "1"));
		const rounds = Array.from({ length: 3 }, () =>
			Array.from({ length: items.length }, draw).toSorted(),
		);

		expect(rounds).toEqual([items, items, items]);
	});
});
