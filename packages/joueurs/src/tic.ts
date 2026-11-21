import { type Executor, importPasses, players } from "donnees";
import { and, eq, gt, gte } from "drizzle-orm";
import { logEntry, type PassLogEntry } from "./journal.ts";
import { acquireImportLock, releaseImportLock } from "./lock.ts";
import {
	closeStalePasses,
	failureText,
	type ImportPass,
	type PassContext,
	resumeFullPass,
	runQuickPass,
	startFullPass,
} from "./passes.ts";
import type { FollowerProvider } from "./provider.ts";

/** Ce dont un tic ou une relance a besoin. */
export interface ImportOptions {
	/**
	 * Le client de la base, jamais une transaction : le verrou se voit des autres tics dès sa prise,
	 * et chaque page s'écrit dans sa propre transaction.
	 */
	db: Executor;
	/** Le fournisseur de la liste des abonnés. */
	provider: FollowerProvider;
	/**
	 * L'horloge du verrou, du journal, du budget et des délais entre complètes ; celle du système par
	 * défaut.
	 */
	clock?: () => Date;
	/**
	 * Le budget en millisecondes, compté depuis la prise du verrou : passé ce délai, aucune page ne
	 * commence. 240 000 par défaut, sous les 300 s d'une fonction (ADR 0002, « Verrou à bail »).
	 */
	budgetMs?: number;
}

/** Le compte rendu d'un tic qui a tourné. */
export interface TickReport {
	/** Les passes que le tic a fait tourner, dans leur ordre, telles que le journal les rend. */
	passes: PassLogEntry[];
	/**
	 * L'échec de la lecture du nombre d'abonnés, composé par le code comme l'erreur d'une passe
	 * (jamais un corps reçu) ; nul sans échec, ou sans lecture.
	 */
	followerCountError: string | null;
	/** Vrai quand une passe s'est close en échec ou que la lecture du nombre d'abonnés a échoué. */
	failed: boolean;
}

// Le budget d'un tic : 240 s, sous les 300 s d'une fonction ; la marge couvre la page commencée en
// dernier, dont l'appel au fournisseur se borne à 30 s (`createHikerApiProvider` ; briefing de la
// PR #37, « Budget »).
const DEFAULT_BUDGET_MS = 240_000;
// La réserve de la passe rapide : la suite d'une complète s'arrête autant avant l'échéance du tic,
// pour que la passe rapide lise au moins sa première page — un appel au fournisseur borné à 30 s,
// l'écriture de la page, et de la marge.
const QUICK_PASS_RESERVE_MS = 60_000;
const DAY_MS = 86_400_000;
// Une complète part chaque semaine (ADR 0003, « Passe complète »).
const WEEKLY_INTERVAL_MS = 7 * DAY_MS;
// L'auto-contrôle fait partir une complète au plus une fois par 24 h (ADR 0003, « Auto-contrôle »).
const SELF_CHECK_INTERVAL_MS = DAY_MS;

/**
 * Le tic horaire de l'import (ADR 0002, « Une seule tâche ») : sous le verrou de l'import, après
 * avoir interrompu les passes restées en cours, il fait dans l'ordre (a) la suite de la complète
 * non terminée, à son curseur ; (b) la passe rapide ; (c) seulement s'il ne reste aucune complète
 * non terminée, le départ d'une complète : celle de la semaine quand aucune complète n'a commencé
 * il y a 7 jours ou moins — dès le premier tic sur une base vide —, sinon celle de l'auto-contrôle
 * (ADR 0003, « Auto-contrôle ») quand aucune complète d'auto-contrôle n'est partie depuis moins de
 * 24 h et que la base compte moins de joueurs que le nombre d'abonnés affiché, lu seulement alors.
 * Les délais se comptent depuis le début des passes, à l'horloge. Toutes courent sur le budget du
 * tic, dont (a) laisse 60 s à (b) : la suite d'une complète s'arrête à l'échéance avancée
 * d'autant, et la passe rapide court jusqu'à celle du tic. Une complète partie sans budget en (c)
 * s'arrête interrompue à 0 page, et le tic suivant la reprend. Le tic ne lance aucun combat.
 *
 * Une lecture du nombre d'abonnés qui échoue ne fait partir aucune passe ni n'écrit au journal :
 * elle se rend au compte rendu.
 *
 * @param options la base, le fournisseur, l'horloge et le budget.
 * @returns le compte rendu du tic ; `null`, sans rien lire ni journaliser, quand le verrou est
 * pris par un autre.
 * @throws toute erreur de la base, telle quelle, le verrou rendu ; si son rendu échoue aussi,
 * l'erreur d'origine remonte, et le bail expire seul.
 */
