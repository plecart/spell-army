import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const { scripts } = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
// Le script `migrate` tel que package.json le donne à `node`, sans `--env-file-if-exists` :
// aucun test ne lit le `.env`.
const [, ...MIGRATE_ARGS] = (scripts.migrate as string)
	.split(" ")
	.filter((arg) => !arg.startsWith("--env-file"));

test("sans DATABASE_URL, la commande de migration sort en 1 sur la ligne qui le dit", () => {
	const { status, stderr } = spawnSync(process.execPath, MIGRATE_ARGS, {
		cwd: PACKAGE_DIR,
		env: { ...process.env, DATABASE_URL: "" },
		encoding: "utf8",
	});
	expect({ status, stderr }).toEqual({
		status: 1,
		stderr: expect.stringMatching(/^DATABASE_URL est vide[^\n]*$/m),
	});
});
