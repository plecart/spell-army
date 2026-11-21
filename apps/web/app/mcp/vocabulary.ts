import type { PassLogEntry } from "joueurs";
import type { ClassKey } from "personnages";
import { z } from "zod";

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

/**
 * Le nom de chaque type de passe d'import dans les outils (ADR 0003, « Passe rapide », « Passe
 * complète »).
 */
export const PASS_KINDS = {
	quick: "rapide",
	full: "complete",
} as const satisfies Record<PassLogEntry["kind"], string>;

/** Le type de passe de `joueurs` de chaque nom de type des outils. */
export const PASS_KIND_OF = inverse(PASS_KINDS);

// Le nom de chaque déclencheur et de chaque état d'une passe.
const PASS_TRIGGERS = {
	tick: "tic",
	mcp: "mcp",
	weekly: "hebdomadaire",
	self_check: "auto_controle",
} as const satisfies Record<PassLogEntry["trigger"], string>;
const PASS_STATUSES = {
	running: "en_cours",
	interrupted: "interrompue",
	failed: "en_erreur",
	done: "terminee",
} as const satisfies Record<PassLogEntry["status"], string>;

/**
 * Une passe du journal de l'import (ADR 0003, « Journal ») sous les noms des outils, champ par champ
 * dans cet ordre. Les instants en ISO 8601 ; la fin, celle du dernier arrêt, nulle en cours ; les
 * entrées écartées comptées par motif ; l'erreur, nulle hors d'une passe en erreur.
 */
export const toolPass = z.strictObject({
	type: z.enum(PASS_KINDS),
	declencheur: z.enum(PASS_TRIGGERS),
	etat: z.enum(PASS_STATUSES),
	debut: z.iso.datetime(),
	fin: z.iso.datetime().nullable(),
	pages: z.int(),
	ajouts: z.int(),
	ecartes: z.strictObject({
		identifiant_invalide: z.int(),
		pseudo_invalide: z.int(),
	}),
	erreur: z.string().nullable(),
});

/**
 * La passe `entry` sous les noms des outils (`toolPass`), telle que la rendent les outils de
 * l'import. Ses champs se nomment un par un : rien d'autre ne passe, ni curseur ni identifiant.
 */
export function toToolPass(entry: PassLogEntry): z.output<typeof toolPass> {
	return {
		type: PASS_KINDS[entry.kind],
		declencheur: PASS_TRIGGERS[entry.trigger],
		etat: PASS_STATUSES[entry.status],
		debut: entry.startedAt.toISOString(),
		fin: entry.finishedAt?.toISOString() ?? null,
		pages: entry.pages,
		ajouts: entry.added,
		ecartes: {
			identifiant_invalide: entry.invalidIds,
			pseudo_invalide: entry.invalidUsernames,
		},
		erreur: entry.error,
	};
}
