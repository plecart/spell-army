import {
	type Executor,
	excludedPlayers,
	insertSpell,
	players,
	readDrawablePool,
	readSpell,
	setClassDefaultModel,
	spells,
	storeModelFile,
} from "donnees";
import { freshDatabase, waitForOneLockWaiter } from "donnees/test/base-neuve";
import { getTableColumns, sql } from "drizzle-orm";
import { characterOf, drawSpell } from "personnages";
import { describe, expect, test } from "vitest";
import { type FollowerEntry, writePage } from "../src/index.ts";

/** Une entrée bien formée, au pseudo tiré de l'identifiant sauf s'il est donné. */
function entry(id: string, username = `joueur_${id}`): FollowerEntry {
	return { id, username };
}

const PAGE = ["10", "11", "12", "13", "14"].map((id) => entry(id));

/**
 * Les joueurs, par identifiant croissant. La date d'arrivée vient en texte, à la microseconde de la
 * base : un `Date` l'arrondirait à la milliseconde, où deux écritures proches se confondent.
 */
function readPlayers(db: Executor) {
	return db
		.select({
			...getTableColumns(players),
			arrivedAt: sql<string>`${players.arrivedAt}::text`,
		})
		.from(players)
		.orderBy(players.instagramId);
}

/** Les joueurs sans leur date d'arrivée : ce que deux bases distinctes peuvent partager. */
async function readPlayersWithoutArrival(db: Executor) {
	return (await readPlayers(db)).map(({ arrivedAt, ...player }) => player);
}

/** Les identifiants des joueurs, par ordre croissant. */
async function readPlayerIds(db: Executor) {
	return (await readPlayers(db)).map(({ instagramId }) => instagramId);
}

/** Range un fichier 3D de la classe de `instagramId` et rend son identifiant. */
async function storeClassFile(
	db: Executor,
	instagramId: string,
): Promise<number> {
	const target = { class: characterOf(instagramId).class };
	return (await storeModelFile(db, { target, content: new Uint8Array([1]) }))
		.id;
}

/** Fait d'un fichier neuf le modèle par défaut de la classe de `instagramId` et rend son identifiant. */
async function setDefaultFor(
	db: Executor,
	instagramId: string,
): Promise<number> {
	const fileId = await storeClassFile(db, instagramId);
	await setClassDefaultModel(db, characterOf(instagramId).class, fileId);
	return fileId;
}

