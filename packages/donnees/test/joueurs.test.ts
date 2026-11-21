import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { excludedPlayers, players, storeModelFile } from "../src/index.ts";
import { freshDatabase } from "./base-neuve.ts";
import {
	LONG_ID,
	LONGEST_USERNAME,
	MALFORMED_IDS,
	MALFORMED_USERNAMES,
} from "./formes-instagram.ts";

type PlayerChange = Partial<typeof players.$inferInsert>;
// Un écart au joueur valide, et la contrainte qui le refuse.
type Refusal = [name: string, change: PlayerChange, constraint: string];

// Le sort 1 est dans la réserve de départ, que pose la migration `0004_reserve_de_depart`.
const PLAYER = { instagramId: "12", username: "douze", spellNumber: 1 };

// La base de test (Postgres 18.7, collation `en_US.utf8`, fournisseur libc) refuse « é » et « ü »
// dans `[A-Za-z]`, comme sous `C`, `fr-FR-x-icu` et `und-x-icu` (relevé du 2026-11-21) : aucune des
// collations essayées ne fait entrer une lettre accentuée dans les plages ASCII.
describe("joueurs", () => {
	test("players ne porte que l'identifiant et le pseudo du fournisseur, la date d'arrivée, le sort et le modèle", async () => {
		const db = await freshDatabase();
		const { rows } = await db.execute(
			sql`select column_name from information_schema.columns
				where table_schema = 'public' and table_name = 'players'
				order by ordinal_position`,
		);
		expect(rows.map(({ column_name }) => column_name)).toEqual([
			"instagram_id",
			"username",
			"arrived_at",
			"spell_number",
			"model_file_id",
		]);
	});

	test("un joueur aux bornes de la forme est accepté, arrivé à l'instant de la transaction qui l'écrit", async () => {
		const db = await freshDatabase();
		const { id } = await storeModelFile(db, {
			target: { class: "wizard" },
			content: new Uint8Array([1]),
		});
		const rows = await db.transaction(async (tx) => {
			await tx.insert(players).values({
				instagramId: LONG_ID,
				username: LONGEST_USERNAME,
				spellNumber: 1,
				modelFileId: id,
			});
			return (
				await tx.execute(
					sql`select arrived_at = now() as arrived_now from players`,
				)
			).rows;
		});
		expect(rows).toEqual([{ arrived_now: true }]);
	});

	test.each<Refusal>([
		...MALFORMED_IDS.map(
			([name, instagramId]): Refusal => [
				name,
				{ instagramId },
				"players_instagram_id_check",
			],
		),
		...MALFORMED_USERNAMES.map(
			([name, username]): Refusal => [
				name,
				{ username },
				"players_username_check",
			],
		),
	])(
		"%s : refusé par le contrôle de players",
		async (_, change, constraint) => {
			const db = await freshDatabase();
			await expect(
				db.insert(players).values({ ...PLAYER, ...change }),
			).rejects.toMatchObject({ cause: { code: "23514", constraint } });
		},
	);

	test.each<Refusal>([
		[
			"un sort inconnu",
			{ spellNumber: 999 },
			"players_spell_number_spells_number_fk",
		],
		[
			"un fichier 3D inconnu",
			{ modelFileId: 999 },
			"players_model_file_id_model_files_id_fk",
		],
	])(
		"%s : refusé par la clé étrangère de players",
		async (_, change, constraint) => {
			const db = await freshDatabase();
			await expect(
				db.insert(players).values({ ...PLAYER, ...change }),
			).rejects.toMatchObject({ cause: { code: "23503", constraint } });
		},
	);

	test("un identifiant exclu bien formé est accepté", async () => {
		const db = await freshDatabase();
		await db.insert(excludedPlayers).values({ instagramId: "7" });
		expect(await db.select().from(excludedPlayers)).toEqual([
			{ instagramId: "7" },
		]);
	});

	test.each(MALFORMED_IDS)(
		"%s : refusé par le contrôle d'excluded_players",
		async (_, instagramId) => {
			const db = await freshDatabase();
			await expect(
				db.insert(excludedPlayers).values({ instagramId }),
			).rejects.toMatchObject({
				cause: {
					code: "23514",
					constraint: "excluded_players_instagram_id_check",
				},
			});
		},
	);
});
