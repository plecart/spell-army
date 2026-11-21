import { INSTAGRAM_ID_PATTERN, INSTAGRAM_USERNAME_PATTERN } from "donnees";
import { type FoundPlayer, MAX_FOUND_PLAYERS, searchPlayers } from "joueurs";
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
