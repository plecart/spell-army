// Des fichiers d'image minimaux, écrits octet par octet selon leur format : de quoi éprouver la
// reconnaissance d'une image, ses dimensions et sa fin sans encodeur. Les références des formats
// sont citées dans `app/mcp/image.ts`.
import { crc32 } from "node:zlib";
import type { ImageType } from "../app/mcp/image.ts";

type Bytes = ArrayLike<number>;

function concat(...parts: Bytes[]): Uint8Array {
	return Buffer.concat(parts.map((part) => Uint8Array.from(part)));
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const u16be = (value: number) => [value >>> 8, value & 0xff];
const u32be = (value: number) => [
	...u16be(value >>> 16),
	...u16be(value & 0xffff),
];
const u16le = (value: number) => [value & 0xff, value >>> 8];
const u24le = (value: number) => [...u16le(value & 0xffff), value >>> 16];
const u32le = (value: number) => [
	...u16le(value & 0xffff),
	...u16le(value >>> 16),
];

/** Un morceau PNG : longueur, type, données et CRC du type et des données. */
function pngChunk(type: string, data: Bytes): Uint8Array {
	const typeAndData = concat(ascii(type), data);
	return concat(u32be(data.length), typeAndData, u32be(crc32(typeAndData)));
}

/** Les octets d'un PNG sans données d'image : signature, IHDR, IDAT vide et IEND. */
const PNG_MINIMUM_SIZE = 57;

/** Un PNG de `size` octets, complété par les données de son morceau IDAT. */
export function png(width: number, height: number, size = PNG_MINIMUM_SIZE) {
	return concat(
		[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
		// Profondeur 8, couleurs RVB, compression, filtre et entrelacement par défaut.
		pngChunk("IHDR", [...u32be(width), ...u32be(height), 8, 2, 0, 0, 0]),
		pngChunk("IDAT", new Uint8Array(size - PNG_MINIMUM_SIZE)),
		pngChunk("IEND", []),
	);
}

function jpegSegment(marker: number, data: Bytes): number[] {
	return [0xff, marker, ...u16be(data.length + 2), ...Array.from(data)];
}

/**
 * Un JPEG : SOI, un segment APP0, un octet de remplissage, l'en-tête de trame de marqueur
 * `frameMarker` (C0 : de base ; C2 : progressif), un scan et EOI.
 */
export function jpeg(width: number, height: number, frameMarker = 0xc0) {
	return concat(
		[0xff, 0xd8],
		jpegSegment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
		[0xff],
		// Précision 8 bits, hauteur, largeur, une composante.
		jpegSegment(frameMarker, [
			8,
			...u16be(height),
			...u16be(width),
			1,
			1,
			0x11,
			0,
		]),
		jpegSegment(0xda, [1, 1, 0, 0, 63, 0]),
		// Des données entropiques, dont un FF bourré d'un 00.
		[0x12, 0x34, 0xff, 0x00, 0x56],
		[0xff, 0xd9],
	);
}

/** Un morceau RIFF : code, taille, données, et un octet de bourrage après une taille impaire. */
function riffChunk(fourCC: string, data: Bytes): number[] {
	const padding = data.length % 2 === 1 ? [0] : [];
	return [
		...ascii(fourCC),
		...u32le(data.length),
		...Array.from(data),
		...padding,
	];
}

function webp(...chunks: number[][]): Uint8Array {
	const body = [...ascii("WEBP"), ...chunks.flat()];
	return concat(ascii("RIFF"), u32le(body.length), body);
}

// L'échelle, dans les 2 bits du haut de chaque dimension, n'en fait pas partie.
const VP8_SCALE = 0b01 << 14;

function vp8Chunk(width: number, height: number): number[] {
	return riffChunk("VP8 ", [
		...[0x10, 0x02, 0x00],
		...[0x9d, 0x01, 0x2a],
		...u16le(width | VP8_SCALE),
		...u16le(height | VP8_SCALE),
	]);
}

export const webpLossy = (width: number, height: number) =>
	webp(vp8Chunk(width, height));

// Le bit de transparence suit les 28 bits des dimensions.
const VP8L_ALPHA = 1 << 28;

export const webpLossless = (width: number, height: number) =>
	webp(
		riffChunk("VP8L", [
			0x2f,
			...u32le((width - 1) | ((height - 1) << 14) | VP8L_ALPHA),
		]),
	);

export const webpExtended = (width: number, height: number) =>
	webp(
		riffChunk("VP8X", [0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]),
		vp8Chunk(width, height),
	);

export const gif = (width: number, height: number) =>
	concat(ascii("GIF89a"), u16le(width), u16le(height), [0, 0, 0, 0x3b]);

/** Chaque forme de fichier admise : son nom, son type et son constructeur. */
export const IMAGE_FORMATS: [
	string,
	ImageType,
	(width: number, height: number) => Uint8Array,
][] = [
	["un PNG", "image/png", png],
	["un JPEG de base", "image/jpeg", jpeg],
	[
		"un JPEG progressif",
		"image/jpeg",
		(width, height) => jpeg(width, height, 0xc2),
	],
	["un WebP avec perte", "image/webp", webpLossy],
	["un WebP sans perte", "image/webp", webpLossless],
	["un WebP étendu", "image/webp", webpExtended],
];
