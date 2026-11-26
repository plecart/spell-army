import {
	ATTACK_COUNT,
	MEAN_COEFFICIENT,
	type MonsterDesign,
	type Sample,
	type Spell,
	scaleFactor,
	validateMonster,
} from "combat";
import {
	deleteMonsterByName,
	type Executor,
	findMonsterByName,
	insertMonster,
	listMonsters,
	listSpells,
	MAX_MONSTER_NAME_LENGTH,
	type MonsterRecord,
	postgresErrorCode,
} from "donnees";
import { simulationArmies } from "personnages";
import { z } from "zod";
import { grouped, text } from "./bounds.ts";
import { SAMPLE_LAST_SEED, sampleSeeds } from "./sample.ts";
import {
	MAX_DESCRIPTION_LENGTH,
	MAX_NAME_LENGTH,
	spellOf,
} from "./spell-vocabulary.ts";
import { type McpTool, refuseIfAny } from "./tool.ts";
import {
	modelStats,
	renamed,
	STAT_OF,
	STATS,
	toolStats,
} from "./vocabulary.ts";

// Le bestiaire (issue #20) : un monstre dans les noms français des outils, ses schémas Zod, sa
// traduction dans le modèle de `combat` (`MonsterDesign`) et retour, et les trois outils.

// Les règles d'un monstre (game design § 3) que disent les descriptions : le nombre d'attaques, et
// leur coefficient moyen en notation française.
const ATTACK_COUNT_TEXT = `${ATTACK_COUNT.min} à ${ATTACK_COUNT.max}`;
const MEAN_COEFFICIENT_TEXT = `×${String(MEAN_COEFFICIENT).replace(".", ",")}`;

// Une part en % d'une recette d'attaque, facultative comme celle d'une recette de sort, dans les deux
// vocabulaires.
const share = z.number().optional();

/**
 * Un monstre dans le vocabulaire des outils, que rendent les trois outils. Le schéma fixe le type et
 * la présence de chaque champ, les bornes de la saison, du chapitre et des textes ; le nombre
 * d'attaques, les parts, les coefficients et leur moyenne, et les multiplicateurs ne se valident
 * qu'à `validateMonster`.
 */
const toolMonster = z.strictObject({
	saison: z
		.int32()
		.min(1)
		.describe("La saison du monstre : un entier, au moins 1."),
	chapitre: z
		.int32()
		.min(1)
		.describe(
			"Le chapitre de la saison où le monstre se combat, un monstre au plus par chapitre : un entier, au moins 1.",
		),
	nom: text(MAX_MONSTER_NAME_LENGTH).describe(
		`Le nom du monstre, unique toutes saisons confondues, sous lequel deposer_fichier_3d range ses fichiers : 1 à ${MAX_MONSTER_NAME_LENGTH} caractères, sans les blancs qui l'entourent.`,
	),
	profil: toolStats.describe(
		"Le multiplicateur de chaque stat, qui répartit le budget du monstre (game design § 3, « Profil ») : un nombre ≥ 0, 1 gardant le budget.",
	),
	attaques: z
		.array(
			z.strictObject({
				nom: text(MAX_NAME_LENGTH),
				recette: z.strictObject({
					[STATS.strength]: share,
					[STATS.magic]: share,
				}),
				coefficient: z.number(),
			}),
		)
		.describe(
			`De ${ATTACK_COUNT_TEXT} attaques, de noms distincts d'au plus ${MAX_NAME_LENGTH} caractères. La recette : des parts entières en % de la Force et de la Magie du monstre, de somme 100. Le coefficient : un nombre > 0, ×1,0 pour un coup normal ; la moyenne des coefficients vaut ${MEAN_COEFFICIENT_TEXT} au centième.`,
		),
	facteur_echelle: z
		.number()
		.describe(
			"Le facteur d'échelle de son profil et de ses attaques, calculé à la création : celui pour lequel le monstre égal à l'armée lui laisse 50 % de victoires.",
		),
	particularite: text(MAX_DESCRIPTION_LENGTH).describe(
		`La particularité du monstre, un texte sans effet au combat : non vide, au plus ${MAX_DESCRIPTION_LENGTH} caractères.`,
	),
});

/** Un monstre à créer : son facteur d'échelle se calcule. */
const newMonster = toolMonster.omit({ facteur_echelle: true });

const removal = toolMonster.pick({ nom: true });

// Le profil et les attaques tels que la table les porte : le modèle de `combat`.
const storedDesign = z.strictObject({
	profile: modelStats,
	attacks: z.array(
		z.strictObject({
			name: z.string(),
			recipe: z.strictObject({ strength: share, magic: share }),
			coefficient: z.number(),
		}),
	),
});

type ToolMonster = z.output<typeof toolMonster>;
type NewToolMonster = z.output<typeof newMonster>;

