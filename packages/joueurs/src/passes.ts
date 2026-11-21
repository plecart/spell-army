import {
	type Executor,
	type FullPassTrigger,
	importPasses,
	postgresErrorCode,
	type QuickPassTrigger,
} from "donnees";
import { and, eq, ne, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { type FollowerProvider, ProviderError } from "./provider.ts";
import { writePage } from "./registration.ts";

/** Une ligne du journal des passes d'import. */
export type ImportPass = typeof importPasses.$inferSelect;

/** Ce dont une passe a besoin. */
export interface PassContext {
	/** Le client de la base, jamais une transaction : chaque page s'écrit dans la sienne. */
	db: Executor;
	/** Le fournisseur de la liste des abonnés. */
	provider: FollowerProvider;
	/** L'horloge du début, de la fin et du budget de la passe. */
	clock: () => Date;
	/** L'échéance du budget : à cet instant de l'horloge, la passe ne commence plus de page. */
	deadline: Date;
}

/**
 * Lance une passe rapide (ADR 0003, « Passe rapide ») : depuis le haut de la liste, page après
 * page, jusqu'à une page qui n'ajoute aucun joueur — connus et exclus comptent comme connus —, ou
 * jusqu'en fin de liste. La passe s'inscrit au journal en cours, et s'y clôt terminée ;
 * interrompue, sans erreur, quand le budget échoit avant une page ; en échec quand une page ne se
 * lit ou ne s'écrit pas (ADR 0003, « Mode dégradé ») — l'erreur au journal, la page ni écrite ni
 * comptée, rien de supprimé.
 *
 * S'appelle sous le verrou de l'import (`acquireImportLock`), qu'elle ne prend pas elle-même.
 *
 * @param context la base, le fournisseur, l'horloge et l'échéance du budget.
 * @param trigger ce qui la lance : le tic ou le MCP.
 * @returns la ligne de la passe au journal, telle qu'elle s'est close.
 */
export async function runQuickPass(
	context: PassContext,
	trigger: QuickPassTrigger,
): Promise<ImportPass> {
	return runPass(context, await openPass(context, "quick", trigger));
}

/**
 * Démarre une passe complète (ADR 0003, « Passe complète ») depuis le haut de la liste, jusqu'en
 * fin de liste. Elle se clôt comme la passe rapide (`runQuickPass`), et son curseur s'écrit au
 * journal avec chaque page : interrompue par le budget ou en échec, elle le garde, et
 * `resumeFullPass` la reprend à la page qui n'a pas été écrite.
 *
 * S'appelle sous le verrou de l'import (`acquireImportLock`), qu'elle ne prend pas elle-même.
 *
 * @param context la base, le fournisseur, l'horloge et l'échéance du budget.
 * @param trigger ce qui la lance : la semaine, l'auto-contrôle ou le MCP.
 * @returns la ligne de la passe au journal, telle qu'elle s'est close.
 * @throws l'erreur de l'index `import_passes_one_unfinished_full` quand une complète n'est pas
 * terminée : elle se reprend, elle ne se double pas.
 */
export async function startFullPass(
	context: PassContext,
	trigger: FullPassTrigger,
): Promise<ImportPass> {
	return runPass(context, await openPass(context, "full", trigger));
}

/**
 * Reprend la passe complète non terminée — interrompue, en échec, ou restée en cours, sa fonction
 * tuée — à son curseur, sous son déclencheur d'origine, sur la même ligne du journal : son erreur
 * s'efface, ses compteurs s'ajoutent à ceux déjà notés, son début reste le premier. Elle se clôt
 * comme la passe rapide (`runQuickPass`).
 *
 * S'appelle sous le verrou de l'import (`acquireImportLock`), qu'elle ne prend pas elle-même.
 *
 * @param context la base, le fournisseur, l'horloge et l'échéance du budget.
 * @returns la ligne de la passe au journal, telle qu'elle s'est close ; `null`, sans rien lire,
 * quand aucune complète n'est à reprendre.
 */
export async function resumeFullPass(
	context: PassContext,
): Promise<ImportPass | null> {
	const [pass] = await context.db
		.update(importPasses)
		.set({ status: "running", finishedAt: null, error: null })
		.where(and(eq(importPasses.kind, "full"), ne(importPasses.status, "done")))
		.returning();
	return pass ? runPass(context, pass) : null;
}

/**
 * Interrompt, à l'instant `now`, toute passe restée en cours : celle d'une fonction tuée, qui n'a
 * pu se clore. Une complète y garde son curseur, et `resumeFullPass` la reprend.
 *
 * S'appelle sous le verrou de l'import, une fois pris : aucune passe ne tourne alors.
 *
 * @param executor le client.
 * @param now l'instant de l'arrêt, de l'horloge de l'appelant.
 */
export async function closeStalePasses(
	executor: Executor,
	now: Date,
): Promise<void> {
	await executor
		.update(importPasses)
		.set({ status: "interrupted", finishedAt: now })
		.where(eq(importPasses.status, "running"));
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

// Lit et écrit les pages de la passe, de son curseur jusqu'à son arrêt, puis la clôt. Le budget se
// juge avant chaque page ; une page qui ne se lit ou ne s'écrit pas clôt la passe en échec.
async function runPass(
	context: PassContext,
	pass: ImportPass,
): Promise<ImportPass> {
	let cursor = pass.cursor;
	for (;;) {
		if (context.clock().getTime() >= context.deadline.getTime()) {
			return closePass(context, pass.id, "interrupted");
		}
		let page: ImportedPage;
		try {
			page = await importPage(context, pass, cursor);
		} catch (error) {
			return closePass(context, pass.id, "failed", failureText(error));
		}
		if (page.next === null || (pass.kind === "quick" && page.added === 0)) {
			return closePass(context, pass.id, "done");
		}
		cursor = page.next;
	}
}

// Ce qu'a donné une page : ses joueurs ajoutés, et le curseur de la suivante.
interface ImportedPage {
	added: number;
	next: string | null;
}

// Lit la page de `cursor`, puis l'écrit et la compte au journal de la passe dans une même
// transaction : une page qui échoue n'est ni écrite ni comptée. Une complète y note le curseur de
// sa page suivante.
async function importPage(
	context: PassContext,
	pass: ImportPass,
	cursor: string | null,
): Promise<ImportedPage> {
	const page = await context.provider.readPage(cursor);
	const { added } = await context.db.transaction(async (tx) => {
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
				...(pass.kind === "full" ? { cursor: page.next } : {}),
			})
			.where(eq(importPasses.id, pass.id));
		return written;
	});
	return { added, next: page.next };
}

