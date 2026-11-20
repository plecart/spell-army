import type { ClassKey } from "personnages";

// Le vocabulaire commun des outils. Les noms des outils sont en français comme ceux des réglages
// (`settings-tools.ts`, décision du mainteneur du 2026-11-17), et sans accents comme eux : une table
// de correspondance par vocabulaire fermé du modèle, que son type exige complète, lue dans un sens
// par les sorties et, inversée, par les entrées.

type Inverse<Names extends Record<string, string>> = {
	[Key in keyof Names as Names[Key]]: Key;
};

/** La table inverse de `names` : pour chaque nom d'outil, le nom du modèle. */
export function inverse<const Names extends Record<string, string>>(
	names: Names,
): Inverse<Names> {
	return Object.fromEntries(
		Object.entries(names).map(([key, name]) => [name, key]),
	) as Inverse<Names>;
}

/**
 * Le nom de chaque classe dans les outils (game design § 1, « Classe »), pour chaque classe de
 * `personnages`, la même que `CharacterClass` de `combat` (`test/outils-des-sorts.test.ts`).
 */
export const CLASSES = {
	wizard: "magicien",
	golem: "golem",
	warrior: "guerrier",
	dwarf: "nain",
	vampire: "vampire",
	druid: "druide",
	peasant: "paysan",
	fairy: "fee",
} as const satisfies Record<ClassKey, string>;

/** La classe du modèle de chaque nom de classe des outils. */
export const CLASS_OF = inverse(CLASSES);
