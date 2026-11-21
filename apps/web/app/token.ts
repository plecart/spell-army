import { createHash, timingSafeEqual } from "node:crypto";

// Le contrôle d'un secret présenté en `Authorization: Bearer`, commun au jeton du serveur MCP
// (`MCP_TOKEN`) et au secret du tic (`CRON_SECRET`).

/**
 * Longueur minimale du jeton configuré, en octets UTF-8 : en deçà, tout est refusé (ADR 0004,
 * « Serveur MCP et secrets »).
 */
const MIN_TOKEN_BYTES = 32;

function sha256(value: string): Buffer {
	return createHash("sha256").update(value).digest();
}

/**
 * Vrai si l'en-tête `Authorization` reçu vaut `Bearer <jeton configuré>`. Un jeton configuré
 * absent, vide ou trop court refuse tout. Les empreintes SHA-256 de l'en-tête et de sa valeur
 * attendue sont comparées par `timingSafeEqual` : à longueur égale, quel que soit le jeton reçu
 * (ADR 0005, « Authentification »).
 */
export function isAuthorized(
	authorization: string | null,
	configuredToken: string | undefined,
): boolean {
	if (
		configuredToken === undefined ||
		Buffer.byteLength(configuredToken) < MIN_TOKEN_BYTES
	) {
		return false;
	}
	return timingSafeEqual(
		sha256(authorization ?? ""),
		sha256(`Bearer ${configuredToken}`),
	);
}

/**
 * `handler`, derrière le contrôle du secret que rend `configuredToken`, lu à chaque requête
 * (`isAuthorized`) : tout refus rend `401`, `WWW-Authenticate: Bearer` et un corps vide, sans
 * appeler `handler`.
 */
export function requireBearer(
	configuredToken: () => string | undefined,
	handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
	return async (request) =>
		isAuthorized(request.headers.get("authorization"), configuredToken())
			? handler(request)
			: new Response(null, {
					status: 401,
					headers: { "WWW-Authenticate": "Bearer" },
				});
}
