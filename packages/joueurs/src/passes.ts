import { type Executor, importPasses, type QuickPassTrigger } from "donnees";
import { eq, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { FollowerPage, FollowerProvider } from "./provider.ts";
import { type WrittenPage, writePage } from "./registration.ts";

/** Une ligne du journal des passes d'import. */
export type ImportPass = typeof importPasses.$inferSelect;

/** Ce dont une passe a besoin. */
export interface PassContext {
	/** Le client de la base, jamais une transaction : chaque page s'écrit dans la sienne. */
	db: Executor;
	/** Le fournisseur de la liste des abonnés. */
	provider: FollowerProvider;
	/** L'horloge du début et de la fin de la passe. */
	clock: () => Date;
}

/**
 * Lance une passe rapide (ADR 0003, « Passe rapide ») : depuis le haut de la liste, page après
 * page, jusqu'à une page qui n'ajoute aucun joueur — connus et exclus comptent comme connus —, ou
 * jusqu'en fin de liste. La passe s'inscrit au journal en cours, et s'y clôt terminée.
 *
 * S'appelle sous le verrou de l'import (`acquireImportLock`), qu'elle ne prend pas elle-même.
 *
 * @returns la ligne de la passe au journal, telle qu'elle s'est close.
 */
export async function runQuickPass(
	context: PassContext,
	trigger: QuickPassTrigger,
): Promise<ImportPass> {
	return runPass(context, await openPass(context, "quick", trigger));
}

// Inscrit au journal une passe en cours, partie à l'instant de l'horloge.
async function openPass(
	context: PassContext,
	kind: ImportPass["kind"],
	trigger: ImportPass["trigger"],
): Promise<ImportPass> {
	const [pass] = await context.db
		.insert(importPasses)
		.values({ kind, trigger, status: "running", startedAt: context.clock() })
		.returning();
	return pass as ImportPass;
}

// Lit et écrit les pages de la passe, de son curseur jusqu'à son arrêt, puis la clôt.
async function runPass(
	context: PassContext,
	pass: ImportPass,
): Promise<ImportPass> {
	let cursor = pass.cursor;
	for (;;) {
		const page = await context.provider.readPage(cursor);
		const { added } = await writeJournaledPage(context.db, pass, page);
		if (page.next === null || (pass.kind === "quick" && added === 0)) {
			return closePass(context, pass.id, "done");
		}
		cursor = page.next;
	}
}

// Écrit la page et la compte au journal de la passe, dans une même transaction : une page qui
// échoue n'est ni écrite ni comptée.
async function writeJournaledPage(
	db: Executor,
	pass: ImportPass,
	page: FollowerPage,
): Promise<WrittenPage> {
	return db.transaction(async (tx) => {
		const written = await writePage(tx, page.entries);
		await tx
			.update(importPasses)
			.set({
				pages: plus(importPasses.pages, 1),
				added: plus(importPasses.added, written.added),
				invalidIds: plus(importPasses.invalidIds, written.invalidIds),
				invalidUsernames: plus(
					importPasses.invalidUsernames,
					written.invalidUsernames,
				),
			})
			.where(eq(importPasses.id, pass.id));
		return written;
	});
}

// Clôt la passe dans l'état `status`, à l'instant de l'horloge.
async function closePass(
	context: PassContext,
	id: number,
	status: Exclude<ImportPass["status"], "running">,
): Promise<ImportPass> {
	const [pass] = await context.db
		.update(importPasses)
		.set({ status, finishedAt: context.clock() })
		.where(eq(importPasses.id, id))
		.returning();
	return pass as ImportPass;
}

// La valeur de `column` augmentée de `count`.
function plus(column: PgColumn, count: number): SQL {
	return sql`${column} + ${count}`;
}
