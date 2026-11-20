// Commande `pnpm --filter donnees run drift` : la porte de CI contre la dérive entre `schema.ts` et
// les migrations. Elle lance `drizzle-kit generate`, puis lit ce qu'il a laissé dans `migrations/`,
// et sort en 1 sur le message de `schemaDriftFailure` quand il produirait une migration. Une
// migration écrite à la main (`--custom`) a son instantané : elle ne fait pas dériver le schéma.
// Une dérive trouvée laisse dans `migrations/` les fichiers que drizzle-kit y a écrits.
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GENERATE_TIMEOUT_MS, schemaDriftFailure } from "./schema-drift.ts";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
// L'exécutable de drizzle-kit (`bin` de son package.json), voisin de son point d'entrée : ses
// `exports` ne l'exposent pas. Lancé par `node`, sans shell, il meurt seul au délai.
const DRIZZLE_KIT = fileURLToPath(
	new URL("bin.cjs", import.meta.resolve("drizzle-kit")),
);

// Entrée standard fermée : drizzle-kit ne peut attendre aucune réponse.
const generate = spawnSync(process.execPath, [DRIZZLE_KIT, "generate"], {
	cwd: PACKAGE_DIR,
	stdio: ["ignore", "pipe", "pipe"],
	timeout: GENERATE_TIMEOUT_MS,
	encoding: "utf8",
});
// `--untracked-files=normal` : une migration neuve est un fichier non suivi, qu'une configuration
// `status.showUntrackedFiles=no` tairait (`.claude/rules/cleanup-verbatim.md`).
const porcelain = execFileSync(
	"git",
	["status", "--porcelain", "--untracked-files=normal", "--", "migrations"],
	{ cwd: PACKAGE_DIR, encoding: "utf8" },
);
const failure = schemaDriftFailure(
	{
		status: generate.status,
		timedOut: (generate.error as NodeJS.ErrnoException)?.code === "ETIMEDOUT",
		stdout: generate.stdout,
		stderr: generate.stderr,
	},
	porcelain,
);
if (failure) {
	console.error(failure);
	process.exit(1);
}
console.log("Aucune dérive : schema.ts et les migrations concordent.");
