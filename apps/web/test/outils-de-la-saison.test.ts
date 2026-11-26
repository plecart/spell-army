import type { CallToolResult, Client } from "@modelcontextprotocol/client";
import {
	poolVersionOf,
	RULES_VERSION,
	// L'état de départ de `combat` est celui que la migration pose : ce test les tient égaux.
	SEASON_START,
	STARTING_POOL,
	type Stats,
	seedOf,
} from "combat";
import {
	COMBAT_DATE_UNIQUE,
	type Executor,
	type NewMonster,
	players,
	readCalibrationSettings,
	readForced,
	readSeasonState,
	replaceForced,
	updateCalibrationSettings,
	writeSeasonState,
} from "donnees";
import { injectFailure, waitForOneLockWaiter } from "donnees/test/base-neuve";
import { removePlayer } from "joueurs";
import { characterOf, STAT_KEYS } from "personnages";
import { describe, expect, test, vi } from "vitest";
import { chooseForcedTool } from "../app/mcp/season-tools.ts";
import {
	auditOf,
	codeFor,
	confirmationOf,
	connectToRegistry,
	expectRefusal,
	freezeDate,
	nonBlank,
	outputOf,
	publishedTools,
} from "./montage.ts";
import { storeMonster } from "./monstres.ts";

const SEASON_TOOLS = [
	"lire_saison",
	"choisir_forces",
	"lancer_combat",
	"lire_journal",
];

// Les instants s'écrivent à l'heure de Paris, l'hiver : +01:00. Le combat se lance le matin, et
// prend les joueurs arrivés avant minuit.

/** Le matin du `day` janvier 2026, à l'heure de Paris. */
function morningOf(day: number): number {
	return Date.parse(`2026-01-${String(day).padStart(2, "0")}T09:00:00+01:00`);
}

// Trois joueurs arrivés avant le minuit du 16 janvier : la veille à 23 h 59, la veille à 10 h,
// l'avant-veille ; un quatrième arrivé le 16 à 00 h 01, après lui.
const LATE_EVENING = "101";
const EVENING = "102";
const DAY_BEFORE = "103";
const AFTER_MIDNIGHT = "104";
const ARRIVALS: [id: string, at: string][] = [
	[LATE_EVENING, "2026-01-15T23:59:00+01:00"],
	[EVENING, "2026-01-15T10:00:00+01:00"],
	[DAY_BEFORE, "2026-01-14T10:00:00+01:00"],
	[AFTER_MIDNIGHT, "2026-01-16T00:01:00+01:00"],
];

// La limace, son facteur d'échelle réduit ou grossi : un monstre que l'armée abat à sa première
// action, et un monstre qui abat l'armée à sa première attaque.
const CRUSHED: Partial<NewMonster> = { scaleFactor: 1e-6 };
const CRUSHING: Partial<NewMonster> = { scaleFactor: 1e6 };

// Le profil de la limace (`monstres.ts`).
const SLUG_PROFILE: Stats = {
	life: 1.5,
	strength: 0.8,
	magic: 1.2,
	speed: 0.5,
};

// 10 recrues moyennes, le budget du chapitre 2 fixé après une victoire au premier combat.
const TEN_RECRUITS: Stats = { life: 76, strength: 76, magic: 75, speed: 73 };

/**
 * Les stats de la limace au facteur d'échelle `scale`, dimensionnée sur `budget` : budget × profil
 * × facteur, dans l'ordre des produits de `sizeMonster`.
 */
function slugSizedOn(budget: Stats, scale: number): Stats {
	return Object.fromEntries(
		STAT_KEYS.map((stat) => [stat, budget[stat] * SLUG_PROFILE[stat] * scale]),
	) as Stats;
}

/** L'en-tête du journal stocké du combat du jour `jour`, relu par lire_journal. */
async function headerOf(client: Client, jour: number) {
	const { journal } = outputOf(
		await call(client, "lire_journal", { jour }),
	) as {
		journal: { header: { army: { stats: Stats }; monster: { stats: Stats } } };
	};
	return journal.header;
}

