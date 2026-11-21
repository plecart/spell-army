// L'horloge des tests de l'import : un instant de départ, les durées qui en partent et le bail du
// verrou.

/** L'instant de départ des tests. */
export const T0 = new Date("2026-11-21T10:00:00Z");

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Le bail du verrou de l'import : 300 s (ADR 0002, « Verrou à bail »). */
export const LEASE_MS = 300_000;

/** L'instant `ms` millisecondes après `from`, `T0` par défaut. */
export function after(ms: number, from: Date = T0): Date {
	return new Date(from.getTime() + ms);
}
