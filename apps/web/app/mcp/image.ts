/**
 * Le type et les dimensions d'une image, lus dans ses octets sans la décoder ni dépendance native :
 * PNG, JPEG ou WebP. Rien n'est validé au-delà : un fichier mal formé ailleurs passe, un fichier
 * tronqué non (chaque format y dit où il finit).
 */

/** Les types d'image qu'admet la réserve de sorts. */
export type ImageType = "image/png" | "image/jpeg" | "image/webp";

/** Le type et les dimensions d'une image, en pixels. */
export interface ImageInfo {
	type: ImageType;
	width: number;
	height: number;
}

type Size = Pick<ImageInfo, "width" | "height">;

/** Un lecteur d'un format : la taille d'une image de ce format, ou `undefined` pour une autre. */
type Reader = (view: DataView) => Size | undefined;

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** Les octets de `view` à partir de `offset` commencent par `expected`. */
function matches(
	view: DataView,
	offset: number,
	expected: readonly number[],
): boolean {
	return (
		offset + expected.length <= view.byteLength &&
		expected.every((byte, index) => view.getUint8(offset + index) === byte)
	);
}

/** `expected` se trouve dans `view` à partir de `from`. */
function includesFrom(
	view: DataView,
	expected: readonly number[],
	from: number,
): boolean {
	for (
		let offset = from;
		offset + expected.length <= view.byteLength;
		offset++
	) {
		if (matches(view, offset, expected)) return true;
	}
	return false;
}

// PNG (W3C, ISO/IEC 15948), « PNG signature », puis « Chunk layout » : chaque morceau porte sa
// longueur sur 4 octets gros-boutistes, son type, ses données et un CRC sur 4 octets. Le premier,
// « IHDR Image header », donne largeur et hauteur sur 4 octets aux octets 16 et 20 ; le dernier,
// « IEND Image trailer », est vide et son CRC constant.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IEND = [0, 0, 0, 0, ...ascii("IEND"), 0xae, 0x42, 0x60, 0x82];
const PNG_CHUNK_OVERHEAD = 12;

function readPng(view: DataView): Size | undefined {
	if (!matches(view, 0, PNG_SIGNATURE)) return undefined;
	for (let offset = PNG_SIGNATURE.length; !matches(view, offset, PNG_IEND); ) {
		offset += PNG_CHUNK_OVERHEAD + view.getUint32(offset);
	}
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

// JPEG (ITU-T T.81, annexe B) : SOI, puis des segments, chacun un marqueur FF xx, que précèdent
// d'éventuels octets de remplissage FF, et une longueur sur 2 octets gros-boutistes qui se compte
// elle-même. L'en-tête de trame (« Frame header syntax », marqueurs SOFn de la table B.1 : C0 à CF
// sauf DHT C4, JPG C8 et DAC CC) porte la précision sur 1 octet, puis la hauteur et la largeur sur
// 2. Les données de l'image le suivent ; le fichier finit à EOI.
const JPEG_SOI = [0xff, 0xd8];
const JPEG_EOI = [0xff, 0xd9];
const JPEG_FILL = 0xff;
const JPEG_NOT_FRAME_HEADERS = [0xc4, 0xc8, 0xcc];

function isFrameHeader(marker: number): boolean {
	return (
		marker >= 0xc0 && marker <= 0xcf && !JPEG_NOT_FRAME_HEADERS.includes(marker)
	);
}

function readJpeg(view: DataView): Size | undefined {
	if (!matches(view, 0, JPEG_SOI)) return undefined;
	let offset = JPEG_SOI.length;
	for (;;) {
		while (view.getUint8(offset) === JPEG_FILL) offset++;
		const marker = view.getUint8(offset++);
		if (isFrameHeader(marker)) {
			return includesFrom(view, JPEG_EOI, offset)
				? {
						height: view.getUint16(offset + 3),
						width: view.getUint16(offset + 5),
					}
				: undefined;
		}
		offset += view.getUint16(offset);
	}
}

// WebP (RFC 9649), « RIFF Header » : « RIFF », la taille du fichier comptée à partir de l'octet 8
// sur 4 octets petit-boutistes, « WEBP » ; puis le premier morceau, son code sur 4 octets, sa
// taille sur 4, et ses données à l'octet 20, lues selon le code.
const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");
const RIFF_HEADER = 8;
const WEBP_FIRST_CHUNK = 12;
const WEBP_PAYLOAD = 20;
const FOURTEEN_BITS = 0x3fff;

function fourCC(view: DataView, offset: number): string {
	return String.fromCharCode(
		...[0, 1, 2, 3].map((index) => view.getUint8(offset + index)),
	);
}

function uint24(view: DataView, offset: number): number {
	return view.getUint16(offset, true) | (view.getUint8(offset + 2) << 16);
}

// « Simple File Format (Lossy) », données VP8 (RFC 6386 § 9.1, « Uncompressed Data Chunk ») : 3
// octets d'étiquette de trame et 3 de code de départ, puis largeur et hauteur sur 2 octets
// petit-boutistes, dont les 2 bits du haut sont l'échelle.
function readVp8(view: DataView): Size {
	return {
		width: view.getUint16(WEBP_PAYLOAD + 6, true) & FOURTEEN_BITS,
		height: view.getUint16(WEBP_PAYLOAD + 8, true) & FOURTEEN_BITS,
	};
}

// « Simple File Format (Lossless) » : la signature 2F, puis largeur − 1 et hauteur − 1 sur 14 bits
// chacune, petit-boutistes.
function readVp8l(view: DataView): Size {
	const bits = view.getUint32(WEBP_PAYLOAD + 1, true);
	return {
		width: (bits & FOURTEEN_BITS) + 1,
		height: ((bits >>> 14) & FOURTEEN_BITS) + 1,
	};
}

// « Extended File Format » : 4 octets de drapeaux et réservés, puis largeur − 1 et hauteur − 1 du
// canevas sur 3 octets petit-boutistes.
function readVp8x(view: DataView): Size {
	return {
		width: uint24(view, WEBP_PAYLOAD + 4) + 1,
		height: uint24(view, WEBP_PAYLOAD + 7) + 1,
	};
}

const WEBP_READERS = new Map<string, Reader>([
	["VP8 ", readVp8],
	["VP8L", readVp8l],
	["VP8X", readVp8x],
]);

function readWebp(view: DataView): Size | undefined {
	if (
		!matches(view, 0, RIFF) ||
		!matches(view, RIFF_HEADER, WEBP) ||
		RIFF_HEADER + view.getUint32(4, true) > view.byteLength
	) {
		return undefined;
	}
	return WEBP_READERS.get(fourCC(view, WEBP_FIRST_CHUNK))?.(view);
}

const READERS: [ImageType, Reader][] = [
	["image/png", readPng],
	["image/jpeg", readJpeg],
	["image/webp", readWebp],
];

/**
 * Le type de `bytes`, reconnu à ses premiers octets, et ses dimensions ; `undefined` pour un
 * fichier d'un autre type, ou tronqué avant la fin que son format déclare. Des octets après cette
 * fin ne comptent pas, comme pour un décodeur.
 */
export function readImageInfo(bytes: Uint8Array): ImageInfo | undefined {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	try {
		for (const [type, read] of READERS) {
			const size = read(view);
			if (size) return { type, ...size };
		}
	} catch (error) {
		// Une lecture au-delà du dernier octet : le fichier est tronqué.
		if (!(error instanceof RangeError)) throw error;
	}
	return undefined;
}