// Deux forcés : le joueur de 23 h 59 en premier, celui de l'avant-veille en dernier.
const FIRST = {
	identifiant: LATE_EVENING,
	position: "premier",
	motif: "commentaire du jour",
};
const LAST = {
	identifiant: DAY_BEFORE,
	position: "dernier",
	motif: "partenaire",
};

const DATE_TAKEN =
	"un combat a déjà eu lieu le 2026-01-16 : un seul combat par jour, jamais relancé";

const READ_ONLY = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
};

/** Inscrit chaque `[identifiant, instant d'arrivée]`, tous avec le sort numéro 1, Coup d'épée. */
function enlist(db: Executor, arrivals: [id: string, at: string][]) {
	return db.insert(players).values(
		arrivals.map(([instagramId, arrivedAt]) => ({
			instagramId,
			username: `joueur_${instagramId}`,
			spellNumber: 1,
			arrivedAt: new Date(arrivedAt),
		})),
	);
}

/**
 * Le registre réel sur une base neuve, l'horloge de `Date` arrêtée au matin du 16 janvier 2026, la
 * limace au chapitre 1, ses champs `monster` changés, et les joueurs de `arrivals`.
 */
async function seasonWith(
	monster: Partial<NewMonster> = CRUSHED,
	arrivals = ARRIVALS,
) {
	const { db, client } = await connectToRegistry();
	freezeDate(morningOf(16));
	await storeMonster(db, monster);
	await enlist(db, arrivals);
	return { db, client };
}

function call(
	client: Client,
	name: string,
	args: Record<string, unknown> = {},
): Promise<CallToolResult> {
	return client.callTool({ name, arguments: args });
}

/** Le lancement confirmé par le code de l'appel sans code. */
async function launch(client: Client): Promise<CallToolResult> {
	const code = await codeFor(client, "lancer_combat", {});
	return call(client, "lancer_combat", { code });
}

interface Launched {
	jour: number;
	date: string;
	chapitre: number;
	tentative: number;
	issue: string;
	actions: number;
	saison: unknown;
}

/** La sortie d'un lancement confirmé, réussi. */
function resultOf(result: CallToolResult): Launched {
	return (outputOf(result) as { resultat: Launched }).resultat;
}

/** Lance un combat confirmé au matin de chacun des jours `days` de janvier 2026. */
async function launchOn(client: Client, days: readonly number[]) {
	for (const day of days) {
		vi.setSystemTime(morningOf(day));
		resultOf(await launch(client));
	}
}

/**
 * Lance le combat confirmé pendant une transaction ouverte sur `db` après `work` : le lancement
 * attend le verrou que `work` a pris, puis la transaction se valide et le lancement joue. Rend sa
 * sortie.
 */
async function launchDuring(
	db: Executor,
	client: Client,
	work: (tx: Executor) => Promise<unknown>,
): Promise<Launched> {
	const code = await codeFor(client, "lancer_combat", {});
	let locked = () => {};
	const holding = new Promise<void>((resolve) => {
		locked = resolve;
	});
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const working = db.transaction(async (tx) => {
		await work(tx);
		locked();
		await held;
	});

	await holding;
	const launching = call(client, "lancer_combat", { code });
	try {
		await waitForOneLockWaiter(db);
	} finally {
		release();
	}
	await working;
	return resultOf(await launching);
}

/** `result` est le refus `message`, et la dernière ligne d'audit de `tool`, en erreur, le garde. */
async function expectRefused(
	db: Executor,
	tool: string,
	result: CallToolResult,
	message: string,
) {
	expect(result).toMatchObject({
		content: [{ type: "text", text: message }],
		isError: true,
	});
	expect((await auditOf(db, tool)).at(-1)).toMatchObject({
		succeeded: false,
		error: message,
	});
}

async function readSeason(client: Client) {
	return outputOf(await call(client, "lire_saison"));
}

async function chooseForced(client: Client, forces: object[]) {
	return outputOf(await call(client, "choisir_forces", { forces }));
}

