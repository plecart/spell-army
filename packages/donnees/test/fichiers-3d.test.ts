import { describe, expect, test } from "vitest";
import {
	type Executor,
	type ModelTarget,
	readClassDefaultModel,
	setClassDefaultModel,
	storeModelFile,
} from "../src/index.ts";
import { freshDatabase, waitForOneLockWaiter } from "./base-neuve.ts";

// « abc » et son empreinte SHA-256, que `createHash` de `node:crypto` rend à l'identique.
const ABC = new TextEncoder().encode("abc");
const ABC_SHA256 =
	"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

/** Range « abc » pour `target` et rend son identifiant. */
async function store(db: Executor, target: ModelTarget): Promise<number> {
	return (await storeModelFile(db, { target, content: ABC })).id;
}

describe("fichiers 3D", () => {
	test("un fichier de classe, puis un de monstre, sont rangés sous des identifiants successifs, avec la taille et l'empreinte de leurs octets", async () => {
		const db = await freshDatabase();
		const stored = { size: 3, sha256: ABC_SHA256 };
		expect(
			await storeModelFile(db, { target: { class: "wizard" }, content: ABC }),
		).toEqual({ id: 1, ...stored });
		expect(
			await storeModelFile(db, { target: { monster: "limace" }, content: ABC }),
		).toEqual({ id: 2, ...stored });
	});

	// La base refuse ces deux formes, quel que soit l'appelant.
	test.each<[string, Record<string, string>]>([
		["ni classe ni monstre", {}],
		["une classe et un monstre", { class: "wizard", monster: "limace" }],
	])("%s : refusé par la contrainte de la table", async (_, target) => {
		const db = await freshDatabase();
		await expect(
			storeModelFile(db, { target: target as ModelTarget, content: ABC }),
		).rejects.toMatchObject({
			cause: { code: "23514", constraint: "model_files_owner_check" },
		});
	});
});

describe("modèle par défaut d'une classe", () => {
	test("le premier réglage rend un avant nul ; le suivant remplace le fichier, qu'il rend pour avant", async () => {
		const db = await freshDatabase();
		const first = await store(db, { class: "wizard" });
		const second = await store(db, { class: "wizard" });
		expect(await setClassDefaultModel(db, "wizard", first)).toEqual({
			before: null,
			after: first,
		});
		expect(await setClassDefaultModel(db, "wizard", second)).toEqual({
			before: first,
			after: second,
		});
	});

	test("chaque classe a son propre modèle par défaut", async () => {
		const db = await freshDatabase();
		const wizard = await store(db, { class: "wizard" });
		const golem = await store(db, { class: "golem" });
		await setClassDefaultModel(db, "wizard", wizard);
		expect(await setClassDefaultModel(db, "golem", golem)).toEqual({
			before: null,
			after: golem,
		});
	});

	// Les trois fichiers qu'une classe refuse, sur une base qui porte le fichier 1 du magicien, réglé
	// par défaut, le 2 de la limace et le 3 du golem.
	test.each<[string, number, string]>([
		["un fichier inexistant", 99, "Aucun fichier 3D d'identifiant 99."],
		[
			"un fichier de monstre",
			2,
			"Le fichier 3D 2 est celui du monstre « limace », pas celui d'une classe.",
		],
		[
			"un fichier d'une autre classe",
			3,
			"Le fichier 3D 3 est celui d'une autre classe.",
		],
	])("%s : refusé, rien n'est écrit", async (_, fileId, message) => {
		const db = await freshDatabase();
		const wizard = await store(db, { class: "wizard" });
		await store(db, { monster: "limace" });
		await store(db, { class: "golem" });
		await setClassDefaultModel(db, "wizard", wizard);
		await expect(setClassDefaultModel(db, "wizard", fileId)).rejects.toThrow(
			message,
		);
		expect(await setClassDefaultModel(db, "wizard", wizard)).toEqual({
			before: wizard,
			after: wizard,
		});
	});

	test("le fichier du modèle par défaut se lit octet pour octet, celui du dernier réglage ; sans réglage, aucun", async () => {
		const db = await freshDatabase();
		// Les octets lus, en tableau : `pg` rend un `Buffer`, que `toEqual` distingue d'un `Uint8Array`.
		const read = async (characterClass: string) => {
			const model = await readClassDefaultModel(db, characterClass);
			return model && [...model];
		};
		const storeWizard = async (bytes: number[]) =>
			(
				await storeModelFile(db, {
					target: { class: "wizard" },
					content: new Uint8Array(bytes),
				})
			).id;
		const first = await storeWizard([1, 2, 3]);
		const second = await storeWizard([4, 5]);
		expect(await read("wizard")).toBeNull();
		await setClassDefaultModel(db, "wizard", first);
		expect(await read("wizard")).toEqual([1, 2, 3]);
		await setClassDefaultModel(db, "wizard", second);
		expect(await read("wizard")).toEqual([4, 5]);
		expect(await read("golem")).toBeNull();
	});

	test("un réglage concurrent attend le précédent et lit son après pour avant", async () => {
		const db = await freshDatabase();
		const [first, second, third] = [
			await store(db, { class: "wizard" }),
			await store(db, { class: "wizard" }),
			await store(db, { class: "wizard" }),
		];
		await setClassDefaultModel(db, "wizard", first);
		let concurrent: ReturnType<typeof setClassDefaultModel> | undefined;
		await db.transaction(async (tx) => {
			await setClassDefaultModel(tx, "wizard", second);
			concurrent = setClassDefaultModel(db, "wizard", third);
			await waitForOneLockWaiter(db);
		});
		expect(await concurrent).toEqual({ before: second, after: third });
	});
});