/** Le profil et les attaques d'un monstre à créer, dans le modèle de `combat`. */
function modelDesign({ profil, attaques }: NewToolMonster): MonsterDesign {
	return {
		profile: renamed(profil, STAT_OF),
		attacks: attaques.map(({ nom, recette, coefficient }) => ({
			name: nom,
			recipe: renamed(recette, STAT_OF),
			coefficient,
		})),
	};
}

/**
 * Le profil et les attaques d'une ligne de la table, que `donnees` rend sans les lire : relus par
 * `storedDesign`, jamais pris sur parole. Une ligne qui n'a pas la forme du modèle lève.
 */
export function designOf({ profile, attacks }: MonsterRecord): MonsterDesign {
	return storedDesign.parse({ profile, attacks });
}

/** Un monstre de la table dans le vocabulaire des outils, les stats sous les noms de `STATS`. */
function toToolMonster(record: MonsterRecord): ToolMonster {
	const { profile, attacks } = designOf(record);
	return {
		saison: record.season,
		chapitre: record.chapter,
		nom: record.name,
		profil: renamed(profile, STATS),
		attaques: attacks.map(({ name, recipe, coefficient }) => ({
			nom: name,
			recette: renamed(recipe, STATS),
			coefficient,
		})),
		facteur_echelle: record.scaleFactor,
		particularite: record.trait,
	};
}

/** Une contrainte d'unicité de la table : quand un monstre en place la viole, et son refus. */
interface Uniqueness {
	takenBy(monster: MonsterRecord, input: NewToolMonster): boolean;
	refusal(input: NewToolMonster): string;
}

// Les contraintes d'unicité de la table, sous leur nom : la lecture préalable et l'insertion — qu'une
// course entre deux appels fait échouer — refusent par le même message.
const UNIQUENESS = new Map<string, Uniqueness>([
	[
		"monsters_name_unique",
		{
			takenBy: (monster, { nom }) => monster.name === nom,
			refusal: ({ nom }) =>
				`un monstre porte déjà le nom « ${nom} », toutes saisons confondues`,
		},
	],
	[
		"monsters_season_chapter_unique",
		{
			takenBy: (monster, { saison, chapitre }) =>
				monster.season === saison && monster.chapter === chapitre,
			refusal: ({ saison, chapitre }) =>
				`la saison ${saison} a déjà un monstre au chapitre ${chapitre}`,
		},
	],
]);

// Le code Postgres d'une violation d'unicité.
const UNIQUE_VIOLATION = "23505";

/** Les refus du nom et du chapitre de `input`, chacun s'il est déjà pris dans `bestiary`. */
function takenErrors(
	bestiary: readonly MonsterRecord[],
	input: NewToolMonster,
): string[] {
	return [...UNIQUENESS.values()]
		.filter(({ takenBy }) =>
			bestiary.some((monster) => takenBy(monster, input)),
		)
		.map(({ refusal }) => refusal(input));
}

/** Le refus d'une violation d'unicité de la table, ou `error` telle quelle. */
function takenRefusal(error: unknown, input: NewToolMonster): unknown {
	const postgres = postgresErrorCode(error);
	const uniqueness =
		postgres?.code === UNIQUE_VIOLATION
			? UNIQUENESS.get(postgres.constraint ?? "")
			: undefined;
	return uniqueness ? new Error(uniqueness.refusal(input)) : error;
}

/**
 * L'échantillon du facteur d'échelle, comme celui de mesurer_sort : les graines `seeds`, l'armée de
 * chacune construite par `simulationArmies` et tirée dans la réserve en base.
 */
async function sampleOf(
	executor: Executor,
	seeds: readonly string[],
): Promise<Sample> {
	const pool = (await listSpells(executor)).map(spellOf);
	const armies = simulationArmies<Spell>();
	return { seeds, armyOf: (seed) => armies(seed, pool) };
}

/** Ce que fera le retrait de `nom`, d'après `monster`, le monstre de ce nom s'il y en a un. */
function describeRemoval(
	nom: string,
	monster: MonsterRecord | undefined,
): string {
	if (monster === undefined) {
		return `Aucun monstre ne porte le nom « ${nom} » : rien à retirer.`;
	}
	return `Retirera le monstre « ${nom} », chapitre ${monster.chapter} de la saison ${monster.season} : sa ligne entière, profil, attaques, facteur d'échelle et particularité, et libérera ce chapitre pour creer_monstre. Ses fichiers 3D restent rangés sous son nom, qu'un monstre recréé sous ce nom retrouve. Sans annulation.`;
}

