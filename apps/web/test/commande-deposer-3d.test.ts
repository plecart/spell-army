import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { modelFiles } from "donnees";
import { glb } from "personnages/test/glb";
import { describe, expect, onTestFinished, test } from "vitest";
import { depositModel, REQUIRED_VARIABLES } from "../scripts/deposit-model.ts";
import { CONFORMING, DEVIATIONS, NON_CONFORMING } from "./fichiers-3d.ts";
import {
	ENDPOINT_URL,
	fetchFrom,
	registryEndpoint,
	type Serve,
	TOKEN,
} from "./montage.ts";
import { sha256 } from "./octets.ts";

const ENV = { MCP_URL: ENDPOINT_URL, MCP_TOKEN: TOKEN };
const ENTRY_POINT = fileURLToPath(
	new URL("../scripts/deposer-3d.ts", import.meta.url),
);

/** Un dossier temporaire, effacé à la fin du test, où chaque JSON de `files` est écrit en GLB. */
async function folderWith(files: Record<string, unknown>): Promise<string> {
	const folder = await mkdtemp(join(tmpdir(), "deposer-3d-"));
	onTestFinished(() => rm(folder, { recursive: true, force: true }));
	for (const [name, json] of Object.entries(files)) {
		await writeFile(join(folder, name), glb(json));
	}
	return folder;
}

/** Le point d'entrée du registre réel, qui garde chaque requête reçue, et sa base. */
async function recordingEndpoint() {
	const { db, endpoint } = await registryEndpoint();
	const requests: Request[] = [];
	const serve: Serve = (request) => {
		requests.push(request);
		return endpoint(request);
	};
	return { db, serve, requests };
}

describe("la commande deposer-3d", () => {
	test("un fichier conforme est déposé : elle rend son identifiant, sa taille et son empreinte, et le fichier est rangé", async () => {
		const { db, serve } = await recordingEndpoint();
		const folder = await folderWith({ "magicien.glb": CONFORMING });
		const bytes = glb(CONFORMING);
		expect(
			await depositModel(
				{ file: join(folder, "magicien.glb"), classe: "magicien" },
				ENV,
				fetchFrom(serve),
			),
		).toEqual({
			identifiant: 1,
			taille: bytes.length,
			empreinte: sha256(bytes),
		});
		expect(
			await db
				.select({ id: modelFiles.id, class: modelFiles.class })
				.from(modelFiles),
		).toEqual([{ id: 1, class: "wizard" }]);
	});

	test("un chemin relatif se lit depuis INIT_CWD, le dossier d'où pnpm est lancé", async () => {
		const { serve } = await recordingEndpoint();
		const folder = await folderWith({ "limace.glb": CONFORMING });
		const deposited = await depositModel(
			{ file: "limace.glb", monstre: "limace" },
			{ ...ENV, INIT_CWD: folder },
			fetchFrom(serve),
		);
		expect(deposited.identifiant).toBe(1);
	});

	test("un fichier non conforme est arrêté avant l'envoi, avec ses écarts", async () => {
		const { serve, requests } = await recordingEndpoint();
		const folder = await folderWith({ "magicien.glb": NON_CONFORMING });
		await expect(
			depositModel(
				{ file: join(folder, "magicien.glb"), classe: "magicien" },
				ENV,
				fetchFrom(serve),
			),
		).rejects.toThrow(new Error(DEVIATIONS));
		expect(requests).toEqual([]);
	});

	// Les variables que la commande exige sont `REQUIRED_VARIABLES` : chacune absente, puis vide,
	// puis toutes absentes.
	test.each<[string, Record<string, string>, string]>([
		...REQUIRED_VARIABLES.flatMap(
			(name): [string, Record<string, string>, string][] => {
				const others = Object.fromEntries(
					Object.entries(ENV).filter(([key]) => key !== name),
				);
				return [
					[`${name} absente`, others, name],
					[`${name} vide`, { ...others, [name]: "" }, name],
				];
			},
		),
		["les deux absentes", {}, REQUIRED_VARIABLES.join(", ")],
	])(
		"%s : arrêtée avant l'envoi, la variable nommée, aucune valeur écrite",
		async (_, env, names) => {
			const { serve, requests } = await recordingEndpoint();
			const folder = await folderWith({ "magicien.glb": CONFORMING });
			const refusal = depositModel(
				{ file: join(folder, "magicien.glb"), classe: "magicien" },
				env,
				fetchFrom(serve),
			);
			await expect(refusal).rejects.toThrow(
				new Error(
					`Variable(s) absente(s) ou vide(s) : ${names}. Renseigne-les dans le .env de la racine (docs/exploitation.md, « Déposer un fichier 3D »).`,
				),
			);
			expect(requests).toEqual([]);
		},
	);

	test("chaque variable que la commande exige est nommée dans .env.example, sans valeur", () => {
		const lines = readFileSync(
			new URL("../../../.env.example", import.meta.url),
			"utf8",
		).split(/\r?\n/);
		for (const name of REQUIRED_VARIABLES) {
			expect(lines).toContain(`${name}=`);
		}
	});

	test("un refus du serveur rend son message", async () => {
		const { serve } = await recordingEndpoint();
		const folder = await folderWith({ "limace.glb": CONFORMING });
		await expect(
			depositModel(
				{ file: join(folder, "limace.glb"), monstre: "m".repeat(65) },
				ENV,
				fetchFrom(serve),
			),
		).rejects.toThrow("<=64 characters");
	});

	test("un jeton que le serveur refuse : la commande le dit, sans écrire le jeton", async () => {
		const { serve } = await recordingEndpoint();
		const folder = await folderWith({ "magicien.glb": CONFORMING });
		const token = "x".repeat(32);
		const refusal = depositModel(
			{ file: join(folder, "magicien.glb"), classe: "magicien" },
			{ ...ENV, MCP_TOKEN: token },
			fetchFrom(serve),
		);
		await expect(refusal).rejects.toThrow(
			"Le serveur MCP refuse le jeton MCP_TOKEN (HTTP 401).",
		);
		await expect(refusal).rejects.not.toThrow(token);
	});
});

