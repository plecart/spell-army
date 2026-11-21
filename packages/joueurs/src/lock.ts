import { randomUUID } from "node:crypto";
import { type Executor, importLock } from "donnees";
import { eq, lte } from "drizzle-orm";

/**
 * La durée du bail du verrou de l'import : 300 s, la durée maximale d'une fonction Vercel sur
 * Hobby (ADR 0002, « Verrou à bail »). Un tic tué ne bloque donc jamais les suivants.
 */
export const IMPORT_LEASE_MS = 300_000;

/**
 * Prend le verrou de l'import (ADR 0002, « Verrou à bail ») pour un bail de `IMPORT_LEASE_MS` à
 * partir de `now`, sous un porteur neuf : la ligne du verrou s'insère, ou se reprend si son bail a
 * échu (`expires_at <= now`). Un seul upsert conditionnel : de deux prises simultanées, une seule
 * réussit.
 *
 * @param executor le client, jamais une transaction longue : une instruction autonome rend le
 * verrou visible des autres prises dès qu'il est pris.
 * @param now l'instant de la prise, de l'horloge de l'appelant.
 * @returns le porteur, à rendre à `releaseImportLock` ; `null` quand un bail court encore.
 */
export async function acquireImportLock(
	executor: Executor,
	now: Date,
): Promise<string | null> {
	const lease = {
		holder: randomUUID(),
		expiresAt: new Date(now.getTime() + IMPORT_LEASE_MS),
	};
	const [taken] = await executor
		.insert(importLock)
		.values({ id: 1, ...lease })
		.onConflictDoUpdate({
			target: importLock.id,
			set: lease,
			setWhere: lte(importLock.expiresAt, now),
		})
		.returning({ holder: importLock.holder });
	return taken?.holder ?? null;
}

/**
 * Rend le verrou de l'import pris par `holder`. Un porteur dont le bail a échu et été repris ne
 * libère rien : le verrou de son successeur tient.
 *
 * @param executor le client.
 * @param holder le porteur que `acquireImportLock` a rendu.
 */
export async function releaseImportLock(
	executor: Executor,
	holder: string,
): Promise<void> {
	await executor.delete(importLock).where(eq(importLock.holder, holder));
}