describe("outils de la saison : tools/list", () => {
	test("publie lire_saison et lire_journal en lecture seule, choisir_forces, qui écrase la liste, et lancer_combat, irréversible, avec le code de la confirmation ; des schémas de sortie stricts, chaque champ d'entrée décrit", () => {
		const strict = expect.objectContaining({
			type: "object",
			additionalProperties: false,
		});
		expect(
			publishedTools(SEASON_TOOLS).map(
				({ name, title, annotations, inputSchema, outputSchema }) => ({
					name,
					title,
					annotations,
					fields: Object.entries(inputSchema.properties ?? {}).map(
						([field, schema]) => [
							field,
							(schema as { description?: string }).description,
						],
					),
					outputSchema,
				}),
			),
		).toEqual([
			{
				name: "lire_saison",
				title: "Lire l'état de la saison",
				annotations: READ_ONLY,
				fields: [],
				outputSchema: strict,
			},
			{
				name: "choisir_forces",
				title: "Choisir les forcés du prochain combat",
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
					idempotentHint: true,
					openWorldHint: false,
				},
				fields: [["forces", nonBlank]],
				outputSchema: strict,
			},
			{
				name: "lancer_combat",
				title: "Lancer le combat du jour",
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
					idempotentHint: false,
					openWorldHint: false,
				},
				fields: [["code", nonBlank]],
				outputSchema: strict,
			},
			{
				name: "lire_journal",
				title: "Lire le journal d'un combat",
				annotations: READ_ONLY,
				fields: [["jour", nonBlank]],
				outputSchema: strict,
			},
		]);
	});

	test("chaque champ d'un forcé est décrit", () => {
		const [choose] = publishedTools(["choisir_forces"]);
		const forces = choose?.inputSchema.properties?.forces as
			| { items: { properties: Record<string, { description?: string }> } }
			| undefined;
		expect(
			Object.entries(forces?.items.properties ?? {}).map(
				([field, { description }]) => [field, description],
			),
		).toEqual(
			["identifiant", "position", "motif"].map((field) => [field, nonBlank]),
		);
	});
});

describe("choisir_forces", () => {
	test("remplace la liste entière et la rend, le motif sans ses blancs ; la liste vide la vide ; l'audit garde l'ancienne et la nouvelle", async () => {
		const { db, client } = await seasonWith();
		const middle = {
			identifiant: EVENING,
			position: "milieu",
			motif: "  tirage au sort ",
		};
		const trimmed = { ...middle, motif: "tirage au sort" };

		expect(await chooseForced(client, [FIRST, LAST])).toEqual({
			forces: [FIRST, LAST],
		});
		expect(await readForced(db)).toEqual([
			{
				instagramId: LATE_EVENING,
				position: "first",
				reason: "commentaire du jour",
			},
			{ instagramId: DAY_BEFORE, position: "last", reason: "partenaire" },
		]);
		expect(await chooseForced(client, [middle])).toEqual({
			forces: [trimmed],
		});
		expect(await chooseForced(client, [])).toEqual({ forces: [] });
		expect(await readForced(db)).toEqual([]);
		expect(
			(await auditOf(db, "choisir_forces")).map(({ before, after }) => ({
				before,
				after,
			})),
		).toEqual([
			{ before: { forces: [] }, after: { forces: [FIRST, LAST] } },
			{ before: { forces: [FIRST, LAST] }, after: { forces: [trimmed] } },
			{ before: { forces: [trimmed] }, after: { forces: [] } },
		]);
	});

	test("un identifiant qui n'est celui d'aucun joueur, jamais inscrit ou retiré : refusé dès le choix, chaque inconnu nommé, la liste inchangée", async () => {
		const { db, client } = await seasonWith();
		await chooseForced(client, [FIRST]);
		await removePlayer(db, EVENING);
		const before = await readForced(db);

		await expectRefused(
			db,
			"choisir_forces",
			await call(client, "choisir_forces", {
				forces: [
					LAST,
					{ ...FIRST, identifiant: "999" },
					{ ...FIRST, identifiant: EVENING },
				],
			}),
			[
				"aucun joueur d'identifiant 999 : un forcé est un joueur",
				"aucun joueur d'identifiant 102 : un forcé est un joueur",
			].join("\n"),
		);
		expect(await readForced(db)).toEqual(before);
	});

	test("un joueur forcé deux fois : refusé, nommé une fois, la liste inchangée", async () => {
		const { db, client } = await seasonWith();

		await expectRefused(
			db,
			"choisir_forces",
			await call(client, "choisir_forces", {
				forces: [FIRST, LAST, { ...FIRST, position: "milieu" }, FIRST],
			}),
			"le joueur 101 est forcé deux fois : un forcé figure une fois",
		);
		expect(await readForced(db)).toEqual([]);
	});
});

