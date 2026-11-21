// Les bornes de `INSTAGRAM_ID_PATTERN` et `INSTAGRAM_USERNAME_PATTERN` (`src/schema.ts`). Le contrôle
// de la base (`test/joueurs.test.ts`) et le tri des entrées du paquet `joueurs` les éprouvent sur
// cette même population : les expressions rationnelles de Postgres et de JavaScript s'y accordent.

/** 30 caractères, la borne haute, avec chacun des signes admis. */
export const LONGEST_USERNAME = `Ab.9_${"z".repeat(25)}`;

/** 2^64, hors de tout entier de 64 bits et pourtant dans la forme : aucune borne de longueur. */
export const LONG_ID = "18446744073709551616";

/** Hors de la forme `^[1-9][0-9]*$` : chaque cas, nommé. */
export const MALFORMED_IDS: [name: string, id: string][] = [
	["un identifiant à zéro de tête", "007"],
	["l'identifiant 0", "0"],
	["un identifiant non numérique", "abc"],
	["un identifiant vide", ""],
	["un identifiant suivi d'un saut de ligne", "12\n"],
	["un identifiant en chiffres arabes-indiens", "١٢"],
];

/**
 * Hors de la forme `^[A-Za-z0-9._]{1,30}$` : chaque cas, nommé. « é » et « ü » éprouvent les plages
 * `A-Z` et `a-z` hors de l'ASCII.
 */
export const MALFORMED_USERNAMES: [name: string, username: string][] = [
	["un pseudo vide", ""],
	["un pseudo à espace", "a b"],
	["un pseudo à tiret", "a-b"],
	["un pseudo de 31 caractères", `${LONGEST_USERNAME}z`],
	["un pseudo à « é »", "é"],
	["un pseudo à « ü »", "ü"],
];
