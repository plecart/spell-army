// Commande `pnpm --filter web deposer-3d <fichier.glb> --classe <classe>`, ou `--monstre <nom>` :
// dépose un fichier 3D par le serveur MCP (README, « Déposer un fichier 3D »). Sortie 0 avec
// l'identifiant du fichier rangé, 1 avec la raison du refus.
import { parseArgs } from "node:util";
import { depositModel } from "./deposit-model.ts";

const USAGE =
	"Usage : pnpm --filter web deposer-3d <fichier.glb> --classe <classe>, ou --monstre <nom>";

try {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: { classe: { type: "string" }, monstre: { type: "string" } },
	});
	const [file] = positionals;
	if (file === undefined || positionals.length > 1) {
		throw new Error(USAGE);
	}
	const { identifiant, taille, empreinte } = await depositModel(
		{ file, ...values },
		process.env,
	);
	console.log(
		`Fichier 3D déposé : identifiant ${identifiant}, ${taille} octets, SHA-256 ${empreinte}.`,
	);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
