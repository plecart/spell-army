import { characterOf, drawSpell, type SpellEntry } from "personnages";
import {
	type CharacterClass,
	type Fighter,
	STARTING_POOL,
	type Spell,
	type Stats,
} from "../src/index.ts";

/** L'effectif d'une armée de simulation (game design § 6, « Équilibre » : 1 000 personnages). */
export const ARMY_SIZE = 1000;

/** Les graines 1 à 2 000 de l'équilibre (critère de l'issue #19), en texte. */
export const SEEDS: readonly string[] = Array.from(
	{ length: 2000 },
	(_, index) => String(index + 1),
);

/** Le délai d'un test qui simule des milliers de combats sur des armées de 1 000. */
export const SIMULATION_TIMEOUT = 120_000;

/** Classe et stats d'un personnage, par `characterOf` : elles ne dépendent pas de la réserve. */
interface Recruit {
	id: string;
	characterClass: CharacterClass;
	stats: Stats;
}

const recruits = new Map<string, readonly Recruit[]>();
const draws = new WeakMap<readonly Spell[], Draw>();

/** La réserve, lue par `drawSpell` (`SpellEntry`) et par numéro. */
interface Draw {
	entries: SpellEntry[];
	byNumber: Map<string, Spell>;
}

/**
 * L'armée de la graine `seed` : 1 000 personnages calculés par `characterOf` sur les identifiants
 * `seed × 1 000` à `seed × 1 000 + 999`, chacun avec le sort que `drawSpell` lui tire dans `pool`.
 * Classe et stats se calculent une fois par graine et se gardent : d'une réserve à l'autre, seuls
 * les sorts changent.
 */
export function armyOf(
	seed: string,
	pool: readonly Spell[] = STARTING_POOL,
): Fighter[] {
	return recruitsOf(seed).map((recruit) => new Drafted(recruit, pool));
}

function recruitsOf(seed: string): readonly Recruit[] {
	let army = recruits.get(seed);
	if (army === undefined) {
		army = Array.from({ length: ARMY_SIZE }, (_, index) => {
			const id = String(Number(seed) * ARMY_SIZE + index);
			const { class: characterClass, stats } = characterOf(id);
			return { id, characterClass, stats };
		});
		recruits.set(seed, army);
	}
	return army;
}

/**
 * Un personnage dont le sort se tire à sa première lecture : le combat ne lit que celui de la
 * dizaine de tirés (game design § 4), et le tirer pour les 1 000 coûterait 1 000 appels de
 * `drawSpell` par armée et par réserve.
 */
class Drafted implements Fighter {
	readonly id: string;
	readonly characterClass: CharacterClass;
	readonly stats: Stats;
	readonly #pool: readonly Spell[];
	#spell: Spell | undefined;

	constructor({ id, characterClass, stats }: Recruit, pool: readonly Spell[]) {
		this.id = id;
		this.characterClass = characterClass;
		this.stats = stats;
		this.#pool = pool;
	}

	get spell(): Spell {
		this.#spell ??= spellIn(this.id, this.#pool);
		return this.#spell;
	}
}

function spellIn(id: string, pool: readonly Spell[]): Spell {
	let draw = draws.get(pool);
	if (draw === undefined) {
		draw = {
			entries: pool.map(({ number, weight }) => ({
				id: String(number),
				weight,
			})),
			byNumber: new Map(pool.map((spell) => [String(spell.number), spell])),
		};
		draws.set(pool, draw);
	}
	return draw.byNumber.get(drawSpell(id, draw.entries)) as Spell;
}
