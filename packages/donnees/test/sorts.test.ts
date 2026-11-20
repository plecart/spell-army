import { eq } from "drizzle-orm";
import { describe, expect, onTestFinished, test } from "vitest";
import {
	createClient,
	findSpellByKey,
	insertSpell,
	listSpells,
	type NewSpell,
	readDrawablePool,
	readSpell,
	type SpellPatch,
	spells,
	updateSpell,
} from "../src/index.ts";
import { UNREACHABLE_DATABASE_URL } from "./base-de-test.ts";
import { freshDatabase, waitForOneLockWaiter } from "./base-neuve.ts";

// Un sort hors de la réserve de départ, de clé propre : `donnees` ne lit pas le modèle de `combat`.
const NEW_SPELL: NewSpell = {
	name: "Sort d'essai",
	recipe: { kind: "shares", shares: { magic: 100 } },
	form: { kind: "safe" },
	effect: { base: "armyStat", damage: { constant: 0.9, perGauge: 0 } },
	key: "essai",
	weight: 1,
	description: "Dégâts d'essai.",
};

// « abc » et son empreinte SHA-256, que `createHash` de `node:crypto` rend à l'identique.
const ABC = new TextEncoder().encode("abc");
const ABC_SHA256 =
	"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const PNG_IMAGE = { bytes: ABC, type: "image/png" };
const PNG_SUMMARY = { type: "image/png", size: 3, sha256: ABC_SHA256 };
// Les numéros de la réserve de départ, que pose la migration `0004_reserve_de_depart`.
const STARTING_NUMBERS = Array.from({ length: 24 }, (_, index) => index + 1);

