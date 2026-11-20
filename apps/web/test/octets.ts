import { createHash } from "node:crypto";

// Les octets des tests, sous les formes que les outils reçoivent et que l'audit garde.

/** L'empreinte SHA-256 de `bytes`, en hexadécimal. */
export const sha256 = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");

/** `bytes` en base64, tels qu'un outil les reçoit. */
export const base64 = (bytes: Uint8Array) =>
	Buffer.from(bytes).toString("base64");

/** Ce que l'audit garde d'octets reçus : leur taille et leur empreinte SHA-256. */
export const fingerprint = (bytes: Uint8Array) => ({
	taille: bytes.length,
	sha256: sha256(bytes),
});