// Clôt la passe dans l'état `status`, à l'instant de l'horloge, avec l'erreur d'un échec.
async function closePass(
	context: PassContext,
	id: number,
	status: Exclude<ImportPass["status"], "running">,
	error: string | null = null,
): Promise<ImportPass> {
	const [pass] = await context.db
		.update(importPasses)
		.set({ status, finishedAt: context.clock(), error })
		.where(eq(importPasses.id, id))
		.returning();
	return pass as ImportPass;
}

// Le texte d'un échec au journal, que le MCP rend à Claude : composé par le code, il ne recopie
// jamais une valeur reçue (ADR 0003, « Pseudos, données non fiables »). Le message d'une erreur
// du fournisseur ou du tirage est composé par le code ; d'une erreur de la base, seuls son code et
// sa contrainte se gardent — le message d'une erreur de requête Drizzle recopie la requête et ses
// paramètres, donc les pseudos de la page ; d'une autre erreur, son nom seul.
function failureText(error: unknown): string {
	if (error instanceof ProviderError || error instanceof RangeError) {
		return error.message;
	}
	const postgres = postgresErrorCode(error);
	if (postgres) {
		return postgres.constraint === undefined
			? `erreur Postgres ${postgres.code}`
			: `erreur Postgres ${postgres.code} (${postgres.constraint})`;
	}
	return error instanceof Error ? error.name : "erreur inconnue";
}

// La valeur de `column` augmentée de `count`.
function plus(column: PgColumn, count: number): SQL {
	return sql`${column} + ${count}`;
}
