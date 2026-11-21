import { INSTAGRAM_ID_PATTERN, INSTAGRAM_USERNAME_PATTERN } from "donnees";
import {
	type FoundPlayer,
	giveSpell,
	MAX_FOUND_PLAYERS,
	searchPlayers,
} from "joueurs";
import { z } from "zod";
import type { McpTool } from "./tool.ts";
import { CLASSES } from "./vocabulary.ts";

// Les formes Instagram de `donnees`, en entrée comme en sortie : un pseudo rendu à Claude reste un
// champ court et nettoyé (ADR 0003, « Pseudos, données non fiables »).
const instagramId = z.string().regex(INSTAGRAM_ID_PATTERN);
const username = z.string().regex(INSTAGRAM_USERNAME_PATTERN);

const search = z.strictObject({
	pseudo: username.describe(
		"Une partie du pseudo, prise littéralement, sans tenir compte des majuscules : 1 à 30 lettres ASCII, chiffres, « . » ou « _ ».",
	),
});

const gift = z.strictObject({
	identifiant: instagramId.describe(
		"L'identifiant du joueur, tel que chercher_joueur le rend.",
	),
	sort: z
		.int32()
		.min(1)
		.describe("Le numéro du sort à donner, tel que lister_sorts le rend."),
});

const toolPlayer = z.strictObject({
	identifiant: instagramId,
	pseudo: username,
	classe: z.enum(CLASSES),
	sort: z.strictObject({ numero: z.int(), nom: z.string() }),
});

/** Le joueur trouvé `player` sous les noms des outils, champ par champ : rien d'autre ne passe. */
function toToolPlayer(player: FoundPlayer): z.output<typeof toolPlayer> {
	return {
		identifiant: player.instagramId,
		pseudo: player.username,
		classe: CLASSES[player.class],
		sort: { numero: player.spell.number, nom: player.spell.name },
	};
}

export const searchPlayerTool: McpTool<typeof search> = {
	name: "chercher_joueur",
	title: "Chercher un joueur",
	description: `Cherche les joueurs dont le pseudo contient la partie donnée, sans tenir compte des majuscules : au plus ${MAX_FOUND_PLAYERS}, triés par pseudo dans l'ordre des octets (majuscules avant minuscules) ; tronque vaut vrai quand d'autres correspondent aussi. Rend, pour chacun, son identifiant, son pseudo, sa classe, et le numéro et le nom de son sort, aucun autre texte.`,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: search,
	output: z.strictObject({
		joueurs: z.array(toolPlayer),
		tronque: z.boolean(),
	}),
	run: async (executor, { pseudo }) => {
		const { players, truncated } = await searchPlayers(executor, pseudo);
		return {
			output: { joueurs: players.map(toToolPlayer), tronque: truncated },
		};
	},
};

/**
 * `destructiveHint` : le don écrase en place le sort du joueur (définition MCP, ADR 0005,
 * « Conséquences »). Comme `modifier_reglages`, l'outil ne demande pas de confirmation : l'audit
 * garde l'ancien numéro. `idempotentHint` : N appels identiques laissent le même état.
 */
export const giveSpellTool: McpTool<typeof gift> = {
	name: "donner_sort",
	title: "Donner un sort à un joueur",
	description:
		"Remplace le sort d'un joueur, désigné par son identifiant, par le sort de ce numéro dans la réserve, poids 0 compris : un sort de poids 0 ne se tire jamais à l'inscription, il ne se donne qu'ainsi. Refuse un identifiant sans joueur, celui d'un joueur retiré compris, puis un numéro sans sort, sans rien changer. Rend l'identifiant et le nouveau numéro ; le journal d'audit garde l'ancien et le nouveau.",
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: gift,
	output: gift,
	run: async (executor, { identifiant, sort }) => {
		const { before, after } = await giveSpell(executor, identifiant, sort);
		const output = { identifiant, sort: after };
		return { output, before: { identifiant, sort: before }, after: output };
	},
};
