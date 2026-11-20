// Des fichiers GLB 2.0 assemblés en mémoire, pour les fixtures du contrat 3D (glTF 2.0, « Binary
// glTF Layout ») : en-tête de 12 octets, morceau JSON, morceau BIN facultatif.

const MAGIC = 0x46546c67; // « glTF » en ASCII, lu en petit-boutiste
const VERSION = 2;
const JSON_CHUNK = 0x4e4f534a; // « JSON »
export const BIN_CHUNK = 0x004e4942; // « BIN »
const JSON_START = 20; // en-tête de 12 octets, puis longueur et type du morceau JSON
const CHUNK_HEADER = 8;
const SPACE = 0x20;

/** Le GLB d'un objet JSON ; `size` comme pour `glbOf`. */
export function glb(gltf: unknown, size?: number): Uint8Array {
	return glbOf(new TextEncoder().encode(JSON.stringify(gltf)), size);
}

/**
 * Le GLB d'un morceau JSON donné octet par octet, complété d'espaces jusqu'à un multiple de 4.
 * Avec `size`, un morceau BIN de zéros porte le fichier à `size` octets.
 */
export function glbOf(json: Uint8Array, size?: number): Uint8Array {
	const jsonLength = Math.ceil(json.length / 4) * 4;
	const jsonEnd = JSON_START + jsonLength;
	const bytes = new Uint8Array(size ?? jsonEnd);
	const view = new DataView(bytes.buffer);
	const header = [MAGIC, VERSION, bytes.length, jsonLength, JSON_CHUNK];
	for (const [index, word] of header.entries()) {
		view.setUint32(4 * index, word, true);
	}
	bytes.fill(SPACE, JSON_START, jsonEnd);
	bytes.set(json, JSON_START);
	if (size !== undefined) {
		view.setUint32(jsonEnd, size - jsonEnd - CHUNK_HEADER, true);
		view.setUint32(jsonEnd + 4, BIN_CHUNK, true);
	}
	return bytes;
}

/** Une copie de `bytes` dont le mot de 32 bits à `offset` vaut `word`, en petit-boutiste. */
export function withWord(
	bytes: Uint8Array,
	offset: number,
	word: number,
): Uint8Array {
	const copy = bytes.slice();
	new DataView(copy.buffer).setUint32(offset, word, true);
	return copy;
}
