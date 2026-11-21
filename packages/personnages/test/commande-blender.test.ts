import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { classKeysOf, deviationReport } from "../scripts/blender.ts";
import { glb } from "./glb.ts";

/** Un fichier conforme : les cinq ancres, vides, `chapeau` sous `tete`, `sol` à l'origine. */
const CONFORMING = {
	asset: { version: "2.0" },
	nodes: [
		{ name: "tete", children: [1] },
		{ name: "chapeau" },
		{ name: "main_gauche" },
		{ name: "main_droite" },
		{ name: "sol" },
	],
};

/** Un seul écart : l'ancre `main_droite` renommée. */
const NON_CONFORMING = {
	...CONFORMING,
	nodes: CONFORMING.nodes.map((node) =>
		node.name === "main_droite" ? { name: "main" } : node,
	),
};

/** Les écarts de `NON_CONFORMING`, tels que le rapport les écrit sous le chemin du fichier. */
const DEVIATIONS = [
	"Le fichier ne respecte pas le contrat du fichier 3D (direction artistique § 7) :",
	"- ancres (main_droite) : L'ancre « main_droite » manque : ajoutez un nœud nommé « main_droite », vide si rien n'y pend.",
].join("\n");

describe("le rapport des modèles fabriqués", () => {
	let folder: string;
	const path = (name: string) => join(folder, name);

	beforeAll(async () => {
		folder = await mkdtemp(join(tmpdir(), "modeles-"));
		await writeFile(path("wizard.glb"), glb(CONFORMING));
		await writeFile(path("golem.glb"), glb(CONFORMING));
		await writeFile(path("warrior.glb"), glb(NON_CONFORMING));
		await writeFile(path("dwarf.glb"), glb(NON_CONFORMING));
	});

	afterAll(() => rm(folder, { recursive: true }));

	test("est vide quand chaque modèle respecte le contrat", () => {
		expect(deviationReport([path("wizard.glb"), path("golem.glb")])).toBe("");
	});

	test("nomme chaque modèle non conforme avec ses écarts, et lui seul", () => {
		expect(
			deviationReport([
				path("warrior.glb"),
				path("wizard.glb"),
				path("dwarf.glb"),
			]),
		).toBe(
			`${path("warrior.glb")}\n${DEVIATIONS}\n\n${path("dwarf.glb")}\n${DEVIATIONS}`,
		);
	});
});

describe("les classes d'une commande", () => {
	test("sont les huit classes, dans leur ordre, quand aucune n'est nommée", () => {
		expect(classKeysOf([])).toEqual([
			"wizard",
			"golem",
			"warrior",
			"dwarf",
			"vampire",
			"druid",
			"peasant",
			"fairy",
		]);
	});

	test("sont les classes nommées, dans l'ordre des classes, une fois chacune", () => {
		expect(classKeysOf(["dwarf", "wizard", "dwarf"])).toEqual([
			"wizard",
			"dwarf",
		]);
	});

	test("refusent une classe inconnue en la nommant", () => {
		expect(() => classKeysOf(["wizard", "magicien"])).toThrow(
			"Classe(s) inconnue(s) : magicien. Classes : wizard, golem, warrior, dwarf, vampire, druid, peasant, fairy.",
		);
	});
});
