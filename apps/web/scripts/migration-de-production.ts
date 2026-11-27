/**
 * Applique les migrations au build du seul déploiement de production : `env.VERCEL_ENV`, variable
 * système de Vercel, vaut `production` (doc Vercel « System environment variables »). Une
 * prévisualisation migrerait la base de pré-production depuis une branche non mergée ; la CI et un
 * build local n'ont pas la variable. `run` lance la commande `migration` du projet ; rend vrai si
 * elle a été lancée.
 */
export function migrateOnProductionDeploy(
	env: { VERCEL_ENV?: string },
	run: (command: string, args: string[]) => void,
): boolean {
	if (env.VERCEL_ENV !== "production") {
		return false;
	}
	run("pnpm", ["--filter", "donnees", "run", "migrate"]);
	return true;
}
