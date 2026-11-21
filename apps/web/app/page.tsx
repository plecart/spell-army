import { listVisiblePlayers } from "joueurs";
import { Directory } from "./annuaire/directory.tsx";
import { readDirectoryQuery } from "./annuaire/address.ts";
import { database } from "./environment.ts";
import { siteSettings } from "./site.ts";

/**
 * La page d'accueil : l'annuaire des recrues, sous la recherche, le filtre et la page de l'adresse.
 * Elle lit l'adresse, donc se rend à chaque requête ; le CDN la garde (`next.config.ts`).
 */
export default async function Home({ searchParams }: PageProps<"/">) {
	const query = readDirectoryQuery(await searchParams);
	return (
		<Directory
			query={query}
			result={await listVisiblePlayers(database(), query)}
			instagramHandle={siteSettings().instagramHandle}
		/>
	);
}
