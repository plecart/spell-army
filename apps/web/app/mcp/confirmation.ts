import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { McpTool } from "./tool.ts";

// La confirmation par code des outils destructeurs (ADR 0004, « Durcissement MCP » ; ADR 0005,
// « Décisions », ligne « Confirmation »).

// La durée de validité d'un code, à compter de son émission.
const LIFETIME_MINUTES = 5;
const CONFIRMATION_LIFETIME_MS = LIFETIME_MINUTES * 60_000;

// Le libellé de la dérivation de la clé : la clé des codes n'est jamais le jeton lui-même.
const KEY_LABEL = "spell-army/mcp/confirmation";

// Un code : `<expiration en ms depuis l'époque>.<HMAC-SHA256 en base64url>`. L'expiration s'écrit
// sans zéro de tête, en au plus 15 chiffres : un entier que `Number` lit exactement, et que
// `JSON.stringify` réécrit à l'identique dans le message signé. Les 32 octets de l'HMAC s'écrivent
// en 43 caractères, sans remplissage.
const MAX_EXPIRATION_DIGITS = 15;
const MAC_LENGTH = 43;
const CODE = new RegExp(
	`^([1-9][0-9]{0,${MAX_EXPIRATION_DIGITS - 1}})[.]([A-Za-z0-9_-]{${MAC_LENGTH}})$`,
);

const CODE_FIELD = z
	.string()
	.max(MAX_EXPIRATION_DIGITS + 1 + MAC_LENGTH)
	.optional()
	.describe("Le code rendu par l'appel sans code, pour ces mêmes paramètres.");

const CONFIRMATION = z.strictObject({
	description: z.string(),
	code: z.string(),
	expiration: z.iso.datetime(),
});

const NOTICE = `Outil destructeur : un premier appel sans code ne change rien, et rend la description de ce que fera l'appel et un code valable ${LIFETIME_MINUTES} minutes. Montre cette description au mainteneur, et ne renvoie le code, avec les mêmes paramètres, qu'avec son accord explicite.`;
const REFUSED =
	"Code refusé (périmé, modifié ou obtenu pour d'autres paramètres) : rien n'a été fait.";
const NO_KEY =
	"Confirmation impossible : aucune clé de confirmation, rien n'a été fait.";
const ONE_KEY =
	"La sortie porte la confirmation ou le résultat, l'un des deux exactement.";

/**
 * La clé des codes de confirmation, dérivée du jeton du serveur par HMAC-SHA256 sous un libellé
 * propre à la confirmation. Aucun secret de plus : changer le jeton invalide les codes en cours.
 *
 * @param token le jeton configuré, `MCP_TOKEN`.
 */
export function confirmationKey(token: string): Buffer {
	return createHmac("sha256", token).update(KEY_LABEL).digest();
}

/**
 * L'outil tel que l'enrobage le sert : lui-même s'il ne déclare pas `confirmation` ; sinon, sous
 * confirmation par code. `listTools` publie chaque outil par elle, et `callTool` l'exécute ainsi.
 *
 * Servi, un outil confirmable garde son nom, son titre, ses indices et sa gestion des transactions :
 * `confirmation` et `run` reçoivent la transaction de l'enrobage, ou le client racine pour un outil
 * `ownsTransactions`. Sa description est suivie d'une phrase commune qui dit le protocole en deux
 * appels. Son entrée gagne un champ `code` facultatif. Sa sortie devient une enveloppe à une clé
 * exactement :
 * - sans code valide, `run` n'est pas appelé, et `confirmation`, en lecture seule, ne change rien :
 *   `{ confirmation: { description, code, expiration } }`. La description est celle de
 *   `confirmation`, précédée du refus quand un code était donné ; le code est neuf, et son
 *   expiration en ISO 8601. Ni avant ni après à l'audit ;
 * - avec un code valide, `run` reçoit l'entrée sans le code : `{ resultat }`, sa sortie, et son
 *   avant et son après à l'audit.
 *
 * Un code est valide si et seulement si il a la forme `<expiration en ms>.<HMAC en base64url>`, que
 * l'instant présent ne dépasse pas l'expiration, et que son HMAC est celui que `key` donne au nom de
 * l'outil, aux paramètres et à l'expiration (`sign`). Il est donc refusé absent, mal formé, modifié,
 * périmé, ou émis pour d'autres paramètres, un autre outil ou une autre clé.
 *
 * Limite : rien n'est stocké, et un code n'est pas à usage unique. Rejoué avant son expiration, il
 * exécute de nouveau l'appel : le mécanisme suppose un outil idempotent.
 *
 * @param tool un outil du registre.
 * @param key la clé des codes (`confirmationKey`). Absente, un outil confirmable refuse tout appel
 * par une erreur, sans appeler ni `confirmation` ni `run` : la confirmation se refuse par défaut.
 * @throws une erreur qui nomme l'outil quand il est confirmable et que son entrée déclare un champ
 * `code` : `extend` le remplacerait par celui de la confirmation sans rien dire, et `run` ne le
 * recevrait jamais.
 */