// Le format saisi de choisir_forces, balayé en une passe sur son schéma d'entrée : chaque champ
// absent, puis d'un autre type ou hors de sa forme ; un champ inconnu dans chaque objet ; le motif
// aux deux bords de sa borne. L'enrobage fait de chaque refus du schéma un refus audité (`tool.ts`).
describe("choisir_forces : le format saisi", () => {
	/** Les refus du schéma d'entrée pour `input` : le code et le chemin de chacun. */
	function issuesOf(input: unknown) {
		const parsed = chooseForcedTool.input.safeParse(input);
		return parsed.success
			? []
			: parsed.error.issues.map(({ code, path }) => ({ code, path }));
	}
	const listOf = (forced: Record<string, unknown>) => ({ forces: [forced] });
	const without = (field: string) =>
		listOf(
			Object.fromEntries(
				Object.entries(FIRST).filter(([name]) => name !== field),
			),
		);

	test("un forcé bien formé passe le schéma, la liste vide aussi", () => {
		expect(issuesOf(listOf(FIRST))).toEqual([]);
		expect(issuesOf({ forces: [] })).toEqual([]);
	});

	test.each<[unknown, string, (string | number)[]]>([
		[{}, "invalid_type", ["forces"]],
		[{ forces: FIRST }, "invalid_type", ["forces"]],
		[{ forces: [], inconnu: 1 }, "unrecognized_keys", []],
		[without("identifiant"), "invalid_type", ["forces", 0, "identifiant"]],
		[without("position"), "invalid_value", ["forces", 0, "position"]],
		[without("motif"), "invalid_type", ["forces", 0, "motif"]],
		[
			listOf({ ...FIRST, identifiant: 101 }),
			"invalid_type",
			["forces", 0, "identifiant"],
		],
		[
			listOf({ ...FIRST, identifiant: "007" }),
			"invalid_format",
			["forces", 0, "identifiant"],
		],
		[
			listOf({ ...FIRST, position: "avant" }),
			"invalid_value",
			["forces", 0, "position"],
		],
		[listOf({ ...FIRST, motif: 1 }), "invalid_type", ["forces", 0, "motif"]],
		[listOf({ ...FIRST, motif: " \t" }), "too_small", ["forces", 0, "motif"]],
		[
			listOf({ ...FIRST, motif: "x".repeat(501) }),
			"too_big",
			["forces", 0, "motif"],
		],
		[listOf({ ...FIRST, inconnu: 1 }), "unrecognized_keys", ["forces", 0]],
	])("%j : refusé, %s à %j", (input, code, path) => {
		expect(issuesOf(input)).toEqual([{ code, path }]);
	});

	test("un motif de 500 caractères entouré de blancs : accepté", () => {
		expect(
			issuesOf(listOf({ ...FIRST, motif: ` ${"x".repeat(500)} ` })),
		).toEqual([]);
	});
});

