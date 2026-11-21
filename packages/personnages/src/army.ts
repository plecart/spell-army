import { type ClassKey, characterOf, type Stats } from "./character.ts";
import { drawSpell, type SpellEntry } from "./spell.ts";

/** L'effectif d'une armée de simulation (game design § 6, « Équilibre » : 1 000 personnages). */
const ARMY_SIZE = 1000;

/** Un sort d'une réserve numérotée : `drawSpell` le tire sous son numéro en texte. */
interface NumberedSpell {
	number: number;
	weight: number;
}

/** Un personnage d'une armée de simulation, sous la forme du `Fighter` de `combat`. */
interface Recruit<Spell> {
	readonly id: string;
	readonly characterClass: ClassKey;
	readonly stats: Stats;
	readonly spell: Spell;
}

/** Un personnage avant son sort : ce qui se garde d'une réserve à l'autre. */
type Enlisted = Omit<Recruit<unknown>, "spell">;

/** Une réserve, lue par `drawSpell` (`SpellEntry`) et par numéro en texte. */
interface Draw<Spell> {
	entries: SpellEntry[];
	byNumber: Map<string, Spell>;
}

/**
 * Les armées de simulation (game design § 6, « Équilibre ») : l'armée de la graine `seed` compte
 * 1 000 personnages calculés par `characterOf` sur les identifiants `seed × 1 000` à
 * `seed × 1 000 + 999`, chacun avec le sort que `drawSpell` lui tire dans la réserve `pool`.
 *
 * Classe et stats d'une graine gardée servent à ses armées suivantes, d'une réserve à l'autre :
 * seuls les sorts changent. La fabrique garde les personnages des `keptSeeds` dernières graines
 * calculées : la dernière seulement par défaut, assez pour une mesure qui tire chaque graine dans
 * deux réserves à la suite ; `Infinity` pour plusieurs mesures sur les mêmes graines.
 */
export function simulationArmies<Spell extends NumberedSpell>(
	keptSeeds = 1,
): (seed: string, pool: readonly Spell[]) => Recruit<Spell>[] {
	const enlisted = new Map<string, readonly Enlisted[]>();
	const draws = new WeakMap<readonly Spell[], Draw<Spell>>();

	const enlist = (seed: string): readonly Enlisted[] => {
		let army = enlisted.get(seed);
		if (army === undefined) {
			army = Array.from({ length: ARMY_SIZE }, (_, index) => {
				const id = String(Number(seed) * ARMY_SIZE + index);
				const { class: characterClass, stats } = characterOf(id);
				return { id, characterClass, stats };
			});
			enlisted.set(seed, army);
			if (enlisted.size > keptSeeds) {
				enlisted.delete(enlisted.keys().next().value as string);
			}
		}
		return army;
	};

	const drawIn = (pool: readonly Spell[]): Draw<Spell> => {
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
		return draw;
	};

	return (seed, pool) => {
		const draw = drawIn(pool);
		return enlist(seed).map((recruit) => new Drafted(recruit, draw));
	};
}

/**
 * Un personnage dont le sort se tire à sa première lecture : le combat ne lit que celui de la
 * dizaine de tirés (game design § 4), et le tirer pour les 1 000 coûterait 1 000 appels de
 * `drawSpell` par armée et par réserve.
 */
class Drafted<Spell> implements Recruit<Spell> {
	readonly id: string;
	readonly characterClass: ClassKey;
	readonly stats: Stats;
	readonly #draw: Draw<Spell>;
	#spell: Spell | undefined;

	constructor({ id, characterClass, stats }: Enlisted, draw: Draw<Spell>) {
		this.id = id;
		this.characterClass = characterClass;
		this.stats = stats;
		this.#draw = draw;
	}

	get spell(): Spell {
		this.#spell ??= this.#draw.byNumber.get(
			drawSpell(this.id, this.#draw.entries),
		) as Spell;
		return this.#spell;
	}
}
