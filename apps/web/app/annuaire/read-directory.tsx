import { listVisiblePlayers } from "joueurs";
import { database } from "../environment.ts";
import { siteSettings } from "../site.ts";
import type { DirectoryQuery } from "./address.ts";
import { Directory } from "./directory.tsx";

/**
 * L'annuaire des recrues sous `query`, lu en base par la lecture gardée des joueurs visibles, son
 * titre au compte Instagram que règle l'environnement.
 */
export async function readDirectory(query: DirectoryQuery) {
	return (
		<Directory
			query={query}
			result={await listVisiblePlayers(database(), query)}
			instagramHandle={siteSettings().instagramHandle}
		/>
	);
}
