import type { FollowerProvider } from "joueurs";
import { depositModelTool, setClassModelTool } from "./model-tools.ts";
import { listPassesTool, relaunchPassTool } from "./pass-tools.ts";
import { readSettingsTool, updateSettingsTool } from "./settings-tools.ts";
import {
	addSpellTool,
	listSpellsTool,
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
		depositModelTool,
		setClassModelTool,
		listPassesTool,
		relaunchPassTool(provider),
	];
}