describe("écriture d'une page", () => {
	test("une page de nouveaux joueurs les inscrit tels que reçus, chacun avec le sort qu'il tire dans la réserve", async () => {
		const db = await freshDatabase();
		const pool = await readDrawablePool(db);
		expect(await writePage(db, PAGE)).toEqual({
			added: 5,
			invalidIds: 0,
			invalidUsernames: 0,
		});
		expect(await readPlayersWithoutArrival(db)).toEqual(
			PAGE.map(({ id, username }) => ({
				instagramId: id,
				username,
				spellNumber: Number(drawSpell(id, pool)),
				modelFileId: null,
			})),
		);
	});

	test("rejouer la même page n'ajoute personne : date d'arrivée, pseudo, sort et modèle de chacun inchangés", async () => {
		const db = await freshDatabase();
		await writePage(db, PAGE);
		const before = await readPlayers(db);
		// Un modèle par défaut réglé entre-temps : une réécriture le donnerait au joueur « 10 ».
		await setDefaultFor(db, "10");
		expect(await writePage(db, PAGE)).toMatchObject({ added: 0 });
		expect(await readPlayers(db)).toEqual(before);
	});

	test.each([
		["doublée", [...PAGE, ...PAGE]],
		["dans le désordre", PAGE.toReversed()],
	])(
		"une page %s laisse le même état final que la page propre",
		async (_, variant) => {
			const states = [];
			for (const page of [PAGE, variant]) {
				const db = await freshDatabase();
				await setDefaultFor(db, "10");
				expect(await writePage(db, page)).toMatchObject({ added: 5 });
				states.push(await readPlayersWithoutArrival(db));
			}
			expect(states[1]).toEqual(states[0]);
		},
	);

	test("un joueur connu dont le pseudo change garde sa ligne telle quelle", async () => {
		const db = await freshDatabase();
		await writePage(db, [entry("12", "ancien")]);
		const before = await readPlayers(db);
		expect(await writePage(db, [entry("12", "nouveau")])).toMatchObject({
			added: 0,
		});
		expect(await readPlayers(db)).toEqual(before);
	});

	test("une panne au milieu de la page n'en écrit aucun joueur", async () => {
		const db = await freshDatabase();
		// Le troisième identifiant de la page, « 12 », fait échouer son insertion.
		await db.execute(
			sql.raw(`create function fail_on_third_entry() returns trigger
				language plpgsql as $$
				begin
					if new.instagram_id = '12' then
						raise exception 'panne injectée';
					end if;
					return new;
				end $$`),
		);
		await db.execute(
			sql.raw(`create trigger fail_on_third_entry before insert on players
				for each row execute function fail_on_third_entry()`),
		);
		await expect(writePage(db, PAGE)).rejects.toMatchObject({
			cause: { code: "P0001", message: "panne injectée" },
		});
		expect(await readPlayers(db)).toEqual([]);
	});

	test("un identifiant exclu n'est jamais créé", async () => {
		const db = await freshDatabase();
		await db.insert(excludedPlayers).values({ instagramId: "11" });
		expect(await writePage(db, PAGE)).toMatchObject({ added: 4 });
		expect(await readPlayerIds(db)).toEqual(["10", "12", "13", "14"]);
	});

	test("la date d'arrivée est celle du premier passage, et ne change plus", async () => {
		const db = await freshDatabase();
		await writePage(db, [entry("10")]);
		const [first] = await readPlayers(db);
		await writePage(db, [entry("10"), entry("11")]);
		const [ten, eleven] = await readPlayers(db);
		expect(ten).toEqual(first);
		// Le second passage a son propre instant : la date gardée n'est pas une coïncidence.
		expect(eleven?.arrivedAt).not.toBe(first?.arrivedAt);
	});

	test("données non fiables : seule l'entrée bien formée est écrite, les écartées comptées par motif", async () => {
		const db = await freshDatabase();
		const page = [
			...["12", "abc", "007", "0"].map((id) => entry(id)),
			entry("13", "a b"),
			entry("14", "a".repeat(31)),
		];
		expect(await writePage(db, page)).toEqual({
			added: 1,
			invalidIds: 3,
			invalidUsernames: 2,
		});
		expect(await readPlayerIds(db)).toEqual(["12"]);
	});

	test("une réserve sans poids positif fait rejeter la page, avec l'erreur du tirage, sans rien écrire", async () => {
		const db = await freshDatabase();
		await db.update(spells).set({ weight: 0 });
		await expect(writePage(db, PAGE)).rejects.toStrictEqual(
			new RangeError(
				"la réserve tirable doit contenir au moins un sort de poids positif",
			),
		);
		expect(await readPlayers(db)).toEqual([]);
	});

	test("une page sans nouveau joueur passe, même sur une réserve sans poids positif", async () => {
		const db = await freshDatabase();
		await writePage(db, [entry("10")]);
		await db.insert(excludedPlayers).values({ instagramId: "11" });
		await db.update(spells).set({ weight: 0 });
		expect(await writePage(db, [entry("10"), entry("11")])).toEqual({
			added: 0,
			invalidIds: 0,
			invalidUsernames: 0,
		});
	});

	test("un sort ajouté à la réserve après l'inscription ne change pas le sort stocké", async () => {
		const db = await freshDatabase();
		await writePage(db, PAGE);
		const before = await readPlayers(db);
		const { number, image, ...spell } = await readSpell(db, 1);
		const added = await insertSpell(db, {
			...spell,
			key: "apres-l-inscription",
			weight: 1e9,
		});
		// Tirés dans la réserve d'après, tous les joueurs de la page auraient le sort ajouté.
		const pool = await readDrawablePool(db);
		expect(PAGE.map(({ id }) => drawSpell(id, pool))).toEqual(
			PAGE.map(() => String(added.number)),
		);
		await writePage(db, PAGE);
		expect(await readPlayers(db)).toEqual(before);
	});

	test("un joueur inscrit reçoit le modèle par défaut de sa classe ; une classe sans défaut n'en donne pas", async () => {
		const db = await freshDatabase();
		expect(characterOf("12").class).not.toBe(characterOf("13").class);
		const fileId = await setDefaultFor(db, "12");
		await writePage(db, [entry("12"), entry("13")]);
		expect(
			(await readPlayers(db)).map(({ instagramId, modelFileId }) => ({
				instagramId,
				modelFileId,
			})),
		).toEqual([
			{ instagramId: "12", modelFileId: fileId },
			{ instagramId: "13", modelFileId: null },
		]);
	});
});

describe("écriture d'une page et réglage du modèle par défaut", () => {
	test.each([
		["encore sans défaut", false],
		["dont le défaut change", true],
	])(
		"un réglage en cours sur une classe %s : la page l'attend, et son nouveau joueur reçoit le nouveau défaut",
		async (_, hadDefault) => {
			const db = await freshDatabase();
			if (hadDefault) {
				await setDefaultFor(db, "12");
			}
			const next = await storeClassFile(db, "12");
			let page: ReturnType<typeof writePage> | undefined;
			await db.transaction(async (tx) => {
				await setClassDefaultModel(tx, characterOf("12").class, next);
				page = writePage(db, [entry("12")]);
				await waitForOneLockWaiter(db);
			});
			expect(await page).toMatchObject({ added: 1 });
			expect(
				(await readPlayers(db)).map(({ modelFileId }) => modelFileId),
			).toEqual([next]);
		},
	);

	test("un réglage lancé pendant l'écriture d'une page attend son commit, y compris pour une classe encore sans défaut", async () => {
		const db = await freshDatabase();
		const fileId = await storeClassFile(db, "12");
		let setting: ReturnType<typeof setClassDefaultModel> | undefined;
		await db.transaction(async (tx) => {
			await writePage(tx, [entry("12")]);
			setting = setClassDefaultModel(db, characterOf("12").class, fileId);
			await waitForOneLockWaiter(db);
		});
		expect(await setting).toEqual({ before: null, after: fileId });
	});
});
