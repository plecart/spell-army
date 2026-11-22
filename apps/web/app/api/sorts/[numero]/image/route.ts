import { readSpellImage } from "donnees";
import { database } from "../../../../environment.ts";
import { storedFileResponse } from "../../../stored-file.ts";

// Un numéro de sort par sa forme : un entier positif sans zéro de tête, de 9 chiffres au plus, sous
// la borne d'un `integer` de Postgres (2 147 483 647).
const SPELL_NUMBER = /^[1-9][0-9]{0,8}$/;

/**
 * L'image du sort `numero` (direction artistique § 4, « Visuel »), lue en base, sous le type stocké
 * avec elle. Le navigateur et le CDN la gardent une heure. `numero` est la seule chose lue de la
 * requête ; hors de la forme d'un numéro, il rend 404 sans joindre la base, un sort absent ou sans
 * image aussi.
 */
export async function GET(
	_request: Request,
	{ params }: RouteContext<"/api/sorts/[numero]/image">,
) {
	const { numero } = await params;
	return storedFileResponse(
		SPELL_NUMBER.test(numero) &&
			(await readSpellImage(database(), Number(numero))),
	);
}