export async function runTic(
	options: ImportOptions,
): Promise<TickReport | null> {
	return underImportLock(options, async (context) => {
		const resumed = await resumeFullPass({
			...context,
			deadline: new Date(context.deadline.getTime() - QUICK_PASS_RESERVE_MS),
		});
		const passes = resumed ? [resumed] : [];
		passes.push(await runQuickPass(context, "tick"));
		const due =
			resumed === null || resumed.status === "done"
				? await startDueFullPass(context)
				: {};
		if (due.pass) {
			passes.push(due.pass);
		}
		const followerCountError = due.followerCountError ?? null;
		return {
			passes: passes.map(logEntry),
			followerCountError,
			failed:
				followerCountError !== null ||
				passes.some(({ status }) => status === "failed"),
		};
	});
}

/**
 * Relance une passe (outil `relancer_passe`, ADR 0003, « Journal ») sous le verrou de l'import,
 * comme le tic : après avoir interrompu les passes restées en cours, sous le même budget. Une
 * rapide part sous le déclencheur du MCP ; une complète reprend la complète non terminée à son
 * curseur, sous son déclencheur d'origine, et sinon en démarre une sous le déclencheur du MCP.
 *
 * @param options la base, le fournisseur, l'horloge et le budget.
 * @param kind le type de la passe.
 * @returns la passe telle que le journal la rend, une fois close ; `null`, sans attendre, sans rien
 * lire ni journaliser, quand le verrou est pris : une passe est en cours.
 * @throws toute erreur de la base, telle quelle, le verrou rendu ; si son rendu échoue aussi,
 * l'erreur d'origine remonte, et le bail expire seul.
 */
export async function relaunchPass(
	options: ImportOptions,
	kind: ImportPass["kind"],
): Promise<PassLogEntry | null> {
	return underImportLock(options, async (context) =>
		logEntry(
			kind === "quick"
				? await runQuickPass(context, "mcp")
				: ((await resumeFullPass(context)) ??
						(await startFullPass(context, "mcp"))),
		),
	);
}

// Prend le verrou de l'import à l'instant de l'horloge et rend `null` s'il est pris. Sinon, sous le
// verrou, interrompt les passes restées en cours, fait `run` sous un budget compté depuis la prise,
// et rend le verrou quoi qu'il arrive. Quand `run` lève, son erreur remonte telle quelle : un rendu
// qui échoue alors s'ignore, et le bail expire seul ; quand `run` réussit, l'erreur du rendu remonte.
async function underImportLock<T>(
	{
		db,
		provider,
		clock = () => new Date(),
		budgetMs = DEFAULT_BUDGET_MS,
	}: ImportOptions,
	run: (context: PassContext) => Promise<T>,
): Promise<T | null> {
	const start = clock();
	const holder = await acquireImportLock(db, start);
	if (holder === null) {
		return null;
	}
	let result: T;
	try {
		await closeStalePasses(db, start);
		const deadline = new Date(start.getTime() + budgetMs);
		result = await run({ db, provider, clock, deadline });
	} catch (error) {
		await releaseImportLock(db, holder).catch(() => undefined);
		throw error;
	}
	await releaseImportLock(db, holder);
	return result;
}

// (c) : fait partir la complète due — celle de la semaine, ou celle d'un auto-contrôle en défaut —
// et rend sa ligne du journal ; ou l'échec de la lecture du nombre d'abonnés, sans passe.
async function startDueFullPass(
	context: PassContext,
): Promise<{ pass?: ImportPass; followerCountError?: string }> {
	const { db, provider } = context;
	const now = context.clock().getTime();
	const fullThisWeek = await db.$count(
		importPasses,
		and(
			eq(importPasses.kind, "full"),
			gte(importPasses.startedAt, new Date(now - WEEKLY_INTERVAL_MS)),
		),
	);
	if (fullThisWeek === 0) {
		return { pass: await startFullPass(context, "weekly") };
	}
	const selfCheckToday = await db.$count(
		importPasses,
		and(
			eq(importPasses.trigger, "self_check"),
			gt(importPasses.startedAt, new Date(now - SELF_CHECK_INTERVAL_MS)),
		),
	);
	if (selfCheckToday > 0) {
		return {};
	}
	let followerCount: number;
	try {
		followerCount = await provider.readFollowerCount();
	} catch (error) {
		return { followerCountError: failureText(error) };
	}
	return (await db.$count(players)) < followerCount
		? { pass: await startFullPass(context, "self_check") }
		: {};
}