describe("sorts", () => {
	test("sur une table vide, un sort ajouté prend le numéro 1 et se liste tel qu'écrit", async () => {
		const db = await freshDatabase();
		await db.delete(spells);
		const added = { number: 1, ...NEW_SPELL, image: null };
		expect(await insertSpell(db, NEW_SPELL)).toEqual(added);
		expect(await listSpells(db)).toEqual([added]);
	});

	test("après la réserve de départ, un sort ajouté prend le numéro 25", async () => {
		const db = await freshDatabase();
		expect((await insertSpell(db, NEW_SPELL)).number).toBe(25);
	});

	test("readSpell rend le sort d'un numéro, et lève une erreur qui nomme un numéro inconnu", async () => {
		const db = await freshDatabase();
		const added = await insertSpell(db, NEW_SPELL);
		expect(await readSpell(db, added.number)).toEqual(added);
		await expect(readSpell(db, 999)).rejects.toThrow(
			"Aucun sort de numéro 999.",
		);
	});

	test("une clé déjà présente est refusée par l'index unique", async () => {
		const db = await freshDatabase();
		await insertSpell(db, NEW_SPELL);
		await expect(
			insertSpell(db, { ...NEW_SPELL, name: "Sort en double" }),
		).rejects.toMatchObject({
			cause: { code: "23505", constraint: "spells_key_unique" },
		});
	});

	// La limite que porte le `ponytail:` d'`insertSpell` : un ajout concurrent échoue, il n'écrase pas.
	test("deux ajouts simultanés : le second attend le premier, puis échoue sur la clé primaire sans rien écrire", async () => {
		const db = await freshDatabase();
		// L'échec du second, capté dès l'appel : il peut arriver avant que la transaction rende la main.
		let concurrentError: Promise<unknown> | undefined;
		const first = await db.transaction(async (tx) => {
			const first = await insertSpell(tx, NEW_SPELL);
			concurrentError = insertSpell(db, { ...NEW_SPELL, key: "essai-2" }).then(
				() => undefined,
				(error: unknown) => error,
			);
			await waitForOneLockWaiter(db);
			return first;
		});
		expect(await concurrentError).toMatchObject({
			cause: { code: "23505", constraint: "spells_pkey" },
		});
		expect((await listSpells(db)).slice(STARTING_NUMBERS.length)).toEqual([
			first,
		]);
	});

	test("findSpellByKey nomme le sort d'une clé, et rien pour une clé absente", async () => {
		const db = await freshDatabase();
		const { number } = await insertSpell(db, NEW_SPELL);
		expect(await findSpellByKey(db, NEW_SPELL.key)).toEqual({
			number,
			name: NEW_SPELL.name,
		});
		expect(await findSpellByKey(db, "clé absente")).toBeUndefined();
	});

	test("un poids 0, sort jamais tiré, est admis", async () => {
		const db = await freshDatabase();
		const added = await insertSpell(db, { ...NEW_SPELL, weight: 0 });
		expect(added.weight).toBe(0);
	});

	test.each<[string, Partial<NewSpell>, string]>([
		["un poids négatif", { weight: -1 }, "spells_weight_check"],
		["un poids NaN", { weight: Number.NaN }, "spells_weight_check"],
		[
			"un poids infini",
			{ weight: Number.POSITIVE_INFINITY },
			"spells_weight_check",
		],
		["un nom vide", { name: "" }, "spells_name_check"],
		["un nom blanc", { name: " \t\n" }, "spells_name_check"],
		["une description vide", { description: "" }, "spells_description_check"],
		[
			"une description blanche",
			{ description: " \t\n" },
			"spells_description_check",
		],
	])("la base refuse %s, et rien n'est écrit", async (_, field, constraint) => {
		const db = await freshDatabase();
		const before = await listSpells(db);
		await expect(
			insertSpell(db, { ...NEW_SPELL, ...field }),
		).rejects.toMatchObject({ cause: { constraint } });
		expect(await listSpells(db)).toEqual(before);
	});

	test("updateSpell change poids, description et image, et rend avant et après sans les octets", async () => {
		const db = await freshDatabase();
		const before = await insertSpell(db, NEW_SPELL);
		const patch = { weight: 2.5, description: "Nouvelle description." };
		const after = { ...before, ...patch, image: PNG_SUMMARY };
		expect(
			await updateSpell(db, before.number, { ...patch, image: PNG_IMAGE }),
		).toEqual({ before, after });
		expect(await listSpells(db)).toContainEqual(after);
	});

	test("updateSpell retire l'image sur null, sans toucher au reste", async () => {
		const db = await freshDatabase();
		const { number } = await insertSpell(db, NEW_SPELL);
		const { after: before } = await updateSpell(db, number, {
			image: PNG_IMAGE,
		});
		expect(await updateSpell(db, number, { image: null })).toEqual({
			before,
			after: { ...before, image: null },
		});
	});

	test("updateSpell sur un numéro inconnu lève une erreur qui le nomme, et rien n'est écrit", async () => {
		const db = await freshDatabase();
		const before = await listSpells(db);
		await expect(updateSpell(db, 999, { weight: 2 })).rejects.toThrow(
			"Aucun sort de numéro 999.",
		);
		expect(await listSpells(db)).toEqual(before);
	});

	test("dans la transaction de l'appelant, une modification refusée la laisse utilisable", async () => {
		const db = await freshDatabase();
		const added = await insertSpell(db, NEW_SPELL);
		const listed = await db.transaction(async (tx) => {
			await expect(
				updateSpell(tx, added.number, {
					image: { bytes: ABC, type: "image/gif" },
				}),
			).rejects.toMatchObject({
				cause: { constraint: "spells_image_type_check" },
			});
			return listSpells(tx);
		});
		expect(listed).toContainEqual(added);
	});

	test("une modification concurrente attend la précédente et lit son après pour avant", async () => {
		const db = await freshDatabase();
		const { number } = await insertSpell(db, NEW_SPELL);
		let concurrent: ReturnType<typeof updateSpell> | undefined;
		const first = await db.transaction(async (tx) => {
			const first = await updateSpell(tx, number, { weight: 2 });
			concurrent = updateSpell(db, number, { weight: 3 });
			await waitForOneLockWaiter(db);
			return first;
		});
		expect((await concurrent)?.before).toEqual(first.after);
	});

	test.each<[string, SpellPatch]>([
		["vide", {}],
		["aux clés toutes undefined", { weight: undefined, image: undefined }],
	])("un patch %s est refusé avant toute requête", async (_, patch) => {
		const unreachable = createClient(UNREACHABLE_DATABASE_URL);
		onTestFinished(() => unreachable.$client.end());
		await expect(updateSpell(unreachable, 1, patch)).rejects.toThrow(
			"Rien à modifier",
		);
	});

	test.each(["image/png", "image/jpeg", "image/webp"])(
		"une image de type %s est admise",
		async (type) => {
			const db = await freshDatabase();
			const { number } = await insertSpell(db, NEW_SPELL);
			const { after } = await updateSpell(db, number, {
				image: { bytes: ABC, type },
			});
			expect(after.image).toEqual({ ...PNG_SUMMARY, type });
		},
	);

	test("une image d'un autre type est refusée, et rien n'est écrit", async () => {
		const db = await freshDatabase();
		const added = await insertSpell(db, NEW_SPELL);
		await expect(
			updateSpell(db, added.number, {
				image: { bytes: ABC, type: "image/gif" },
			}),
		).rejects.toMatchObject({
			cause: { constraint: "spells_image_type_check" },
		});
		expect(await listSpells(db)).toContainEqual(added);
	});

	// Le service écrit toujours les octets et leur type ensemble : la contrainte se voit sur la table.
	test.each([
		["des octets sans type", { image: ABC }],
		["un type sans octets", { imageType: "image/png" }],
	])("la base refuse %s", async (_, columns) => {
		const db = await freshDatabase();
		const { number } = await insertSpell(db, NEW_SPELL);
		await expect(
			db.update(spells).set(columns).where(eq(spells.number, number)),
		).rejects.toMatchObject({ cause: { constraint: "spells_image_check" } });
	});

	// Une ligne modifiée change de place dans la table : sans tri, elle se lirait la dernière.
	test("listSpells rend les sorts par numéro croissant, même après une modification", async () => {
		const db = await freshDatabase();
		const { number } = await insertSpell(db, NEW_SPELL);
		await insertSpell(db, { ...NEW_SPELL, key: "essai-2" });
		await updateSpell(db, number, { weight: 2 });
		expect((await listSpells(db)).map((spell) => spell.number)).toEqual([
			...STARTING_NUMBERS,
			25,
			26,
		]);
	});

	test("la réserve tirable rend chaque sort en { id, weight } par numéro, le numéro en texte, poids 0 compris", async () => {
		const db = await freshDatabase();
		await db.delete(spells);
		await insertSpell(db, NEW_SPELL);
		await insertSpell(db, { ...NEW_SPELL, key: "essai-2", weight: 0 });
		await updateSpell(db, 1, { weight: 2 });
		expect(await readDrawablePool(db)).toEqual([
			{ id: "1", weight: 2 },
			{ id: "2", weight: 0 },
		]);
	});
});
