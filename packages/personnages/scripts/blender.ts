// Commandes `pnpm --filter personnages modeles [classe…]` et `rendus [classe…]` : Blender, lancé
// sans fenêtre, fabrique le GLB de chaque classe, jugé ensuite par `checkModel`, ou rend ses images
// de validation (README, « Fabriquer les modèles 3D »). Sortie 0, ou 1 avec la raison.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BACKDROPS,
	CLASS_COLORS,
	CLASS_KEYS,
	type ClassKey,
	checkModel,
	describeDeviations,
	PEDESTALS,
} from "../src/index.ts";

const SCRIPTS = fileURLToPath(new URL("../blender/", import.meta.url));
const OUT = fileURLToPath(new URL("../out/", import.meta.url));
const MODELS = join(OUT, "modeles");
const RENDERS = join(OUT, "rendus");

/**
 * Les classes que nomment `args`, dans l'ordre de `CLASS_KEYS` et une fois chacune ; toutes quand
 * `args` est vide. Lève une erreur qui nomme chaque argument qui n'est pas une classe.
 */
export function classKeysOf(args: readonly string[]): ClassKey[] {
	const unknown = args.filter(
		(arg) => !(CLASS_KEYS as readonly string[]).includes(arg),
	);
	if (unknown.length > 0) {
		throw new Error(
			`Classe(s) inconnue(s) : ${unknown.join(", ")}. Classes : ${CLASS_KEYS.join(", ")}.`,
		);
	}
	return CLASS_KEYS.filter((key) => args.length === 0 || args.includes(key));
}

/**
 * Les écarts au contrat du fichier 3D (direction artistique § 7) des GLB `paths` : pour chaque
 * fichier qui en a, son chemin puis ses écarts, un bloc par fichier, séparés d'une ligne vide ;
 * une chaîne vide quand tous sont conformes. Un fichier qui ne se lit pas lève l'erreur de Node.
 */
export function deviationReport(paths: readonly string[]): string {
	return paths
		.flatMap((path) => {
			const deviations = checkModel(readFileSync(path));
			return deviations.length === 0
				? []
				: [`${path}\n${describeDeviations(deviations)}`];
		})
		.join("\n\n");
}

/** Lance `script` du dossier `blender/` dans Blender sans fenêtre, `args` après `--`. */
function runBlender(script: string, args: readonly string[]): void {
	const blender = process.env.BLENDER || "blender";
	const { error, status } = spawnSync(
		blender,
		[
			"--background",
			"--factory-startup",
			"--python-exit-code",
			"1",
			"--python",
			join(SCRIPTS, script),
			"--",
			...args,
		],
		{ stdio: "inherit" },
	);
	if (error !== undefined) {
		throw new Error(
			`Blender ne se lance pas (« ${blender} ») : ${error.message}. Renseigne BLENDER, le chemin de blender.exe, dans le .env de la racine, ou mets Blender dans le PATH (README, « Fabriquer les modèles 3D »).`,
		);
	}
	if (status !== 0) {
		throw new Error(
			`Blender a échoué sur ${script} (sortie ${status}) : voir ses messages ci-dessus.`,
		);
	}
}

/**
 * Écrit `out/classes.json`, ce que les scripts Blender savent de chaque classe de `classKeys`, dans
 * cet ordre : sa couleur (`CLASS_COLORS`), son décor (`BACKDROPS`) et son socle (`PEDESTALS`). Rend
 * le chemin du fichier.
 */
function writeClasses(classKeys: readonly ClassKey[]): string {
	const file = join(OUT, "classes.json");
	writeFileSync(
		file,
		JSON.stringify(
			Object.fromEntries(
				classKeys.map((key) => [
					key,
					{
						color: CLASS_COLORS[key],
						backdrop: BACKDROPS[key],
						pedestal: PEDESTALS[key],
					},
				]),
			),
		),
	);
	return file;
}

/**
 * Fabrique `out/modeles/<classe>.glb` pour chaque classe, de la couleur de sa classe, puis juge
 * chaque fichier.
 */
function buildModels(classKeys: readonly ClassKey[]): void {
	mkdirSync(MODELS, { recursive: true });
	runBlender("build_models.py", [writeClasses(classKeys), MODELS]);
	const files = classKeys.map((key) => join(MODELS, `${key}.glb`));
	const report = deviationReport(files);
	if (report !== "") {
		throw new Error(report);
	}
	console.log(`Fichier(s) 3D conforme(s) au contrat :\n${files.join("\n")}`);
}

/**
 * Rend `out/rendus/<classe>.png` pour chaque classe, depuis son GLB fabriqué, sur son socle et
 * devant son décor, puis la planche.
 */
function renderPreviews(classKeys: readonly ClassKey[]): void {
	mkdirSync(RENDERS, { recursive: true });
	runBlender("render_previews.py", [writeClasses(classKeys), MODELS, RENDERS]);
	console.log(`Rendus écrits dans ${RENDERS}.`);
}

/** Les commandes, par nom ; chacune agit sur les classes que `classKeysOf` tire de ses arguments. */
const COMMANDS = new Map<string, (classKeys: readonly ClassKey[]) => void>([
	["modeles", buildModels],
	["rendus", renderPreviews],
]);

if (import.meta.main) {
	try {
		const [command = "", ...args] = process.argv.slice(2);
		const run = COMMANDS.get(command);
		if (run === undefined) {
			throw new Error(
				`Usage : pnpm --filter personnages ${[...COMMANDS.keys()].join("|")} [classe…] ; classes : ${CLASS_KEYS.join(", ")}, toutes si aucune n'est nommée.`,
			);
		}
		run(classKeysOf(args));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
