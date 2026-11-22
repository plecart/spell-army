import { describe, expect, test } from "vitest";
import {
	deleteMonsterByName,
	findMonsterByName,
	insertMonster,
	listMonsters,
	type NewMonster,
} from "../src/index.ts";
import { freshDatabase } from "./base-neuve.ts";

// Le golem de lave du game design (§ 3, « Profil »), au premier chapitre de la première saison :
// `donnees` ne lit ni le profil ni les attaques, que `combat` valide. Son facteur porte
// 17 chiffres significatifs, qu'une colonne `real` arrondirait.
const GOLEM: NewMonster = {
	season: 1,
	chapter: 1,
	name: "Golem de lave",
	profile: { life: 1.5, strength: 1, magic: 1, speed: 0.5 },
	attacks: [
		{ name: "Griffes", recipe: { strength: 100, magic: 0 }, coefficient: 0.78 },
		{
			name: "Sortilège",
			recipe: { strength: 0, magic: 100 },
			coefficient: 0.78,
		},
	],
	scaleFactor: 1.1653817482293547,
	trait: "Sa peau de lave brûle qui la frappe.",
};

// Un caractère hors du plan multilingue de base, U+1F40C (escargot) : un point de code, deux unités
// UTF-16.
const ASTRAL = String.fromCodePoint(0x1f40c);

/** Le golem, ses champs `fields` changés. */
function monster(fields: Partial<NewMonster>): NewMonster {
	return { ...GOLEM, ...fields };
}

describe("monstres", () => {
	test("un monstre rangé se relit à l'identique, par la liste et par son nom", async () => {
		const db = await freshDatabase();
		const stored = { id: 1, ...GOLEM };
		expect(await insertMonster(db, GOLEM)).toEqual(stored);
		expect(await listMonsters(db)).toEqual([stored]);
		expect(await findMonsterByName(db, GOLEM.name)).toEqual(stored);
	});

	test("un nom qu'aucun monstre ne porte ne trouve rien", async () => {
		const db = await freshDatabase();
		await insertMonster(db, GOLEM);
		expect(await findMonsterByName(db, "Limace")).toBeUndefined();
	});

	test("la liste range les monstres par saison, puis par chapitre", async () => {
		const db = await freshDatabase();
		await insertMonster(db, monster({ season: 2, chapter: 1, name: "Hydre" }));
		await insertMonster(db, monster({ season: 1, chapter: 10, name: "Liche" }));
		await insertMonster(db, monster({ season: 1, chapter: 2, name: "Limace" }));
		expect(
			(await listMonsters(db)).map(({ season, chapter }) => [season, chapter]),
		).toEqual([
			[1, 2],
			[1, 10],
			[2, 1],
		]);
	});

	// Chaque deuxième monstre ne heurte qu'une unicité : l'autre lui donne un autre nom, ou une autre
	// saison.
	test.each<[string, Partial<NewMonster>, string]>([
		[
			"au même chapitre de la même saison",
			{ name: "Limace" },
			"monsters_season_chapter_unique",
		],
		[
			"sous un nom déjà porté dans une autre saison",
			{ season: 2 },
			"monsters_name_unique",
		],
	])(
		"un deuxième monstre %s : refusé par la base, rien n'est écrit",
		async (_, fields, constraint) => {
			const db = await freshDatabase();
			const golem = await insertMonster(db, GOLEM);
			await expect(insertMonster(db, monster(fields))).rejects.toMatchObject({
				cause: { code: "23505", constraint },
			});
			expect(await listMonsters(db)).toEqual([golem]);
		},
	);

	test.each<[string, Partial<NewMonster>]>([
		["à un autre chapitre de la même saison", { chapter: 2 }],
		["au même chapitre d'une autre saison", { season: 2 }],
	])("un deuxième monstre %s : accepté", async (_, fields) => {
		const db = await freshDatabase();
		await insertMonster(db, GOLEM);
		await insertMonster(db, monster({ name: "Limace", ...fields }));
		expect(await listMonsters(db)).toHaveLength(2);
	});

	test("retirer un monstre par son nom le rend, et lui seul ; rejoué, rien n'est retiré", async () => {
		const db = await freshDatabase();
		const golem = await insertMonster(db, GOLEM);
		const limace = await insertMonster(
			db,
			monster({ chapter: 2, name: "Limace" }),
		);
		expect(await deleteMonsterByName(db, GOLEM.name)).toEqual(golem);
		expect(await deleteMonsterByName(db, GOLEM.name)).toBeUndefined();
		expect(await listMonsters(db)).toEqual([limace]);
	});

	test.each<[string, Partial<NewMonster>]>([
		["un nouveau monstre au chapitre libéré", { name: "Limace" }],
		["le monstre recréé sous le même nom, à un autre chapitre", { chapter: 2 }],
	])("après un retrait, la base accepte %s", async (_, fields) => {
		const db = await freshDatabase();
		await insertMonster(db, GOLEM);
		await deleteMonsterByName(db, GOLEM.name);
		const recreated = await insertMonster(db, monster(fields));
		expect(await listMonsters(db)).toEqual([recreated]);
	});

	// Les bornes de la table, côté refusé ; le côté accepté est au test suivant, et dans le golem pour
	// la particularité et le facteur.
	test.each<[string, Partial<NewMonster>, string]>([
		["la saison 0", { season: 0 }, "monsters_season_check"],
		["le chapitre 0", { chapter: 0 }, "monsters_chapter_check"],
		["un nom vide", { name: "" }, "monsters_name_check"],
		["un nom blanc", { name: " \t\n" }, "monsters_name_check"],
		[
			"un nom de 65 caractères",
			{ name: "é".repeat(65) },
			"monsters_name_check",
		],
		[
			"un nom de 65 caractères hors du plan multilingue de base",
			{ name: ASTRAL.repeat(65) },
			"monsters_name_check",
		],
		["une particularité vide", { trait: "" }, "monsters_trait_check"],
		["une particularité blanche", { trait: " \t\n" }, "monsters_trait_check"],
		["un facteur 0", { scaleFactor: 0 }, "monsters_scale_factor_check"],
		[
			"un facteur NaN",
			{ scaleFactor: Number.NaN },
			"monsters_scale_factor_check",
		],
		[
			"un facteur infini",
			{ scaleFactor: Number.POSITIVE_INFINITY },
			"monsters_scale_factor_check",
		],
	])(
		"la base refuse %s, et rien n'est écrit",
		async (_, fields, constraint) => {
			const db = await freshDatabase();
			await expect(insertMonster(db, monster(fields))).rejects.toMatchObject({
				cause: { code: "23514", constraint },
			});
			expect(await listMonsters(db)).toEqual([]);
		},
	);

	// Le côté accepté : la borne elle-même. Un « é » pèse deux octets en UTF-8, `ASTRAL` deux unités
	// UTF-16, et la borne du nom compte des caractères.
	test.each<[string, Partial<NewMonster>]>([
		["la saison 1 et le chapitre 1", { season: 1, chapter: 1 }],
		["un nom d'un caractère", { name: "é" }],
		["un nom de 64 caractères", { name: "é".repeat(64) }],
		[
			"un nom de 64 caractères hors du plan multilingue de base",
			{ name: ASTRAL.repeat(64) },
		],
	])("la base accepte %s", async (_, fields) => {
		const db = await freshDatabase();
		const stored = await insertMonster(db, monster(fields));
		expect(stored).toMatchObject(fields);
	});
});
