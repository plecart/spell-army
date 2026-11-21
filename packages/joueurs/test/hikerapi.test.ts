import { MALFORMED_IDS } from "donnees/test/formes-instagram";
import { describe, expect, test, vi } from "vitest";
import {
	createHikerApiProvider,
	type FollowerProvider,
	ProviderError,
} from "../src/index.ts";

// Des réglages témoins : aucun ne doit reparaître dans un message d'erreur.
const ACCESS_KEY = "cle-secrete-temoin";
const ACCOUNT_ID = "1784140000000001";
const CURSOR = "QVFCcnhIWE82OUswLXBtNzlpZ0ZaUnhWZEhr";
const FOLLOWERS = "/g2/user/followers";
const USER = "/v1/user/by/id";

// Une page de `/g2/user/followers` modelée sur la réponse `PageResponse` de la spec HikerAPI 1.8.4 :
// `response.users` et `should_limit_list_of_followers` de son exemple, `next_page_id` de son schéma.
// L'exemple n'écrit pas les champs d'un abonné : ils suivent ici le dictionnaire brut d'Instagram, et
// la capture réelle viendra de l'essai réel (#23). `pk` y est un nombre JSON au-delà de 2^53, que
// `JSON.parse` arrondit ; `pk_id` et `id` en sont la forme texte.
const RECORDED_PAGE = `{
	"response": {
		"users": [
			{
				"pk": 12345678901234567891,
				"pk_id": "12345678901234567891",
				"id": "12345678901234567891",
				"username": "mage.de_feu",
				"full_name": "Mage de feu",
				"profile_pic_url": "https://scontent.cdninstagram.com/v/t51/photo.jpg",
				"is_private": false
			}
		],
		"should_limit_list_of_followers": true
	},
	"next_page_id": "${CURSOR}"
}`;

// Un corps témoin d'échec : ni lui ni les réglages ne doivent reparaître dans le message.
const TRAP_BODY = `{"detail": "<pseudo-piege> ${ACCESS_KEY} ${ACCOUNT_ID} ${CURSOR}"}`;

interface SentRequest {
	url: URL;
	init: RequestInit;
}

// Un adaptateur sur un faux `fetch`, qui enregistre chaque requête et lui rend `respond(init)`.
function providerWith(
	respond: (init: RequestInit) => Response | Promise<Response>,
	timeoutMs?: number,
) {
	const requests: SentRequest[] = [];
	const provider = createHikerApiProvider({
		accessKey: ACCESS_KEY,
		accountId: ACCOUNT_ID,
		fetch: async (url, init) => {
			requests.push({ url, init });
			return respond(init);
		},
		timeoutMs,
	});
	return { provider, requests };
}

// Un adaptateur dont chaque requête reçoit `body` sous `status`.
function answering(body: string, status = 200) {
	return providerWith(() => new Response(body, { status }));
}

// Une page de `/g2/user/followers` sans suite, dont les abonnés sont `users`.
function pageOf(...users: unknown[]): string {
	return JSON.stringify({ response: { users }, next_page_id: null });
}

// Le message de l'erreur que lève `call`, une `ProviderError`.
async function providerError(call: Promise<unknown>): Promise<string> {
	const error = await call.then(
		() => undefined,
		(reason: unknown) => reason,
	);
	expect(error).toBeInstanceOf(ProviderError);
	return (error as ProviderError).message;
}