describe("lire_saison", () => {
	test("au début de la saison : jour 1, chapitre 1, tentative 1, le monstre du chapitre sans stats, son budget se fixant au lancement, aucun dernier résultat", async () => {
		const { client } = await seasonWith();

		expect(await readSeason(client)).toEqual({
			saison: 1,
			dernier_resultat: null,
			fin: null,
			prochain_combat: {
				jour: 1,
				chapitre: 1,
				tentative: 1,
				monstre: { nom: "limace", stats: null },
			},
		});
	});

	test("le chapitre sans monstre : aucun monstre", async () => {
		const { client } = await seasonWith({ chapter: 2 });

		expect(await readSeason(client)).toMatchObject({
			prochain_combat: { chapitre: 1, monstre: null },
		});
	});

	test("après une victoire au premier combat : jour 2, chapitre 2, tentative 1, le monstre du chapitre 2 aux stats de 10 recrues moyennes × profil × facteur d'échelle, dernier résultat victoire", async () => {
		const { db, client } = await seasonWith();
		await storeMonster(db, { chapter: 2, name: "Hydre" });
		resultOf(await launch(client));

		// 10 recrues moyennes (Vie 76, Force 76, Magie 75, Vitesse 73) × le profil de la limace
		// (1,5 ; 0,8 ; 1,2 ; 0,5) × son facteur d'échelle, 1,1.
		expect(await readSeason(client)).toEqual({
			saison: 1,
			dernier_resultat: "victoire",
			fin: null,
			prochain_combat: {
				jour: 2,
				chapitre: 2,
				tentative: 1,
				monstre: {
					nom: "Hydre",
					stats: {
						vie: expect.closeTo(125.4, 9),
						force: expect.closeTo(66.88, 9),
						magie: expect.closeTo(99, 9),
						vitesse: expect.closeTo(40.15, 9),
					},
				},
			},
		});
	});
});

