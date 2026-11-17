import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Longueur minimale du jeton configuré, en octets UTF-8 : en deçà, tout est refusé (ADR 0004,
 * « Serveur MCP et secrets »).
 */
export const MIN_TOKEN_BYTES = 32;

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
