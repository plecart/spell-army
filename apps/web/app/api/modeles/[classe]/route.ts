import { readClassDefaultModel } from "donnees";
import { CLASS_KEYS } from "personnages";
import { database } from "../../../environment.ts";

/**
 * Le fichier GLB du modèle par défaut de la classe `classe` (direction artistique § 5, « Valeurs
 * par défaut »), lu en base. Le navigateur et le CDN le gardent une heure. `classe` est une clé de
 * `CLASS_KEYS` (`wizard`…), seule chose lue de la requête ; une autre valeur rend 404 sans joindre
 * la base, une classe sans modèle aussi.
 */
export async function GET(
	_request: Request,
	{ params }: RouteContext<"/api/modeles/[classe]">,
) {
	const { classe } = await params;
	const classKey = CLASS_KEYS.find((key) => key === classe);
	const model = classKey && (await readClassDefaultModel(database(), classKey));
	if (!model) {
		return new Response(null, { status: 404 });
	}
	// Une copie sur son propre `ArrayBuffer` : le type de corps qu'accepte `Response`.
	return new Response(new Uint8Array(model), {
		headers: {
			"Content-Type": "model/gltf-binary",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
