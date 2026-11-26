import type { FollowerProvider } from "joueurs";
import { depositModelTool, setClassModelTool } from "./model-tools.ts";
import {
	createMonsterTool,
	listMonstersTool,
	removeMonsterTool,
} from "./monster-tools.ts";
import { listPassesTool, relaunchPassTool } from "./pass-tools.ts";
import {
	giveSpellTool,
	removePlayerTool,
	searchPlayerTool,
} from "./player-tools.ts";
import {
	chooseForcedTool,
	launchCombatTool,
	readLogTool,
	readSeasonTool,
} from "./season-tools.ts";
import { readSettingsTool, updateSettingsTool } from "./settings-tools.ts";
import {
	addSpellTool,
	listSpellsTool,
	measureSpellTool,
	updateSpellTool,
} from "./spell-tools.ts";
import type { McpTool } from "./tool.ts";

/**
 * Les outils que sert le serveur MCP (ADR 0005, « Conséquences ») : un outil s'ajoute ici.
 *
 * @param provider le fournisseur des abonnés, construit à chaque relance de `relancer_passe`.
 */
export function createRegistry(
	provider: () => FollowerProvider,
): readonly McpTool[] {
	return [
		readSettingsTool,
		updateSettingsTool,
		listSpellsTool,
		addSpellTool,
		updateSpellTool,
		measureSpellTool(),
		listMonstersTool,
		createMonsterTool(),
		removeMonsterTool,
		readSeasonTool,
		chooseForcedTool,
		launchCombatTool,
		readLogTool,
		depositModelTool,
		setClassModelTool,
		listPassesTool,
		relaunchPassTool(provider),
		searchPlayerTool,
		giveSpellTool,
		removePlayerTool,
	];
}
