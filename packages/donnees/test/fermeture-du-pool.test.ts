import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, onTestFinished, test, vi } from "vitest";
import { closeClient, createClient } from "../src/client.ts";
import { applyMigrations } from "../src/migrate.ts";

const REPO_ROOT = new URL("../../../", import.meta.url);
const CLIENT = "packages/donnees/src/client.ts";

// Les ports qui bloquaient la fermeture du pool, mesurés le 2026-11-26 sur pg 8.23.1 : pg-pool garde
// dans sa liste le client dont la connexion a levé, et la fermeture ne se résolvait jamais.
test.each([
	["un port qui n'est pas un nombre", "?port=abc", undefined],
	["un port blanc", "?port=%20", undefined],
	["un port hors plage", "?port=65536", undefined],
	["un port négatif", "?port=-1", undefined],
	["un PGPORT qui n'est pas un nombre", "", "abc"],
])(
	"les migrations sur %s rejettent au lieu de bloquer",
	async (_, query, pgport) => {
		vi.stubEnv("PGPORT", pgport);
		await expect(
			applyMigrations(`postgresql://u:p@127.0.0.1/x${query}`),
		).rejects.toMatchObject({ cause: { code: "ERR_SOCKET_BAD_PORT" } });
	},
);

test("fermer un pool rend la main sans laisser de minuteur en attente", async () => {
	vi.useFakeTimers();
	onTestFinished(() => {
		vi.useRealTimers();
	});
	await closeClient(createClient("postgresql://u:p@127.0.0.1/x"));
	expect(vi.getTimerCount()).toBe(0);
});

// Les fermetures du pool hors tests, `chemin:ligne`, recomptées à chaque exécution par `git grep` sur
// la population du critère de #64, en chaîne fixe : population vivante, dont seul l'invariant
// s'épingle — chacune est celle de `closeClient` —, jamais un nombre ni une liste. `git grep` sort en
// 1 quand il ne trouve rien, au-delà sur une erreur : 128 pour un chemin ou une expression fautifs,
// 129 pour une option inconnue (git 2.47.1, mesuré le 2026-11-26).
function poolCloses(): string[] {
	const { status, stdout, stderr } = spawnSync(
		"git",
		[
			"grep",
			"-n",
			"-F",
			"$client.end(",
			"--",
			"apps",
			"packages",
			":!**/test/**",
		],
		{ cwd: fileURLToPath(REPO_ROOT), encoding: "utf8" },
	);
	expect([0, 1], stderr).toContain(status);
	return stdout
		.split("\n")
		.filter(Boolean)
		.map((hit) => hit.split(":").slice(0, 2).join(":"));
}

// `chemin:ligne` de chaque ligne de `closeClient`, de sa signature à son accolade finale.
function boundedCloseLines(): Set<string> {
	const lines = readFileSync(new URL(CLIENT, REPO_ROOT), "utf8").split("\n");
	const start = lines.findIndex((line) =>
		line.startsWith("export async function closeClient("),
	);
	expect(start, `closeClient introuvable dans ${CLIENT}`).toBeGreaterThan(-1);
	const end = lines.indexOf("}", start);
	return new Set(
		lines.slice(start, end + 1).map((_, i) => `${CLIENT}:${start + i + 1}`),
	);
}

const CLOSES = poolCloses();
const BOUNDED = boundedCloseLines();

// Sans elle, une recherche mal formée qui ne trouve rien laisserait le test suivant sans cas.
test("la recherche trouve la fermeture bornée elle-même", () => {
	expect(CLOSES.filter((close) => BOUNDED.has(close))).not.toEqual([]);
});

test.each(CLOSES)("%s ferme le pool par closeClient", (close) => {
	expect(BOUNDED.has(close), `${close} ferme le pool hors de closeClient`).toBe(
		true,
	);
});
