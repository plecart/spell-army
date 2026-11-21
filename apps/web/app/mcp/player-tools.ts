import { INSTAGRAM_ID_PATTERN, INSTAGRAM_USERNAME_PATTERN } from "donnees";
import {
	type FoundPlayer,
	giveSpell,
	MAX_FOUND_PLAYERS,
	previewRemoval,
	type RemovalEffect,
	type RemovalPreview,
	removePlayer,
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

const removal = z.strictObject({
	identifiant: instagramId.describe(
		"L'identifiant à retirer, d'un joueur ou non, tel que chercher_joueur le rend ; jamais un pseudo.",
	),
});

// Le nom de chaque effet d'un retrait dans les outils.
const REMOVAL_EFFECTS = {
	removed: "joueur_retire",
	excluded: "identifiant_exclu",
	already_excluded: "deja_exclu",
} as const satisfies Record<RemovalEffect, string>;

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

/**
 * Ce que fera le retrait de `identifiant` d'après `preview`, pour le mainteneur, pseudo compris :
 * rendue à Claude, cette description n'entre dans aucune ligne d'audit.
 */
function describeRemoval(identifiant: string, preview: RemovalPreview): string {
	switch (preview.effect) {
		case "removed":
			return `Supprimera le joueur @${preview.username} (identifiant ${identifiant}) : sa ligne entière, avec sa date d'arrivée, son sort et son modèle ; et exclura définitivement son identifiant de l'import, qui ne le recréera jamais. Sans annulation.`;
		case "excluded":
			return `Aucun joueur d'identifiant ${identifiant} : exclura seulement cet identifiant, définitivement, de l'import, qui n'en créera jamais le joueur. Sans annulation.`;
		case "already_excluded":
			return `L'identifiant ${identifiant} est déjà exclu, sans joueur : rien à faire.`;
	}
}

/**
 * `retirer_joueur` (ADR 0003, « RGPD »), outil destructeur : l'enrobage exige un code de
 * confirmation (ADR 0005, « Décisions », ligne « Confirmation »), et `confirmation` décrit le
 * retrait d'après `previewRemoval`. `destructiveHint` : il supprime une ligne ; `idempotentHint` :
 * N retraits identiques laissent le même état, d'où un code rejoué sans effet de plus. Aucun pseudo
 * dans sa sortie ni dans son audit, qui garde l'entrée et l'après ; la description de la
 * confirmation, rendue à Claude, le nomme.
 */
export const removePlayerTool: McpTool<typeof removal> = {
	name: "retirer_joueur",
	title: "Retirer un joueur",
	description:
		"Retire un joueur, désigné par son identifiant, jamais par son pseudo : supprime sa ligne, pseudo, date d'arrivée, sort et modèle compris, et exclut son identifiant de l'import, qui ne le recrée jamais. Un identifiant sans joueur est seulement exclu ; un identifiant déjà exclu ne change rien. Sans annulation. Rend l'identifiant et l'effet : joueur_retire, identifiant_exclu ou deja_exclu.",
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: removal,
	output: z.strictObject({
		identifiant: instagramId,
		effet: z.enum(REMOVAL_EFFECTS),
	}),
	confirmation: async (executor, { identifiant }) =>
		describeRemoval(identifiant, await previewRemoval(executor, identifiant)),
	run: async (executor, { identifiant }) => {
		const effect = await removePlayer(executor, identifiant);
		const output = { identifiant, effet: REMOVAL_EFFECTS[effect] };
		return { output, after: output };
	},
};