describe("lancer_combat", () => {
	test("sans code, ne lance rien et décrit le combat : date, jour, saison, chapitre, tentative, monstre, taille de l'armée, forcés ; avec le code, le lance ; rejoué le même jour, refusé, sans recalcul", async () => {
		const { db, client } = await seasonWith();
		await chooseForced(client, [FIRST, LAST]);
		const { description, code } = confirmationOf(
			await call(client, "lancer_combat"),
		);

		expect(description).toBe(
			"Lancera le combat du 2026-01-16, jour 1 de la saison 1 : chapitre 1, tentative 1, contre le monstre « limace », avec une armée de 3 : les joueurs arrivés avant le dernier minuit (Europe/Paris) ; forcés : 101 (premier, « commentaire du jour »), 103 (dernier, « partenaire »). Le combat se joue une fois : son journal, l'état de la saison et, s'il baisse, p s'écrivent pour de bon, et la liste des forcés se vide. Un seul combat par jour, jamais relancé. Sans annulation.",
		);
		expect(await readSeasonState(db)).toEqual(SEASON_START);

		expect(resultOf(await call(client, "lancer_combat", { code }))).toEqual({
			jour: 1,
			date: "2026-01-16",
			chapitre: 1,
			tentative: 1,
			issue: "victoire",
			actions: 1,
			saison: await readSeason(client),
		});
		const journal = outputOf(await call(client, "lire_journal", { jour: 1 }));
		const season = await readSeasonState(db);

		await expectRefused(
			db,
			"lancer_combat",
			await call(client, "lancer_combat", { code }),
			DATE_TAKEN,
		);
		await expectRefused(
			db,
			"lancer_combat",
			await call(client, "lancer_combat"),
			DATE_TAKEN,
		);
		expect(outputOf(await call(client, "lire_journal", { jour: 1 }))).toEqual(
			journal,
		);
		expect(await readSeasonState(db)).toEqual(season);
	});

	test("l'armée du combat : les joueurs arrivés avant le dernier minuit, 23 h 59 compris, 00 h 01 non, jamais un retiré", async () => {
		const { db, client } = await seasonWith();
		await removePlayer(db, EVENING);
		resultOf(await launch(client));

		const { journal } = outputOf(
			await call(client, "lire_journal", { jour: 1 }),
		) as { journal: { header: { army: object } } };
		const members = [LATE_EVENING, DAY_BEFORE].map(
			(id) => characterOf(id).stats,
		);
		expect(journal.header.army).toMatchObject({
			size: 2,
			stats: Object.fromEntries(
				STAT_KEYS.map((stat) => [
					stat,
					members.reduce((sum, stats) => sum + stats[stat], 0),
				]),
			),
		});
	});

	test.each<[string, Partial<NewMonster>, [string, string][], string]>([
		[
			"le monstre du chapitre absent : le message nomme le chapitre",
			{ chapter: 2 },
			ARRIVALS,
			"le chapitre 1 de la saison 1 attend son monstre : creer_monstre le crée",
		],
		[
			"une armée vide, aucun joueur arrivé avant le dernier minuit",
			CRUSHED,
			ARRIVALS.filter(([id]) => id === AFTER_MIDNIGHT),
			"l'armée du jour est vide : aucun joueur arrivé avant le dernier minuit (Europe/Paris)",
		],
	])("%s : refusé, rien d'écrit", async (_, monster, arrivals, message) => {
		const { db, client } = await seasonWith(monster, arrivals);

		await expectRefused(
			db,
			"lancer_combat",
			await call(client, "lancer_combat"),
			message,
		);
		expect(await readSeasonState(db)).toEqual(SEASON_START);
	});

	test("un forcé absent de l'armée du jour, arrivé après le dernier minuit ou retiré depuis son choix : refusé, chacun nommé, rien d'écrit", async () => {
		const { db, client } = await seasonWith();
		await chooseForced(client, [
			FIRST,
			{ ...FIRST, identifiant: AFTER_MIDNIGHT, position: "milieu" },
			{ ...LAST, identifiant: EVENING },
		]);
		await removePlayer(db, EVENING);
		const forced = await readForced(db);

		await expectRefused(
			db,
			"lancer_combat",
			await call(client, "lancer_combat"),
			[
				"le forcé 104 n'est pas dans l'armée du jour : arrivé après le dernier minuit, ou retiré",
				"le forcé 102 n'est pas dans l'armée du jour : arrivé après le dernier minuit, ou retiré",
			].join("\n"),
		);
		expect(await readSeasonState(db)).toEqual(SEASON_START);
		expect(await readForced(db)).toEqual(forced);
	});

	test("victoire : chapitre suivant, tentative 1 ; défaite : même chapitre, tentative suivante ; le combat consomme ses forcés", async () => {
		const { db, client } = await seasonWith();
		await storeMonster(db, { ...CRUSHING, chapter: 2, name: "Hydre" });
		await chooseForced(client, [FIRST]);

		const victory = resultOf(await launch(client));
		expect(await readForced(db)).toEqual([]);
		vi.setSystemTime(morningOf(17));
		const defeat = resultOf(await launch(client));

		expect([victory, defeat]).toMatchObject([
			{
				chapitre: 1,
				tentative: 1,
				issue: "victoire",
				saison: { prochain_combat: { chapitre: 2, tentative: 1 } },
			},
			{
				chapitre: 2,
				tentative: 1,
				issue: "defaite",
				saison: { prochain_combat: { chapitre: 2, tentative: 2 } },
			},
		]);
		expect((await headerOf(client, 2)).monster.stats).toEqual(
			slugSizedOn(TEN_RECRUITS, 1e6),
		);
	});

	test("à la 2e défaite de suite, p baisse de 0,7 à 0,6 en base ; la ligne d'audit du lancement garde l'état de la saison avant et après, et p quand il change", async () => {
		const { db, client } = await seasonWith(CRUSHING);
		await launchOn(client, [16, 17]);

		expect((await readCalibrationSettings(db)).recruitShare).toBe(0.6);
		const [first, second] = (await auditOf(db, "lancer_combat")).filter(
			({ succeeded, after }) => succeeded && after !== null,
		);
		expect(first).toMatchObject({
			before: { etat: SEASON_START },
			after: { etat: { attempt: 2, defeatStreak: 1, lastOutcome: "defeat" } },
		});
		expect(first?.before).not.toHaveProperty("p");
		expect(first?.after).not.toHaveProperty("p");
		expect(second).toMatchObject({
			before: { etat: { attempt: 2, defeatStreak: 1 }, p: 0.7 },
			after: { etat: { attempt: 3, defeatStreak: 2 }, p: 0.6 },
		});
	});

	test("le jour est le numéro du combat : trois combats sur cinq dates donnent les jours 1, 2 et 3", async () => {
		const { client } = await seasonWith(CRUSHING);
		await launchOn(client, [16, 18, 20]);

		const dates: unknown[] = [];
		for (const jour of [1, 2, 3]) {
			const { date } = outputOf(
				await call(client, "lire_journal", { jour }),
			) as { date: string };
			dates.push(date);
		}
		expect(dates).toEqual(["2026-01-16", "2026-01-18", "2026-01-20"]);
		expect(await readSeason(client)).toMatchObject({
			prochain_combat: { jour: 4 },
		});
	});

	test("après la victoire du chapitre 30 : lire_saison dit « saison 1 terminée au jour 34 », et tout lancement est refusé avec ce message", async () => {
		const { db, client } = await seasonWith({ ...CRUSHED, chapter: 30 });
		await writeSeasonState(db, {
			...SEASON_START,
			chapter: 30,
			combatsPlayed: 33,
			budget: {
				kind: "army",
				army: { life: 30, strength: 30, magic: 30, speed: 30 },
			},
			lastOutcome: "defeat",
		});
		const end = "saison 1 terminée au jour 34";

		expect(resultOf(await launch(client))).toMatchObject({
			jour: 34,
			chapitre: 30,
			issue: "victoire",
			saison: { fin: end, prochain_combat: null },
		});
		expect(await readSeason(client)).toEqual({
			saison: 1,
			dernier_resultat: "victoire",
			fin: end,
			prochain_combat: null,
		});
		vi.setSystemTime(morningOf(17));
		await expectRefused(
			db,
			"lancer_combat",
			await call(client, "lancer_combat"),
			end,
		);
	});

	test("un lancement qui échoue en cours d'écriture ne laisse rien : ni combat, ni état avancé, ni p baissé, ni forcés consommés", async () => {
		const { db, client } = await seasonWith(CRUSHING);
		resultOf(await launch(client));
		await chooseForced(client, [FIRST]);
		vi.setSystemTime(morningOf(17));
		const season = await readSeasonState(db);
		const forced = await readForced(db);
		// La dernière écriture du lancement : la baisse de p, à la 2e défaite de suite.
		await injectFailure(db, { event: "update", table: "calibration_settings" });

		await expectRefused(
			db,
			"lancer_combat",
			await launch(client),
			"panne injectée",
		);
		expect(await readSeasonState(db)).toEqual(season);
		expect((await readCalibrationSettings(db)).recruitShare).toBe(0.7);
		expect(await readForced(db)).toEqual(forced);
		expect(await call(client, "lire_journal", { jour: 2 })).toMatchObject({
			isError: true,
		});
	});

	test("la date prise entre la lecture et l'écriture, sous combats_fought_on_unique : refusé par le message de la date, rien d'écrit", async () => {
		const { db, client } = await seasonWith();
		await injectFailure(db, {
			event: "insert",
			table: "combats",
			code: "23505",
			constraint: COMBAT_DATE_UNIQUE,
		});

		await expectRefused(db, "lancer_combat", await launch(client), DATE_TAKEN);
		expect(await readSeasonState(db)).toEqual(SEASON_START);
	});

	test("un choix des forcés en cours : le lancement confirmé attend sa fin, et joue avec la liste choisie", async () => {
		const { db, client } = await seasonWith();
		await launchDuring(db, client, (tx) =>
			replaceForced(tx, [
				{ instagramId: LATE_EVENING, position: "first", reason: "commentaire" },
			]),
		);

		const { journal } = outputOf(
			await call(client, "lire_journal", { jour: 1 }),
		) as { journal: { header: { forced: object[] } } };
		expect(journal.header.forced).toEqual([
			{ id: LATE_EVENING, position: "first", reason: "commentaire" },
		]);
		expect(await readForced(db)).toEqual([]);
	});

	test("une modification de p en cours à la 2e défaite de suite : le lancement attend sa fin, et baisse le p modifié, de 0,5 à 0,4", async () => {
		const { db, client } = await seasonWith(CRUSHING);
		await launchOn(client, [16]);
		vi.setSystemTime(morningOf(17));
		await launchDuring(db, client, (tx) =>
			updateCalibrationSettings(tx, { recruitShare: 0.5 }),
		);

		expect(await headerOf(client, 2)).toMatchObject({ recruitShare: 0.5 });
		expect((await readCalibrationSettings(db)).recruitShare).toBe(0.4);
	});

	test("un budget rangé qui n'a pas la forme d'un budget : lire_saison et lancer_combat refusés, rien d'écrit", async () => {
		const { db, client } = await seasonWith();
		const malformed = {
			...SEASON_START,
			combatsPlayed: 1,
			budget: { kind: "formula", army: { life: 1 } },
		};
		await writeSeasonState(db, malformed);

		for (const tool of ["lire_saison", "lancer_combat"]) {
			expect(await call(client, tool)).toMatchObject({ isError: true });
		}
		expect(await readSeasonState(db)).toEqual(malformed);
	});
});