export const listMonstersTool: McpTool = {
	name: "lister_monstres",
	title: "Lister les monstres du bestiaire",
	description:
		"Liste les monstres du bestiaire par saison, puis par chapitre : saison, chapitre, nom, profil, attaques, facteur d'échelle et particularité, sous les noms qu'attend creer_monstre.",
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: z.strictObject({}),
	output: z.strictObject({ monstres: z.array(toolMonster) }),
	run: async (executor) => ({
		output: { monstres: (await listMonsters(executor)).map(toToolMonster) },
	}),
};

/**
 * `creer_monstre` (issue #20) : valide le monstre (`validateMonster`), refuse un nom ou un chapitre
 * déjà pris avant tout calcul, calcule son facteur d'échelle (`scaleFactor`) sur son profil et ses
 * attaques, les graines 1 à `lastSeed` et des armées tirées dans la réserve en base, puis le range.
 * Sans facteur de ÷8 à ×8, `scaleFactor` lève : le refus le dit, et rien n'est écrit.
 *
 * L'outil gère ses transactions (ADR 0005, « Conséquences ») : il lit, simule sans tenir de
 * transaction, puis range le monstre, et sa ligne d'audit s'écrit après. `idempotentHint` : un
 * second appel identique trouve le nom pris, refusé sans rien écrire.
 */
export function createMonsterTool(
	lastSeed = SAMPLE_LAST_SEED,
): McpTool<typeof newMonster> {
	const seeds = sampleSeeds(lastSeed);
	return {
		name: "creer_monstre",
		title: "Créer un monstre",
		description: `Crée le monstre d'un chapitre d'une saison : son nom, unique toutes saisons confondues ; son profil, un multiplicateur ≥ 0 par stat ; de ${ATTACK_COUNT_TEXT} attaques de noms distincts, chacune une recette en parts entières de la Force et de la Magie, de somme 100, et un coefficient > 0, de moyenne ${MEAN_COEFFICIENT_TEXT} au centième ; sa particularité, un texte sans effet. Calcule son facteur d'échelle, celui pour lequel le monstre égal à l'armée lui laisse 50 % de victoires, en simulant son profil et ses attaques contre des armées tirées dans la réserve en base, sur les graines 1 à ${grouped(lastSeed)}. Refuse sans rien écrire un monstre invalide, un nom ou un chapitre déjà pris, et un monstre qu'aucun facteur d'échelle n'équilibre. Rend le monstre créé, comme lister_monstres ; son fichier 3D se dépose ensuite par deposer_fichier_3d. Un monstre se corrige par retirer_monstre, puis creer_monstre.`,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
		input: newMonster,
		output: toolMonster,
		ownsTransactions: true,
		run: async (executor, input) => {
			const design = modelDesign(input);
			refuseIfAny(validateMonster(design));
			refuseIfAny(takenErrors(await listMonsters(executor), input));
			const scale = scaleFactor(design, await sampleOf(executor, seeds));
			const record = await insertMonster(executor, {
				season: input.saison,
				chapter: input.chapitre,
				name: input.nom,
				...design,
				scaleFactor: scale,
				trait: input.particularite,
			}).catch((error: unknown) => {
				throw takenRefusal(error, input);
			});
			const created = toToolMonster(record);
			return { output: created, after: created };
		},
	};
}

/**
 * `retirer_monstre` (issue #20, Décisions, 2), outil destructeur : l'enrobage exige un code de
 * confirmation (ADR 0005, « Décisions », ligne « Confirmation »), et `confirmation` décrit le retrait
 * d'après le monstre en place. `idempotentHint` : un retrait rejoué ne retire rien, et le dit. Les
 * fichiers 3D du monstre restent : aucune clé ne les lie à la table.
 */
export const removeMonsterTool: McpTool<typeof removal> = {
	name: "retirer_monstre",
	title: "Retirer un monstre",
	description:
		"Retire le monstre de ce nom : sa ligne entière, profil, attaques, facteur d'échelle et particularité, ce qui libère son chapitre pour creer_monstre ; un monstre se corrige ainsi, puis se recrée. Ses fichiers 3D restent rangés sous son nom, et un monstre recréé sous ce nom les retrouve. Un nom qu'aucun monstre ne porte ne retire rien. Sans annulation. Rend le nom et le monstre retiré, null quand il n'y en avait aucun ; le journal d'audit garde le monstre retiré.",
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: removal,
	output: z.strictObject({
		nom: toolMonster.shape.nom,
		retire: toolMonster
			.nullable()
			.describe(
				"Le monstre retiré, tel qu'il était ; null quand aucun monstre ne portait ce nom : rien n'a été retiré.",
			),
	}),
	confirmation: async (executor, { nom }) =>
		describeRemoval(nom, await findMonsterByName(executor, nom)),
	run: async (executor, { nom }) => {
		const removed = await deleteMonsterByName(executor, nom);
		const retire = removed === undefined ? null : toToolMonster(removed);
		return { output: { nom, retire }, before: retire };
	},
};
