import type { Executor } from "donnees";
import { type FollowerProvider, runTick, type TickReport } from "joueurs";
import { toToolPass } from "./mcp/vocabulary.ts";
import { requireBearer } from "./token.ts";

/** Ce dont le tic a besoin, demandé à chaque requête. */
export interface TickEndpointOptions {
	/** Le secret configuré, `CRON_SECRET`. */
	secret: () => string | undefined;
	/** Le client de la base, demandé par un tic admis. */
	database: () => Executor;
	/** Le fournisseur des abonnés, construit par un tic admis ; lève sur une configuration invalide. */
	provider: () => FollowerProvider;
	/**
	 * L'adresse de signal du contrôle healthchecks.io, `HEALTHCHECKS_PING_URL`, lue après un tic
	 * réussi ; absente ou vide, aucun signal ne part.
	 */
	pingUrl: () => string | undefined;
}

// Les messages fixes des réponses qui ne rendent pas de passes : jamais une valeur ni le message
// d'une erreur, dont la cause se journalise côté serveur.
const CONFIGURATION_INCOMPLETE = "configuration de l'import incomplète";
const TICK_FAILED = "tic interrompu par une erreur";
const PASS_RUNNING = "passe en cours : ce tic n'a rien fait";

// Le message fixe d'un signal en échec, journalisé côté serveur : jamais son adresse, qui est un
// secret.
const PING_FAILED = "signal healthchecks.io en échec";

// Le délai d'un signal : il ne retient pas le tic plus de 10 s, sous la durée maximale de sa route.
const PING_TIMEOUT_MS = 10_000;

/**
 * Le point d'entrée HTTP du tic horaire de l'import (ADR 0002, « Une seule tâche ») : `runTick` de
 * `joueurs`. Le secret se contrôle d'abord, comme le jeton du serveur MCP (`requireBearer`) : tout
 * refus rend `401`, `WWW-Authenticate: Bearer` et un corps vide, sans demander la base ni le
 * fournisseur.
 *
 * Admis, le tic répond en JSON :
 * - `200`, `{ passes, erreur_nombre_abonnes }` : les passes qu'il a fait tourner, sous les champs de
 *   `lister_passes`, et l'échec de la lecture du nombre d'abonnés, nul sans échec ;
 * - `500` et le même corps quand une passe s'est close en erreur ou que cette lecture a échoué :
 *   le tic n'est pas réussi, et ne doit pas compter pour tel ;
 * - `200`, `{ message }` quand le verrou de l'import est pris : un tic doublé, qui n'a rien fait ;
 * - `500`, `{ message }` au texte fixe quand la configuration du fournisseur est invalide — aucune
 *   passe ne part — ou que le tic lève, une erreur de la base : la cause va au journal du serveur.
 *
 * Après une réponse `2xx`, tic réussi ou doublé, et jamais après une autre, le tic envoie son signal
 * au contrôle healthchecks.io (ADR 0002, « Surveillance ») : c'est son silence qui alerte.
 */
export function createTickEndpoint({
	secret,
	database,
	provider,
	pingUrl,
}: TickEndpointOptions): (request: Request) => Promise<Response> {
	return requireBearer(secret, async () => {
		const response = await tick({ database, provider });
		if (response.ok) {
			await ping(pingUrl());
		}
		return response;
	});
}

/** Le tic admis, et sa réponse. */
async function tick({
	database,
	provider,
}: Pick<TickEndpointOptions, "database" | "provider">): Promise<Response> {
	let followers: FollowerProvider;
	try {
		followers = provider();
	} catch (cause) {
		return failure(CONFIGURATION_INCOMPLETE, cause);
	}
	let report: TickReport | null;
	try {
		report = await runTick({ db: database(), provider: followers });
	} catch (cause) {
		return failure(TICK_FAILED, cause);
	}
	if (report === null) {
		return Response.json({ message: PASS_RUNNING });
	}
	return Response.json(
		{
			passes: report.passes.map(toToolPass),
			erreur_nombre_abonnes: report.followerCountError,
		},
		{ status: report.failed ? 500 : 200 },
	);
}

/**
 * Le signal d'un tic réussi : un `GET` sur `url` (doc healthchecks.io « Pinging API »), rien sans
 * adresse. Son échec — rejet, délai dépassé, statut hors `2xx` — se journalise côté serveur par le
 * seul nom de l'erreur ou le statut, sans changer la réponse du tic.
 */
async function ping(url: string | undefined): Promise<void> {
	if (!url) {
		return;
	}
	try {
		const { ok, status } = await fetch(url, {
			signal: AbortSignal.timeout(PING_TIMEOUT_MS),
		});
		if (!ok) {
			console.error(`Tic : ${PING_FAILED}`, `statut ${status}`);
		}
	} catch (cause) {
		// Le nom seul : le message d'un rejet peut recopier l'adresse.
		console.error(
			`Tic : ${PING_FAILED}`,
			cause instanceof Error ? cause.name : "rejet",
		);
	}
}

/** Journalise `cause` côté serveur et rend `500` au message fixe `message`. */
function failure(message: string, cause: unknown): Response {
	console.error(`Tic : ${message}`, cause);
	return Response.json({ message }, { status: 500 });
}
