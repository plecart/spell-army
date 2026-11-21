// La logique de la commande `pnpm --filter web deposer-3d`, dont `deposer-3d.ts` est le point
// d'entrée : vérifier un GLB sur le poste, puis l'envoyer à l'outil `deposer_fichier_3d` du serveur
// MCP. Le contenu du fichier ne passe jamais par le modèle (issue #15, « Décisions »).
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	Client,
	type FetchLike,
	SdkHttpError,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { checkModel, describeDeviations } from "personnages";

/** Ce que la commande reçoit de sa ligne : le chemin du GLB, et sa classe ou son monstre. */
export interface DepositArgs {
	file: string;
	classe?: string;
	monstre?: string;
}

/** Ce que `deposer_fichier_3d` rend d'un fichier rangé. */
export interface DepositedFile {
	identifiant: number;
	taille: number;
	empreinte: string;
}

type Env = Record<string, string | undefined>;

const UNAUTHORIZED = 401;

/** Les variables d'environnement que la commande exige, hors `INIT_CWD` qui a son repli. */
export const REQUIRED_VARIABLES = ["MCP_URL", "MCP_TOKEN"] as const;

/**
 * Les valeurs des variables `names` de `env` ; une erreur qui nomme celles qui manquent ou sont
 * vides, sans écrire aucune valeur.
 */
function readVariables<const Name extends string>(
	env: Env,
	names: readonly Name[],
): Record<Name, string> {
	const missing = names.filter((name) => !env[name]);
	if (missing.length > 0) {
		throw new Error(
			`Variable(s) absente(s) ou vide(s) : ${missing.join(", ")}. Renseigne-les dans le .env de la racine (docs/exploitation.md, « Déposer un fichier 3D »).`,
		);
	}
	return Object.fromEntries(names.map((name) => [name, env[name]])) as Record<
		Name,
		string
	>;
}

/**
 * Lit le GLB `file`, le vérifie contre le contrat du fichier 3D, puis l'envoie à l'outil
 * `deposer_fichier_3d` du serveur MCP de `MCP_URL`, en `Authorization: Bearer` avec `MCP_TOKEN`, et
 * rend ce que l'outil rend. `file` se résout contre `INIT_CWD`, le dossier d'où pnpm a été lancé, à
 * défaut contre le dossier courant. `fetch` remplace celui du transport, pour les tests.
 *
 * Lève une erreur, à afficher telle quelle. Avant tout envoi : un fichier qui ne se lit pas, avec le
 * message de Node ; un fichier non conforme, dont elle liste les écarts ; une variable absente,
 * qu'elle nomme sans jamais en écrire la valeur. Après : un jeton refusé ; le refus de l'outil, dont
 * elle rend le message, celui de Zod pour une entrée que le schéma refuse.
 */
export async function depositModel(
	{ file, classe, monstre }: DepositArgs,
	env: Env,
	fetch?: FetchLike,
): Promise<DepositedFile> {
	const bytes = await readFile(resolve(env.INIT_CWD ?? process.cwd(), file));
	const deviations = checkModel(bytes);
	if (deviations.length > 0) {
		throw new Error(describeDeviations(deviations));
	}
	const { MCP_URL, MCP_TOKEN } = readVariables(env, REQUIRED_VARIABLES);
	const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
		fetch,
		requestInit: { headers: { authorization: `Bearer ${MCP_TOKEN}` } },
	});
	// Le client de Claude Code négocie la spécification 2026-07-28 (ADR 0005, « Conséquences »).
	const client = new Client(
		{ name: "deposer-3d", version: "1.0.0" },
		{ versionNegotiation: { mode: "auto" } },
	);
	try {
		await client.connect(transport);
		const { content, structuredContent, isError } = await client.callTool({
			name: "deposer_fichier_3d",
			arguments: { classe, monstre, contenu: bytes.toString("base64") },
		});
		if (isError) {
			throw new Error(
				content
					.flatMap((block) => (block.type === "text" ? [block.text] : []))
					.join("\n"),
			);
		}
		return structuredContent as unknown as DepositedFile;
	} catch (error) {
		if (error instanceof SdkHttpError && error.status === UNAUTHORIZED) {
			throw new Error(
				`Le serveur MCP refuse le jeton MCP_TOKEN (HTTP ${UNAUTHORIZED}).`,
			);
		}
		throw error;
	} finally {
		await client.close();
	}
}