export function servedTool(tool: McpTool, key?: Uint8Array): McpTool {
	const { confirmation } = tool;
	if (confirmation === undefined) {
		return tool;
	}
	if ("code" in tool.input.shape) {
		throw new Error(
			`L'outil ${tool.name} déclare un champ code, que sa confirmation réserve.`,
		);
	}
	const input = tool.input.extend({ code: CODE_FIELD });
	const served: McpTool<typeof input> = {
		...tool,
		description: `${tool.description} ${NOTICE}`,
		input,
		output: envelope(tool.output),
		run: async (executor, { code, ...params }) => {
			if (key === undefined) {
				throw new Error(NO_KEY);
			}
			if (typeof code === "string" && isValid(key, tool.name, params, code)) {
				const { output, before, after } = await tool.run(executor, params);
				return { output: { resultat: output }, before, after };
			}
			const description = await confirmation(executor, params);
			return {
				output: {
					confirmation: {
						description:
							code === undefined ? description : `${REFUSED} ${description}`,
						...issue(key, tool.name, params),
					},
				},
			};
		},
	};
	return served;
}

/** La sortie servie d'un outil confirmable, de sortie `output` : la confirmation, ou son résultat. */
function envelope(output: z.ZodObject) {
	return (
		z
			.strictObject({
				confirmation: CONFIRMATION.optional(),
				resultat: output.optional(),
			})
			.refine(
				({ confirmation, resultat }) =>
					(confirmation === undefined) !== (resultat === undefined),
				ONE_KEY,
			)
			// Le `refine` ne passe pas dans le schéma JSON : l'une des deux clés exactement.
			.meta({ minProperties: 1, maxProperties: 1 })
	);
}

/** Un code neuf pour l'appel de `tool` avec `params`, et son expiration en ISO 8601. */
function issue(key: Uint8Array, tool: string, params: unknown) {
	const expiration = Date.now() + CONFIRMATION_LIFETIME_MS;
	return {
		code: `${expiration}.${sign(key, tool, params, expiration)}`,
		expiration: new Date(expiration).toISOString(),
	};
}

/**
 * Vrai si `code` est valide pour l'appel de `tool` avec `params`. Les HMAC se comparent sous leur
 * forme écrite, par `timingSafeEqual` : décodé, le dernier caractère de base64url admet un voisin
 * qui donne les mêmes octets (Node 24.3, mesuré le 2026-11-21). La forme du code fixe la longueur
 * de l'HMAC reçu à celle de l'HMAC calculé, que `timingSafeEqual` exige.
 */
function isValid(
	key: Uint8Array,
	tool: string,
	params: unknown,
	code: string,
): boolean {
	const [, expiration, mac] = CODE.exec(code) ?? [];
	if (expiration === undefined || mac === undefined) {
		return false;
	}
	return (
		Date.now() <= Number(expiration) &&
		timingSafeEqual(
			Buffer.from(mac),
			Buffer.from(sign(key, tool, params, Number(expiration))),
		)
	);
}

/**
 * L'HMAC-SHA256 en base64url, sous `key`, de `[tool, params, expiration]` en JSON, les clés de
 * chaque objet de `params` triées à toute profondeur — les clés entières en tête, croissantes,
 * l'ordre où `JSON.stringify` écrit toujours celles d'un objet : deux entrées qui ne diffèrent que
 * par l'ordre de leurs clés reçoivent le même code. Les paramètres sont lus tels que
 * `JSON.stringify` les écrit.
 */
function sign(
	key: Uint8Array,
	tool: string,
	params: unknown,
	expiration: number,
): string {
	const message = JSON.stringify([tool, params, expiration], (_, value) =>
		value !== null && typeof value === "object" && !Array.isArray(value)
			? Object.fromEntries(
					Object.keys(value)
						.sort()
						.map((name) => [name, value[name]]),
				)
			: value,
	);
	return createHmac("sha256", key).update(message).digest("base64url");
}