describe("adaptateur HikerAPI : une page d'abonnés", () => {
	test("un `pk` au-delà de 2^53 : l'identifiant rendu est la forme texte exacte de `pk_id`", async () => {
		const { provider } = answering(RECORDED_PAGE);
		const page = await provider.readPage(null);
		expect(page.entries[0]?.id).toBe("12345678901234567891");
	});

	test("une entrée ne rend que l'identifiant et le pseudo : ni photo, ni nom complet", async () => {
		const { provider } = answering(RECORDED_PAGE);
		expect(await provider.readPage(null)).toStrictEqual({
			entries: [{ id: "12345678901234567891", username: "mage.de_feu" }],
			next: CURSOR,
		});
	});

	test.each<[string, unknown, { id: string; username: string }]>([
		[
			"repli sur `id` sans `pk_id`",
			{ pk: 12, id: "12", username: "douze" },
			{ id: "12", username: "douze" },
		],
		[
			"`pk_id` avant `id`",
			{ pk_id: "11", id: "22", username: "onze" },
			{ id: "11", username: "onze" },
		],
		[
			"`pk_id` non textuel : repli sur `id`",
			{ pk_id: 12, id: "12", username: "douze" },
			{ id: "12", username: "douze" },
		],
		[
			"`pk` seul, en nombre : identifiant vide",
			{ pk: 12, username: "douze" },
			{ id: "", username: "douze" },
		],
		[
			"`pk` seul, en texte : identifiant vide",
			{ pk: "12", username: "douze" },
			{ id: "", username: "douze" },
		],
		[
			"pseudo non textuel : vide",
			{ pk_id: "12", username: 12 },
			{ id: "12", username: "" },
		],
		[
			"pseudo nul : vide",
			{ pk_id: "12", username: null },
			{ id: "12", username: "" },
		],
		["élément texte : entrée vide", "douze", { id: "", username: "" }],
		["élément nul : entrée vide", null, { id: "", username: "" }],
		[
			"élément tableau : entrée vide",
			["12", "douze"],
			{ id: "", username: "" },
		],
	])("%s", async (_, user, entry) => {
		const { provider } = answering(pageOf(user));
		expect((await provider.readPage(null)).entries).toStrictEqual([entry]);
	});

	test("la première page se demande sans `page_id`, la clé en en-tête", async () => {
		const { provider, requests } = answering(RECORDED_PAGE);
		await provider.readPage(null);
		expect(requests.map(({ url }) => url.href)).toEqual([
			`https://api.hikerapi.com${FOLLOWERS}?user_id=${ACCOUNT_ID}`,
		]);
		const headers = new Headers(requests[0]?.init.headers);
		expect(headers.get("x-access-key")).toBe(ACCESS_KEY);
		expect(headers.get("accept")).toBe("application/json");
	});

	test("la page suivante renvoie le curseur reçu, encodé, sans rien ajouter aux paramètres", async () => {
		const cursor = "a+b/c=d&page_id=x y";
		const { provider, requests } = answering(RECORDED_PAGE);
		await provider.readPage(cursor);
		const url = requests[0]?.url;
		expect(url?.pathname).toBe(FOLLOWERS);
		expect([...(url?.searchParams ?? [])]).toEqual([
			["user_id", ACCOUNT_ID],
			["page_id", cursor],
		]);
	});

	test("une redirection n'est pas suivie : la clé ne part vers aucune autre origine", async () => {
		const { provider, requests } = answering(RECORDED_PAGE);
		await provider.readPage(null);
		expect(requests[0]?.init.redirect).toBe("manual");
	});

	test("`next_page_id` nul : fin de liste", async () => {
		const { provider } = answering(pageOf());
		expect((await provider.readPage(null)).next).toBeNull();
	});

	test("`next_page_id` de 2 048 caractères, la borne : gardé tel quel", async () => {
		const cursor = "Q".repeat(2048);
		const { provider } = answering(
			JSON.stringify({ response: { users: [] }, next_page_id: cursor }),
		);
		expect((await provider.readPage(null)).next).toBe(cursor);
	});

	test.each<[string, Record<string, unknown>]>([
		["absent", {}],
		["vide", { next_page_id: "" }],
		["numérique", { next_page_id: 12 }],
		["objet", { next_page_id: { max_id: CURSOR } }],
		["de 2 049 caractères", { next_page_id: "Q".repeat(2049) }],
	])("`next_page_id` %s : réponse inattendue", async (_, next) => {
		const { provider } = answering(
			JSON.stringify({ response: { users: [] }, ...next }),
		);
		expect(await providerError(provider.readPage(null))).toBe(
			`HikerAPI ${FOLLOWERS} : réponse inattendue (next_page_id)`,
		);
	});

	test.each([
		["`response.users` absent", '{"response": {}, "next_page_id": null}'],
		[
			"`response.users` non tableau",
			'{"response": {"users": {}}, "next_page_id": null}',
		],
		["`response` absent", '{"next_page_id": null}'],
		["corps tableau", "[]"],
		["corps nul", "null"],
	])("%s : réponse inattendue", async (_, body) => {
		const { provider } = answering(body);
		expect(await providerError(provider.readPage(null))).toBe(
			`HikerAPI ${FOLLOWERS} : réponse inattendue (response.users)`,
		);
	});
});

describe("adaptateur HikerAPI : le nombre d'abonnés affiché", () => {
	// Une réponse de `/v1/user/by/id` (schéma `User` de la spec 1.8.4), réduite à ce qui sert.
	function userWith(fields: Record<string, unknown>): string {
		return JSON.stringify({ pk: ACCOUNT_ID, username: "compte", ...fields });
	}

	test("se demande pour le compte lu, la clé en en-tête", async () => {
		const { provider, requests } = answering(userWith({ follower_count: 12 }));
		await provider.readFollowerCount();
		expect(requests.map(({ url }) => url.href)).toEqual([
			`https://api.hikerapi.com${USER}?id=${ACCOUNT_ID}`,
		]);
		expect(new Headers(requests[0]?.init.headers).get("x-access-key")).toBe(
			ACCESS_KEY,
		);
	});

	test.each([1234, 0])(
		"`follower_count` %i : rendu tel quel",
		async (count) => {
			const { provider } = answering(userWith({ follower_count: count }));
			expect(await provider.readFollowerCount()).toBe(count);
		},
	);

	test.each<[string, Record<string, unknown>]>([
		["nul", { follower_count: null }],
		["absent", {}],
		["négatif", { follower_count: -1 }],
		["non entier", { follower_count: 1.5 }],
		["textuel", { follower_count: "1234" }],
		["au-delà des entiers sûrs", { follower_count: 2 ** 53 }],
	])("`follower_count` %s : réponse inattendue", async (_, fields) => {
		const { provider } = answering(userWith(fields));
		expect(await providerError(provider.readFollowerCount())).toBe(
			`HikerAPI ${USER} : réponse inattendue (follower_count)`,
		);
	});
});

