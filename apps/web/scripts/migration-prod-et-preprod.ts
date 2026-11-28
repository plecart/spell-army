// La branche Git dont la prévisualisation est la pré-prod : le trunk du dépôt (ADR 0004,
// § Environnements ; `.claude/pipeline.config.md`, « Dépôt GitHub »).
const PREPROD_BRANCH = "main";

/**
 * Applique les migrations au build d'un déploiement de la prod ou de la pré-prod, chacun à sa
 * propre base (ADR 0004, § Environnements). Les deux se lisent dans des variables système de
 * Vercel (doc Vercel « System environment variables ») : la prod, `VERCEL_ENV` à `production` ;
 * la pré-prod, `VERCEL_ENV` à `preview` et `VERCEL_GIT_COMMIT_REF` à `main`. La prévisualisation
 * d'une autre branche n'a aucune base ; la CI et un build local n'ont pas ces variables. `run`
 * lance la commande `migration` du projet ; rend vrai si elle a été lancée.
 */
export function migrateOnProductionOrPreprodDeploy(
	env: { VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string },
	run: (command: string, args: string[]) => void,
): boolean {
	const preprod =
		env.VERCEL_ENV === "preview" &&
		env.VERCEL_GIT_COMMIT_REF === PREPROD_BRANCH;
	if (env.VERCEL_ENV !== "production" && !preprod) {
		return false;
	}
	run("pnpm", ["--filter", "donnees", "run", "migrate"]);
	return true;
}
