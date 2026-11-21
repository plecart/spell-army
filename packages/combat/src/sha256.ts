/**
 * SHA-256 (FIPS 180-4), écrit à la main : le moteur reste pur, sans module de Node (`node:crypto`)
 * ni Web Crypto, asynchrone. Il ne sert qu'à dériver les dés d'une graine (`dice.ts`), jamais à
 * protéger un secret.
 */

/** Les constantes des 64 rondes (FIPS 180-4 § 4.2.2). */
const ROUND_CONSTANTS = [
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
	0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
	0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
	0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
	0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** Le condensé de départ (FIPS 180-4 § 5.3.3). */
const INITIAL_HASH = [
	0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
	0x1f83d9ab, 0x5be0cd19,
];

const WORD_BYTES = 4;
const BLOCK_BYTES = 64;
/** La longueur du message en bits, écrite sur 64 bits à la fin du dernier bloc. */
const LENGTH_BYTES = 8;
const END_OF_MESSAGE = 0x80;

/** Les huit mots du condensé en cours, dans l'ordre a à h de FIPS 180-4. */
type Words = [number, number, number, number, number, number, number, number];

/**
 * Le condensé SHA-256 d'un texte, lu en UTF-8 : 32 octets, gros-boutistes comme le veut la norme.
 * Pur et synchrone.
 *
 * @example sha256("abc") commence par les octets 0xba, 0x78, 0x16, 0xbf.
 */
export function sha256(text: string): Uint8Array {
	const blocks = padded(new TextEncoder().encode(text));
	const hash = new DataView(new ArrayBuffer(INITIAL_HASH.length * WORD_BYTES));
	INITIAL_HASH.forEach((word, index) => {
		hash.setUint32(index * WORD_BYTES, word);
	});
	for (let offset = 0; offset < blocks.length; offset += BLOCK_BYTES) {
		compress(hash, blocks.subarray(offset, offset + BLOCK_BYTES));
	}
	return new Uint8Array(hash.buffer);
}

/**
 * Le message suivi d'un bit à 1, de zéros, puis de sa longueur en bits sur 64 bits gros-boutistes :
 * un multiple de 64 octets (FIPS 180-4 § 5.1.1).
 */
function padded(message: Uint8Array): Uint8Array {
	const length =
		Math.ceil((message.length + 1 + LENGTH_BYTES) / BLOCK_BYTES) * BLOCK_BYTES;
	const blocks = new Uint8Array(length);
	blocks.set(message);
	blocks[message.length] = END_OF_MESSAGE;
	new DataView(blocks.buffer).setBigUint64(
		length - LENGTH_BYTES,
		BigInt(message.length) * 8n,
	);
	return blocks;
}

/**
 * Mêle un bloc de 64 octets au condensé `hash`, modifié en place (FIPS 180-4 § 6.2.2). Les sommes
 * restent des entiers exacts sous 2⁵³ ; `>>> 0` et `setUint32` les ramènent modulo 2³².
 */
function compress(hash: DataView, block: Uint8Array): void {
	const schedule = messageSchedule(block);
	let [a, b, c, d, e, f, g, h] = readWords(hash);
	for (const [round, constant] of ROUND_CONSTANTS.entries()) {
		// T1 = h + Σ1(e) + Ch(e, f, g) + K + W ; T2 = Σ0(a) + Maj(a, b, c).
		const t1 =
			h +
			(rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
			((e & f) ^ (~e & g)) +
			constant +
			schedule.getUint32(round * WORD_BYTES);
		const t2 =
			(rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
		[h, g, f, e, d, c, b, a] = [
			g,
			f,
			e,
			(d + t1) >>> 0,
			c,
			b,
			a,
			(t1 + t2) >>> 0,
		];
	}
	[a, b, c, d, e, f, g, h].forEach((word, index) => {
		const at = index * WORD_BYTES;
		hash.setUint32(at, hash.getUint32(at) + word);
	});
}

/**
 * Les 64 mots W d'un bloc : ses 16 mots, puis σ1(W−2) + W−7 + σ0(W−15) + W−16 (FIPS 180-4
 * § 6.2.2, étape 1).
 */
function messageSchedule(block: Uint8Array): DataView {
	const schedule = new DataView(
		new ArrayBuffer(ROUND_CONSTANTS.length * WORD_BYTES),
	);
	new Uint8Array(schedule.buffer).set(block);
	const word = (index: number) => schedule.getUint32(index * WORD_BYTES);
	for (let t = BLOCK_BYTES / WORD_BYTES; t < ROUND_CONSTANTS.length; t++) {
		const w15 = word(t - 15);
		const w2 = word(t - 2);
		schedule.setUint32(
			t * WORD_BYTES,
			(rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) +
				word(t - 7) +
				(rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) +
				word(t - 16),
		);
	}
	return schedule;
}

function readWords(hash: DataView): Words {
	return Array.from({ length: INITIAL_HASH.length }, (_, index) =>
		hash.getUint32(index * WORD_BYTES),
	) as Words;
}

/** La rotation à droite d'un mot de 32 bits. */
function rotr(word: number, bits: number): number {
	return (word >>> bits) | (word << (32 - bits));
}
