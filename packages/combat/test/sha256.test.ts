import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { sha256 } from "../src/sha256.ts";

function hex(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("hex");
}

// Les exemples de NIST pour SHA-256 (FIPS 180-4) : un bloc, un message vide, deux blocs.
test.each([
	[
		"le message vide",
		"",
		"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
	],
	[
		"« abc »",
		"abc",
		"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
	],
	[
		"le message de 448 bits",
		"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
		"248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
	],
])("SHA-256 de %s : le condensé de FIPS 180-4", (_, message, digest) => {
	expect(hex(sha256(message))).toBe(digest);
});

// Les longueurs autour des bords du remplissage (55, 56, 63, 64 octets…) et un texte hors ASCII,
// lu en UTF-8 des deux côtés.
test.each([
	"a".repeat(55),
	"a".repeat(56),
	"a".repeat(63),
	"a".repeat(64),
	"a".repeat(65),
	"a".repeat(119),
	"a".repeat(120),
	"army:Météore ⚡:0",
])("SHA-256 rend le condensé de node:crypto (%#)", (message) => {
	expect(hex(sha256(message))).toBe(
		createHash("sha256").update(message).digest("hex"),
	);
});
