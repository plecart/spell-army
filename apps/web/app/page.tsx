import { readDirectoryQuery } from "./annuaire/address.ts";
import { readDirectory } from "./annuaire/read-directory.tsx";

/**
 * La page d'accueil : l'annuaire des recrues, sous la recherche, le filtre et la page de l'adresse.
 * Elle lit l'adresse, donc se rend à chaque requête ; le CDN la garde (`next.config.ts`).
 */
export default async function Home({ searchParams }: PageProps<"/">) {
	return readDirectory(readDirectoryQuery(await searchParams));
}