/** `serve` en HTTP sur un port libre de 127.0.0.1, fermé à la fin du test : son URL. */
async function listen(serve: Serve): Promise<string> {
	const server = createServer(async (incoming, outgoing) => {
		const chunks: Buffer[] = [];
		for await (const chunk of incoming) {
			chunks.push(chunk);
		}
		const body = Buffer.concat(chunks);
		const response = await serve(
			new Request(new URL(incoming.url ?? "/", "http://127.0.0.1"), {
				method: incoming.method,
				headers: incoming.headers as Record<string, string>,
				body: body.length > 0 ? body : undefined,
			}),
		);
		outgoing.writeHead(response.status, Object.fromEntries(response.headers));
		outgoing.end(Buffer.from(await response.arrayBuffer()));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	onTestFinished(() => {
		server.closeAllConnections();
		server.close();
	});
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mcp`;
}

/** Lance le point d'entrée par Node, hors de Vitest : son code de sortie et ses deux flux. */
function runEntryPoint(args: string[], env: Record<string, string>) {
	return new Promise<{ code: number; stdout: string; stderr: string }>(
		(resolve) => {
			execFile(
				process.execPath,
				[ENTRY_POINT, ...args],
				{ env: { ...process.env, ...env } },
				(error, stdout, stderr) =>
					resolve({ code: Number(error?.code ?? 0), stdout, stderr }),
			);
		},
	);
}

// La frontière que les tests en processus ne voient pas : Node, sans Vitest, charge le point
// d'entrée et `personnages` en retirant leurs types.
describe("le point d'entrée de deposer-3d, lancé par Node", () => {
	test("un fichier conforme : sortie 0, l'identifiant affiché", async () => {
		const { serve } = await recordingEndpoint();
		const folder = await folderWith({ "magicien.glb": CONFORMING });
		const bytes = glb(CONFORMING);
		expect(
			await runEntryPoint(
				[join(folder, "magicien.glb"), "--classe", "magicien"],
				{ MCP_URL: await listen(serve), MCP_TOKEN: TOKEN },
			),
		).toEqual({
			code: 0,
			stdout: `Fichier 3D déposé : identifiant 1, ${bytes.length} octets, SHA-256 ${sha256(bytes)}.\n`,
			stderr: "",
		});
	});

	test("un fichier non conforme : sortie 1, les écarts affichés, aucune requête", async () => {
		const { serve, requests } = await recordingEndpoint();
		const folder = await folderWith({ "magicien.glb": NON_CONFORMING });
		expect(
			await runEntryPoint(
				[join(folder, "magicien.glb"), "--classe", "magicien"],
				{ MCP_URL: await listen(serve), MCP_TOKEN: TOKEN },
			),
		).toEqual({ code: 1, stdout: "", stderr: `${DEVIATIONS}\n` });
		expect(requests).toEqual([]);
	});

	test("sans fichier : sortie 1, l'usage affiché", async () => {
		expect(await runEntryPoint(["--classe", "magicien"], ENV)).toEqual({
			code: 1,
			stdout: "",
			stderr:
				"Usage : pnpm --filter web deposer-3d <fichier.glb> --classe <classe>, ou --monstre <nom> ; <classe> parmi magicien, golem, guerrier, nain, vampire, druide, paysan, fee\n",
		});
	});
});
