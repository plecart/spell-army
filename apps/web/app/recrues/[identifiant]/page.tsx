import { readDirectoryQuery } from "../../annuaire/address.ts";
import { readDirectory } from "../../annuaire/read-directory.tsx";
import { FicheSheet } from "../../fiche/fiche.tsx";
import { readFiche } from "../../fiche/read-fiche.ts";

/**
 * La fiche d'une recrue ouverte directement, d'un lien partagé ou d'un rechargement : posée sur
 * l'annuaire à sa page 1, sans recherche ni filtre, elle se referme vers `/`. Une recrue retirée,
 * inconnue ou à l'identifiant hors forme rend 404 (`readFiche`).
 */
export default async function RecruitPage({
	params,
}: PageProps<"/recrues/[identifiant]">) {
	const player = await readFiche((await params).identifiant);
	return (
		<>
			{await readDirectory(readDirectoryQuery({}))}
			<FicheSheet player={player} onClose="home" />
		</>
	);
}
