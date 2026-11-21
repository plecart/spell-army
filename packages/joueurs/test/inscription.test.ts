import {
	classDefaultModels,
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
import {
	freshDatabase,
	injectFailure,
	waitForOneLockWaiter,
} from "donnees/test/base-neuve";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { characterOf, drawSpell } from "personnages";
import { describe, expect, test } from "vitest";
import { changeClassDefaultModel, writePage } from "../src/index.ts";
import { entry, followers, UNTRUSTED_PAGE } from "./faux-fournisseur.ts";

// Les joueurs « 10 » à « 14 ».
const PAGE = followers(5, 10);

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
		await injectFailure(db, {
			event: "insert",
			table: "players",
			when: "new.instagram_id = '12'",
		});
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

	test("deux écritures concurrentes d'un même nouveau joueur : la seconde attend le commit de la première, puis n'ajoute personne, sans erreur", async () => {
		const db = await freshDatabase();
		let second: ReturnType<typeof writePage> | undefined;
		await db.transaction(async (tx) => {
			expect(await writePage(tx, [entry("12")])).toMatchObject({ added: 1 });
			// La première écriture n'est pas validée : la seconde ne la voit pas parmi les connus, et son
			// insertion attend sur la clé primaire.
			second = writePage(db, [entry("12", "autre")]);
			await waitForOneLockWaiter(db);
		});
		expect(await second).toMatchObject({ added: 0 });
		expect((await readPlayers(db)).map(({ username }) => username)).toEqual([
			"joueur_12",
		]);
	});

	test("données non fiables : seule l'entrée bien formée est écrite, les écartées comptées par motif", async () => {
		const db = await freshDatabase();
		expect(await writePage(db, UNTRUSTED_PAGE)).toEqual({
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

describe("changement du modèle par défaut d'une classe", () => {
	const CLASS_OF_12 = characterOf("12").class;

	/** Le modèle de chaque joueur, par identifiant. */
	async function readModels(db: Executor) {
		return Object.fromEntries(
			(await readPlayers(db)).map(({ instagramId, modelFileId }) => [
				instagramId,
				modelFileId,
			]),
		);
	}

	/** Les `count` premiers identifiants de la classe de « 12 », à partir de « 100 ». */
	function idsOfClassOf12(count: number): string[] {
		const ids: string[] = [];
		for (let n = 100; ids.length < count; n++) {
			if (characterOf(String(n)).class === CLASS_OF_12) {
				ids.push(String(n));
			}
		}
		return ids;
	}

	test("les joueurs inscrits sans défaut reçoivent le modèle au premier réglage de leur classe ; les joueurs sans modèle des autres classes ne bougent pas", async () => {
		const db = await freshDatabase();
		expect(characterOf("13").class).not.toBe(CLASS_OF_12);
		const [first, second] = idsOfClassOf12(2) as [string, string];
		await writePage(db, [entry(first), entry(second), entry("13")]);
		const fileId = await storeClassFile(db, "12");
		expect(await changeClassDefaultModel(db, CLASS_OF_12, fileId)).toEqual({
			before: null,
			after: fileId,
			followed: 2,
		});
		expect(await readModels(db)).toEqual({
			[first]: fileId,
			[second]: fileId,
			13: null,
		});
	});

	test("après un réglage, les joueurs dont le modèle valait l'ancien défaut ont le nouveau ; un joueur de la classe au modèle différent et un joueur d'une autre classe ne bougent pas", async () => {
		const db = await freshDatabase();
		const before = await setDefaultFor(db, "12");
		const [first, second, different] = idsOfClassOf12(3) as [
			string,
			string,
			string,
		];
		await writePage(db, [
			entry(first),
			entry(second),
			entry(different),
			entry("13"),
		]);
		const otherModel = await storeClassFile(db, "12");
		await db
			.update(players)
			.set({ modelFileId: otherModel })
			.where(eq(players.instagramId, different));
		const after = await storeClassFile(db, "12");
		expect(await changeClassDefaultModel(db, CLASS_OF_12, after)).toEqual({
			before,
			after,
			followed: 2,
		});
		expect(await readModels(db)).toEqual({
			[first]: after,
			[second]: after,
			[different]: otherModel,
			13: null,
		});
	});

	test("régler à nouveau le même fichier ne fait suivre aucun joueur et ne change aucun modèle", async () => {
		const db = await freshDatabase();
		const fileId = await setDefaultFor(db, "12");
		const [first] = idsOfClassOf12(1) as [string];
		await writePage(db, [entry(first), entry("13")]);
		const models = await readModels(db);
		expect(models[first]).toBe(fileId);
		expect(await changeClassDefaultModel(db, CLASS_OF_12, fileId)).toEqual({
			before: fileId,
			after: fileId,
			followed: 0,
		});
		expect(await readModels(db)).toEqual(models);
	});

	test.each([
		["sans ancien défaut", false],
		["avec un ancien défaut", true],
	])(
		"une page ouverte dans une transaction non validée fait attendre le changement %s ; après son commit, son joueur suit le nouveau défaut",
		async (_, hadDefault) => {
			const db = await freshDatabase();
			if (hadDefault) {
				await setDefaultFor(db, "12");
			}
			const next = await storeClassFile(db, "12");
			let change: ReturnType<typeof changeClassDefaultModel> | undefined;
			await db.transaction(async (tx) => {
				await writePage(tx, [entry("12")]);
				change = changeClassDefaultModel(db, CLASS_OF_12, next);
				await waitForOneLockWaiter(db);
			});
			expect(await change).toMatchObject({ after: next, followed: 1 });
			expect(await readModels(db)).toEqual({ 12: next });
		},
	);

	// Le plafond de paramètres d'une requête : le message Bind du protocole Postgres les compte sur
	// 16 bits (pg-protocol 1.16.1, `serializer.js`, `bind`).
	const PARAMETER_CEILING = 65_535;

	test("65 536 joueurs sans modèle dans la classe, un de plus que le plafond de paramètres d'une requête, reçoivent tous le premier défaut", {
		timeout: 60_000,
	}, async () => {
		const db = await freshDatabase();
		const ids = idsOfClassOf12(PARAMETER_CEILING + 1);
		await db.execute(
			sql`insert into players (instagram_id, username, spell_number)
					select id, 'joueur_' || id, 1 from unnest(${sql.param(ids)}::text[]) as id`,
		);
		const fileId = await storeClassFile(db, "12");
		expect(
			await changeClassDefaultModel(db, CLASS_OF_12, fileId),
		).toMatchObject({ followed: ids.length });
		expect(await db.$count(players, eq(players.modelFileId, fileId))).toBe(
			ids.length,
		);
	});

	test("un suivi qui échoue laisse le défaut de la classe inchangé", async () => {
		const db = await freshDatabase();
		const before = await setDefaultFor(db, "12");
		await writePage(db, [entry("12")]);
		await injectFailure(db, { event: "update", table: "players" });
		const next = await storeClassFile(db, "12");
		await expect(
			changeClassDefaultModel(db, CLASS_OF_12, next),
		).rejects.toMatchObject({ cause: { code: "P0001" } });
		expect(await db.select().from(classDefaultModels)).toEqual([
			{ class: CLASS_OF_12, modelFileId: before },
		]);
	});
});
