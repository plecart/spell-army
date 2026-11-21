import { type FollowerProvider, listPasses, relaunchPass } from "joueurs";
import { z } from "zod";
import type { McpTool } from "./tool.ts";
import {
	PASS_KIND_OF,
	PASS_KINDS,
	toolPass,
	toToolPass,
} from "./vocabulary.ts";

// Le nombre de passes que rend lister_passes : 10 par défaut, au plus 100.
const DEFAULT_LISTED_PASSES = 10;
const MAX_LISTED_PASSES = 100;

// Le refus de relancer_passe quand le verrou de l'import est pris.
const PASS_RUNNING =
	"Passe en cours : rien n'a été lancé. Relancer une fois qu'elle est close (lister_passes).";

const listing = z.strictObject({
	nombre: z
		.int()
		.min(1)
		.max(MAX_LISTED_PASSES)
		.optional()
		.describe(
			`Le nombre de passes à rendre, de 1 à ${MAX_LISTED_PASSES} ; ${DEFAULT_LISTED_PASSES} par défaut.`,
		),
});

const relaunch = z.strictObject({
	type: z
		.enum(PASS_KINDS)
		.describe(
			"rapide : du haut de la liste jusqu'à une page sans nouvel abonné ; complete : la liste entière, en reprenant à son curseur la complète non terminée s'il y en a une.",
		),
});

export const listPassesTool: McpTool<typeof listing> = {
	name: "lister_passes",
	title: "Lister les passes de l'import",
	description: `Lit le journal de l'import des abonnés : les dernières passes, la plus récente d'abord, ${DEFAULT_LISTED_PASSES} par défaut. Pour chacune, son type, son déclencheur, son état, son début et sa fin (ISO 8601, la fin nulle tant qu'elle est en cours), les pages lues, les joueurs ajoutés, les entrées écartées par motif et l'erreur d'une passe en erreur.`,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: listing,
	output: z.strictObject({ passes: z.array(toolPass) }),
	run: async (executor, { nombre = DEFAULT_LISTED_PASSES }) => ({
		output: { passes: (await listPasses(executor, nombre)).map(toToolPass) },
	}),
};

/**
 * `relancer_passe` (ADR 0003, « Journal »), sur le fournisseur `provider`, construit à chaque
 * relance. L'outil gère ses transactions (ADR 0005, « Conséquences ») : le verrou de l'import se
 * voit des tics dès sa prise, et chaque page s'écrit dans la sienne. Les indices suivent leurs
 * définitions MCP : une relance inscrit des joueurs sans toucher aux présents, et ouvre une passe
 * au journal ou, pour une complète non terminée, poursuit sa ligne — elle en réécrit l'état et en
 * efface l'erreur, une mise à jour qui n'est pas purement additive : `destructiveHint` (ADR 0005,
 * « Conséquences ») ; deux relances relisent deux fois la liste, chez le fournisseur.
 */
export function relaunchPassTool(
	provider: () => FollowerProvider,
): McpTool<typeof relaunch> {
	return {
		name: "relancer_passe",
		title: "Relancer une passe de l'import",
		description:
			"Lance une passe de l'import des abonnés sous le verrou de l'import, comme le tic horaire : rapide, ou complète — une complète non terminée reprend alors à son curseur, sous son déclencheur d'origine. Attend la fin de la passe, qui ne commence plus de page passé 240 s, et la rend comme lister_passes. Si une passe est déjà en cours, répond « passe en cours » sans rien lancer.",
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: true,
		},
		ownsTransactions: true,
		input: relaunch,
		output: toolPass,
		run: async (executor, { type }) => {
			const pass = await relaunchPass(
				{ db: executor, provider: provider() },
				PASS_KIND_OF[type],
			);
			if (pass === null) {
				throw new Error(PASS_RUNNING);
			}
			const output = toToolPass(pass);
			return { output, after: output };
		},
	};
}