describe.each<[string, (provider: FollowerProvider) => Promise<unknown>]>([
	[FOLLOWERS, (provider) => provider.readPage(CURSOR)],
	[USER, (provider) => provider.readFollowerCount()],
])("adaptateur HikerAPI : échecs de %s", (route, call) => {
	test.each([302, 401, 404, 429, 500])(
		"statut %i : le statut, sans le corps reçu ni les réglages, et sans nouvelle tentative",
		async (status) => {
			const { provider, requests } = answering(TRAP_BODY, status);
			expect(await providerError(call(provider))).toBe(
				`HikerAPI ${route} : statut HTTP ${status}`,
			);
			expect(requests).toHaveLength(1);
		},
	);

	test("corps non JSON : réponse illisible, sans le corps", async () => {
		const { provider } = answering("<html><pseudo-piege></html>");
		expect(await providerError(call(provider))).toBe(
			`HikerAPI ${route} : réponse illisible`,
		);
	});

	test("`fetch` qui rejette : fournisseur injoignable, sans le message d'origine", async () => {
		const { provider } = providerWith(() =>
			Promise.reject(
				new TypeError(`fetch failed <pseudo-piege> ${ACCESS_KEY}`),
			),
		);
		expect(await providerError(call(provider))).toBe(
			`HikerAPI ${route} : fournisseur injoignable`,
		);
	});

	test("corps coupé en cours de lecture : fournisseur injoignable, sans le message d'origine", async () => {
		const { provider } = providerWith(
			() =>
				new Response(
					new ReadableStream({
						start(controller) {
							controller.error(
								new TypeError("other side closed <pseudo-piege>"),
							);
						},
					}),
				),
		);
		expect(await providerError(call(provider))).toBe(
			`HikerAPI ${route} : fournisseur injoignable`,
		);
	});

	// Le `fetch` de Node rejette à l'échéance avec la raison du signal, avant les en-têtes comme
	// pendant la lecture du corps (mesuré le 2026-11-21 sous Node 24.3.0) : les deux faux ci-dessous
	// en rejouent la forme.
	test("délai dépassé avant la réponse : sans le message d'origine", async () => {
		const { provider } = providerWith(
			({ signal }) =>
				new Promise((_, reject) => {
					signal?.addEventListener("abort", () => reject(signal.reason));
				}),
			10,
		);
		expect(await providerError(call(provider))).toBe(
			`HikerAPI ${route} : délai dépassé`,
		);
	}, 1_000);

	test("délai dépassé pendant la lecture du corps : sans le message d'origine", async () => {
		const { provider } = providerWith(
			({ signal }) =>
				new Response(
					new ReadableStream({
						start(controller) {
							signal?.addEventListener("abort", () =>
								controller.error(signal.reason),
							);
						},
					}),
				),
			10,
		);
		expect(await providerError(call(provider))).toBe(
			`HikerAPI ${route} : délai dépassé`,
		);
	}, 1_000);
});

describe("adaptateur HikerAPI : délai et configuration", () => {
	// Les faux minuteurs de Vitest ne pilotent pas `AbortSignal.timeout` (mesuré le 2026-11-21, Vitest
	// 5.1.0 sous Node 24.3.0) : le délai se lit à son appel.
	test("sans délai précisé, un appel se borne à 30 s, le délai que suppose le budget du tic", async () => {
		const timeout = vi.spyOn(AbortSignal, "timeout");
		const { provider } = answering(RECORDED_PAGE);
		await provider.readPage(null);
		expect(timeout).toHaveBeenCalledWith(30_000);
	});

	test.each(["", "   "])(
		"clé « %s » : refusée à la construction",
		(accessKey) => {
			expect(() =>
				createHikerApiProvider({ accessKey, accountId: ACCOUNT_ID }),
			).toThrow(/^configuration HikerAPI : clé d'accès vide$/);
		},
	);

	test.each(MALFORMED_IDS)(
		"compte lu, %s : refusé à la construction, sans la clé dans le message",
		(_, accountId) => {
			expect(() =>
				createHikerApiProvider({ accessKey: ACCESS_KEY, accountId }),
			).toThrow(/^configuration HikerAPI : identifiant du compte invalide$/);
		},
	);
});
