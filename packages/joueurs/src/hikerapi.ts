import { INSTAGRAM_ID_PATTERN } from "donnees";
import type { FollowerEntry } from "./entries.ts";
import {
	type FollowerPage,
	type FollowerProvider,
	ProviderError,
} from "./provider.ts";

/** Les réglages de l'adaptateur HikerAPI. */
export interface HikerApiOptions {
	/** La clé d'accès, secrète, envoyée en en-tête `x-access-key` ; non vide. */
	accessKey: string;
	/** L'identifiant Instagram du compte dont on lit les abonnés, de forme `INSTAGRAM_ID_PATTERN`. */
	accountId: string;
	/** Le `fetch` appelé : celui de Node par défaut, un faux dans les tests. */
	fetch?: (url: URL, init: RequestInit) => Promise<Response>;
	/** L'origine de l'API : `https://api.hikerapi.com` par défaut. */
	baseUrl?: string;
	/** Le délai d'un appel, lecture du corps comprise, en millisecondes : 30 000 par défaut. */
	timeoutMs?: number;
}

const FOLLOWERS_ROUTE = "/g2/user/followers";
const USER_ROUTE = "/v1/user/by/id";
// Le délai d'un appel que suppose le budget du tic (`tic.ts`, `DEFAULT_BUDGET_MS`).
const DEFAULT_TIMEOUT_MS = 30_000;
// Un curseur reçu est gardé tel quel au journal et renvoyé dans l'URL de la page suivante : plus
// long, il est refusé. En base64, comme l'exemple de la spec 1.8.4, il garde l'URL sous les
// 8 000 octets que la RFC 9110 (§ 4.1) recommande d'accepter.
const MAX_CURSOR_LENGTH = 2048;

/**
 * L'adaptateur HikerAPI du fournisseur (ADR 0003, « Fournisseur ») : la liste des abonnés du compte
 * lu par `GET /g2/user/followers`, page après page (`page_id`, puis le `next_page_id` reçu, nul en
 * fin de liste), et le nombre d'abonnés qu'il affiche par `GET /v1/user/by/id` (spec 1.8.4).
 *
 * Chaque appel porte la clé en en-tête `x-access-key`, se borne à `timeoutMs` et ne suit aucune
 * redirection : la clé ne part jamais vers une autre origine. Aucun n'est retenté : une page en
 * échec clôt la passe, et le tic suivant reprend au curseur (ADR 0003, « Mode dégradé »).
 *
 * Tout échec — statut HTTP, délai dépassé, fournisseur injoignable, réponse illisible ou
 * inattendue — lève une `ProviderError` dont le message, composé par le code, ne nomme que la
 * route et la cause. Jamais le corps reçu, l'URL, un paramètre, la clé ni le message d'une erreur
 * native : ce texte part au journal, et de là vers Claude par le MCP (ADR 0003, « Pseudos, données
 * non fiables »).
 *
 * @throws {Error} à la construction, quand la clé est vide ou que le compte sort de
 * `INSTAGRAM_ID_PATTERN` ; le message ne recopie aucun réglage.
 */
export function createHikerApiProvider({
	accessKey,
	accountId,
	fetch: send = fetch,
	baseUrl = "https://api.hikerapi.com",
	timeoutMs = DEFAULT_TIMEOUT_MS,
}: HikerApiOptions): FollowerProvider {
	if (accessKey.trim() === "") {
		throw new Error("configuration HikerAPI : clé d'accès vide");
	}
	if (!INSTAGRAM_ID_PATTERN.test(accountId)) {
		throw new Error("configuration HikerAPI : identifiant du compte invalide");
	}

	// Le corps JSON de la réponse de `route` à `params`.
	async function getJson(
		route: string,
		params: Record<string, string>,
	): Promise<unknown> {
		const signal = AbortSignal.timeout(timeoutMs);
		let response: Response;
		let body: string;
		try {
			response = await send(
				new URL(`${route}?${new URLSearchParams(params)}`, baseUrl),
				{
					headers: { "x-access-key": accessKey, accept: "application/json" },
					redirect: "manual",
					signal,
				},
			);
			body = await response.text();
		} catch {
			throw failure(
				route,
				signal.aborted ? "délai dépassé" : "fournisseur injoignable",
			);
		}
		if (!response.ok) {
			throw failure(route, `statut HTTP ${response.status}`);
		}
		try {
			return JSON.parse(body);
		} catch {
			throw failure(route, "réponse illisible");
		}
	}

	return {
		async readPage(cursor: string | null): Promise<FollowerPage> {
			const body = await getJson(
				FOLLOWERS_ROUTE,
				cursor === null
					? { user_id: accountId }
					: { user_id: accountId, page_id: cursor },
			);
			const users = field(field(body, "response"), "users");
			if (!Array.isArray(users)) {
				throw unexpected(FOLLOWERS_ROUTE, "response.users");
			}
			const next = field(body, "next_page_id");
			if (next !== null && !isCursor(next)) {
				throw unexpected(FOLLOWERS_ROUTE, "next_page_id");
			}
			return { entries: users.map(entryOf), next };
		},

		async readFollowerCount(): Promise<number> {
			const body = await getJson(USER_ROUTE, { id: accountId });
			const count = field(body, "follower_count");
			if (
				typeof count !== "number" ||
				!Number.isSafeInteger(count) ||
				count < 0
			) {
				throw unexpected(USER_ROUTE, "follower_count");
			}
			return count;
		},
	};
}

// L'entrée d'un élément de `response.users` : l'identifiant en texte — `pk_id`, sinon `id`, jamais
// `pk`, que les exemples de la spec donnent en nombre JSON, arrondi au-delà de 2^53 (#13, décision
// « Identifiant reçu ») — et le pseudo. Un champ absent ou non textuel arrive vide (`FollowerEntry`) ; rien d'autre n'est
// lu, ni photo ni nom complet (ADR 0003, « Données stockées »).
function entryOf(user: unknown): FollowerEntry {
	return {
		id: text(field(user, "pk_id")) ?? text(field(user, "id")) ?? "",
		username: text(field(user, "username")) ?? "",
	};
}

// Un curseur reçu recevable : un texte non vide, d'au plus `MAX_CURSOR_LENGTH` caractères.
function isCursor(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= MAX_CURSOR_LENGTH
	);
}

// La valeur de `key` quand `value` est un objet ; `undefined` sinon.
function field(value: unknown, key: string): unknown {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)[key]
		: undefined;
}

// `value` quand c'est un texte ; `undefined` sinon.
function text(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

// L'échec d'un appel à `route`, composé par le code : la route et la cause, rien de reçu.
function failure(route: string, cause: string): ProviderError {
	return new ProviderError(`HikerAPI ${route} : ${cause}`);
}

// Une réponse de `route` dont `path` manque ou n'a pas la forme attendue.
function unexpected(route: string, path: string): ProviderError {
	return failure(route, `réponse inattendue (${path})`);
}
