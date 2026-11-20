import { describe, expect, test } from "vitest";
import { readImageInfo } from "../app/mcp/image.ts";
import { gif, IMAGE_FORMATS, pngWithFirstChunk } from "./images.ts";

// 1 200 × 900, la plus petite image d'un sort ; 16 383 × 1, la plus grande largeur d'un WebP avec
// perte (14 bits) et la plus petite hauteur.
const SIZES = [
	[1200, 900],
	[16383, 1],
] as const;

// Ce qu'on retire d'un fichier pour le tronquer, en nombre d'octets gardés sur sa longueur.
const CUTS: [string, (length: number) => number][] = [
	["son dernier octet", (length) => length - 1],
	["sa seconde moitié", (length) => Math.floor(length / 2)],
	["tout après ses 10 premiers octets", () => 10],
];

const TEXT = new TextEncoder().encode("Ceci n'est pas une image.");

describe("lecture d'une image", () => {
	test.each(
		IMAGE_FORMATS.flatMap(([format, type, build]) =>
			SIZES.map(
				([width, height]) => [format, width, height, type, build] as const,
			),
		),
	)(
		"%s de %i × %i : son type et ses dimensions",
		(_, width, height, type, build) => {
			expect(readImageInfo(build(width, height))).toEqual({
				type,
				width,
				height,
			});
		},
	);

	test.each(IMAGE_FORMATS)(
		"%s suivi d'octets après sa fin se lit, comme le lisent les décodeurs",
		(_, type, build) => {
			const trailed = Buffer.concat([build(1200, 900), Uint8Array.of(0, 1, 2)]);
			expect(readImageInfo(trailed)).toEqual({
				type,
				width: 1200,
				height: 900,
			});
		},
	);

	test.each(
		IMAGE_FORMATS.flatMap(([format, , build]) =>
			CUTS.map(([cut, kept]) => [format, cut, build, kept] as const),
		),
	)("%s privé de %s : refusé", (_, __, build, kept) => {
		const bytes = build(1200, 900);
		expect(
			readImageInfo(bytes.subarray(0, kept(bytes.length))),
		).toBeUndefined();
	});

	// Un PNG dont IHDR n'est pas le premier morceau, ou n'a pas ses 13 octets, dit aux octets 16 et
	// 20 des dimensions arbitraires : ici 1 200 × 900, la plus petite image d'un sort.
	test.each([
		["un GIF", gif(1200, 900)],
		["du texte", TEXT],
		["un fichier vide", new Uint8Array()],
		[
			"un PNG dont le premier morceau n'est pas IHDR",
			pngWithFirstChunk("tEXt", 1200, 900),
		],
		["un PNG dont IHDR n'a que 8 octets", pngWithFirstChunk("IHDR", 1200, 900)],
	])("%s : refusé", (_, bytes) => {
		expect(readImageInfo(bytes)).toBeUndefined();
	});
});
