import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { type WikiFiles, writeFolder } from "../scripts/wiki/folder.ts";
import { filesOf, outputFolder } from "./wiki.ts";

const FILES: WikiFiles = new Map<string, string | Uint8Array>([
	["Home.md", "Accueil\n"],
	["images/sort-6.png", new Uint8Array([137, 80, 78, 71])],
]);

describe("le dossier du wiki", () => {
	test("absent, il est créé, et le wiki y est écrit", async () => {
		const folder = await outputFolder();
		await writeFolder(folder, FILES);
		expect((await filesOf(folder)).sort()).toEqual([
			"Home.md",
			"images/sort-6.png",
		]);
	});

	test("s'il ne porte que .git, il reçoit le wiki, et .git reste intact", async () => {
		const folder = await outputFolder();
		await mkdir(join(folder, ".git"), { recursive: true });
		await writeFile(join(folder, ".git", "HEAD"), "ref: refs/heads/master\n");
		await writeFolder(folder, FILES);
		expect((await filesOf(folder)).sort()).toEqual([
			".git/HEAD",
			"Home.md",
			"images/sort-6.png",
		]);
		expect(await readFile(join(folder, ".git", "HEAD"), "utf8")).toBe(
			"ref: refs/heads/master\n",
		);
	});

	test("s'il porte autre chose que .git, il est refusé, sans rien y écrire ni effacer", async () => {
		const folder = await outputFolder();
		await mkdir(folder);
		await writeFile(join(folder, "Home.md"), "ancien\n");
		await expect(writeFolder(folder, FILES)).rejects.toMatchObject({
			message: `Le dossier ${folder} n'est pas vide : la génération n'écrit que dans un dossier vide, où seul .git est toléré.`,
		});
		expect(await filesOf(folder)).toEqual(["Home.md"]);
		expect(await readFile(join(folder, "Home.md"), "utf8")).toBe("ancien\n");
	});
});
