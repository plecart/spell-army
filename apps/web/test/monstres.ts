import { REFERENCE_ATTACKS } from "combat";
import { type Executor, insertMonster, type NewMonster } from "donnees";

/**
 * La limace, rangée comme creer_monstre la rangerait — un multiplicateur distinct par stat, les
 * attaques de référence —, au premier chapitre de la première saison, son facteur d'échelle pris
 * tel quel, sans simulation.
 */
const SLUG: NewMonster = {
	season: 1,
	chapter: 1,
	name: "limace",
	profile: { life: 1.5, strength: 0.8, magic: 1.2, speed: 0.5 },
	attacks: REFERENCE_ATTACKS,
	scaleFactor: 1.1,
	trait: "Laisse une traînée qui ralentit.",
};

/** Range la limace en base, ses champs `fields` changés, et la rend telle qu'écrite. */
export function storeMonster(db: Executor, fields: Partial<NewMonster> = {}) {
	return insertMonster(db, { ...SLUG, ...fields });
}
