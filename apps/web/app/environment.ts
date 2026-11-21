// Ce que les routes construisent depuis l'environnement, à la requête : rien ne se lit ni ne se
// connecte au chargement du module, que fait `next build`.
import { createClient } from "donnees";
import { createHikerApiProvider, type FollowerProvider } from "joueurs";

let client: ReturnType<typeof createClient> | undefined;

/** Le client de la base, créé au premier usage sur `DATABASE_URL`, puis réutilisé. */
export function database() {
	if (!client) {
		const url = process.env.DATABASE_URL;
		if (!url) {
			throw new Error("DATABASE_URL absent : l'application n'a pas de base.");
		}
		client = createClient(url);
	}
	return client;
}

/**
 * Le fournisseur des abonnés, l'adaptateur HikerAPI construit à chaque appel sur
 * `HIKERAPI_ACCESS_KEY` et `INSTAGRAM_ACCOUNT_ID`.
 *
 * @throws l'erreur de `createHikerApiProvider`, à son message fixe, quand l'une manque ou est
 * invalide.
 */
export function followerProvider(): FollowerProvider {
	return createHikerApiProvider({
		accessKey: process.env.HIKERAPI_ACCESS_KEY ?? "",
		accountId: process.env.INSTAGRAM_ACCOUNT_ID ?? "",
	});
}
