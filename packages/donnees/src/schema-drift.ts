/** L'issue d'un `drizzle-kit generate` lancé par la porte. */
export interface GenerateRun {
	/** Le code de sortie ; `null` quand le processus a été tué. */
	status: number | null;
	/** Vrai quand la porte l'a tué au bout de `GENERATE_TIMEOUT_MS`. */
	timedOut: boolean;
	stdout: string;
	stderr: string;
}

/** Le délai laissé à `drizzle-kit generate`, qui finit en quelques secondes. */
export const GENERATE_TIMEOUT_MS = 60_000;

// La ligne que drizzle-kit écrit quand il ne trouve rien à migrer (`writeResult` de son `bin.cjs`,
// 0.31.11, lu le 2026-11-20) : la seule preuve que le diff a abouti, puisqu'il sort en 0 même
// quand une erreur l'interrompt.
const NO_CHANGES = "No schema changes, nothing to migrate";
const RUN_IT_IN_A_TERMINAL =
	"Lance-le dans un terminal : pnpm --filter donnees exec drizzle-kit generate.";

/**
 * Le verdict de la porte contre la dérive entre `schema.ts` et les migrations, d'après
 * `drizzle-kit generate` et les lignes de `git status --porcelain` sur `migrations/` après lui :
 * `undefined` quand rien n'est à migrer, sinon le message d'échec. La porte ne passe que si
 * drizzle-kit a fini à temps, sorti en 0, rien écrit, et affirmé qu'il n'avait rien à migrer : il
 * tait certaines erreurs, dont la question qu'il pose sur un renommage sans terminal pour y répondre.
 */
export function schemaDriftFailure(
	generate: GenerateRun,
	porcelain: string,
): string | undefined {
	const output = `${generate.stdout}${generate.stderr}`;
	if (generate.timedOut) {
		return `drizzle-kit generate n'a pas fini en ${GENERATE_TIMEOUT_MS / 1000} s : il attend sans doute une réponse. ${RUN_IT_IN_A_TERMINAL}\n${output}`;
	}
	if (generate.status !== 0) {
		return `drizzle-kit generate a échoué (code ${generate.status}).\n${output}`;
	}
	const changes = porcelain.trimEnd();
	if (changes !== "") {
		return `schema.ts a dérivé des migrations : drizzle-kit generate a écrit la migration qui manque. Génère-la et commite-la avec le changement du schéma.\n${changes}`;
	}
	if (!generate.stdout.includes(NO_CHANGES)) {
		return `drizzle-kit generate n'a pas affirmé l'absence de changement (« ${NO_CHANGES} ») : une erreur ou une question restée sans réponse, sur un renommage par exemple. ${RUN_IT_IN_A_TERMINAL}\n${output}`;
	}
	return undefined;
}
