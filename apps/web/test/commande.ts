import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Ce que rend une commande lancée : son code de sortie et ses deux flux. */
export interface CommandRun {
	code: number;
	stdout: string;
	stderr: string;
}

/**
 * Lance par Node, hors de Vitest, le point d'entrée `script` de `scripts/` avec `args`, depuis `cwd`
 * (celui du test à défaut), dans l'environnement du test complété par `env` : une variable à
 * `undefined` en est retirée, Node ne transmettant pas une valeur `undefined` (`child_process`,
 * Node 24.3). C'est la frontière que les tests en processus ne voient pas : Node charge le point
 * d'entrée et les paquets en retirant leurs types.
 */
export function runScript(
	script: string,
	args: string[],
	env: Record<string, string | undefined>,
	cwd?: string,
): Promise<CommandRun> {
	const entryPoint = fileURLToPath(
		new URL(`../scripts/${script}`, import.meta.url),
	);
	return new Promise((resolve) => {
		execFile(
			process.execPath,
			[entryPoint, ...args],
			{ cwd, env: { ...process.env, ...env } },
			(error, stdout, stderr) =>
				resolve({ code: Number(error?.code ?? 0), stdout, stderr }),
		);
	});
}
