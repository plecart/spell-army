import { FicheSheet } from "../../../fiche/fiche.tsx";
import { readFiche } from "../../../fiche/read-fiche.ts";

/**
 * La fiche d'une recrue ouverte d'un clic sur sa carte : Next.js intercepte la navigation vers
 * `/recrues/<identifiant>` et rend la fiche dans l'emplacement `@fiche`, par-dessus l'annuaire
 * laissé dans son état ; elle se referme d'un pas en arrière. Une recrue retirée, inconnue ou à
 * l'identifiant hors forme rend 404 (`readFiche`).
 */
export default async function InterceptedFiche({
	params,
}: PageProps<"/recrues/[identifiant]">) {
	return (
		<FicheSheet
			player={await readFiche((await params).identifiant)}
			onClose="back"
		/>
	);
}