describe("lire_journal", () => {
	test("relit le journal stocké tel quel : l'en-tête complété de la saison, du chapitre, du jour, de la tentative, de p et des recrues de référence ; les actions ; le bilan, forcés non atteints compris", async () => {
		const { client } = await seasonWith();
		await chooseForced(client, [FIRST, LAST]);
		resultOf(await launch(client));

		const { jour, date, journal } = outputOf(
			await call(client, "lire_journal", { jour: 1 }),
		) as {
			jour: number;
			date: string;
			journal: { header: object; actions: object[]; summary: object };
		};

		expect({ jour, date }).toEqual({ jour: 1, date: "2026-01-16" });
		// Les arrivées des trois dates avant minuit : 0 le 13, 1 le 14, 2 le 15 ; médiane 1.
		expect(journal.header).toMatchObject({
			rulesVersion: RULES_VERSION,
			poolVersion: poolVersionOf(STARTING_POOL),
			seed: seedOf({ season: 1, chapter: 1, attempt: 1 }),
			season: 1,
			chapter: 1,
			day: 1,
			attempt: 1,
			recruitShare: 0.7,
			referenceRecruits: 1,
			army: { size: 3 },
			forced: [
				{ id: LATE_EVENING, position: "first", reason: "commentaire du jour" },
				{ id: DAY_BEFORE, position: "last", reason: "partenaire" },
			],
		});
		expect(journal.actions).toEqual([
			expect.objectContaining({
				number: 1,
				side: "army",
				fighter: expect.objectContaining({ id: LATE_EVENING }),
				forced: true,
			}),
		]);
		expect(journal.summary).toEqual({
			outcome: "victory",
			actionCount: 1,
			armyLife: expect.any(Number),
			monsterLife: 0,
			drawn: [LATE_EVENING],
			unreachedForced: [{ id: DAY_BEFORE, position: "last" }],
		});
		// Au premier combat de la saison, le budget du monstre est l'armée du jour.
		const { army, monster } = await headerOf(client, 1);
		expect(monster.stats).toEqual(slugSizedOn(army.stats, 1e-6));
	});

	test("un jour sans combat : refusé, le message dit le jour et la saison", async () => {
		await expectRefusal(
			"lire_journal",
			{ jour: 2 },
			"aucun combat au jour 2 de la saison 1",
		);
	});

	test.each<[unknown, string]>([
		[0, ">=1"],
		[1.5, "expected int"],
		["1", "expected number"],
	])("un jour %j : refusé", async (jour, message) => {
		await expectRefusal("lire_journal", { jour }, message);
	});
});
