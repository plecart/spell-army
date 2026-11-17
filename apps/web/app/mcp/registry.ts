import { readSettingsTool, updateSettingsTool } from "./settings-tools.ts";
import type { McpTool } from "./tool.ts";

/** Les outils que sert le serveur MCP (ADR 0005, « Conséquences ») : un outil s'ajoute ici. */
export const registry: readonly McpTool[] = [
	readSettingsTool,
	updateSettingsTool,
];
