import type { Fighter } from "./army.ts";
import { bagOf, diceOf } from "./dice.ts";
import type { Forced, UnreachedForced } from "./log.ts";

/** Les rangs, dans les actions de l'armée, où un forcé au milieu tire sa place (game design § 5). */
const MIDDLE_RANKS = { from: 2, to: 10 } as const;

/** Le personnage d'une action de l'armée, et s'il la joue à sa place forcée. */
export interface Turn {
	fighter: Fighter;
	forced: boolean;
}

/** L'ordre de passage de l'armée : qui joue chacune de ses actions. */
export interface Lineup {
	/**
	 * Le tour de la prochaine action de l'armée. `finalPhase` : un camp est sous 25 % de sa Vie de
	 * départ au moment de l'action.
	 */
	next(finalPhase: boolean): Turn;
	/** Les forcés dont la place n'a pas été jouée, dans l'ordre donné. */
	unreached(): UnreachedForced[];
}

/**
 * L'ordre de passage de `army` avec ses forcés (game design § 5, « Traduction ») :
 *
 * - un forcé sort du tirage tant qu'il n'a pas joué sa place, puis y rentre comme s'il venait
 *   d'en sortir : il ne rejoue pas avant que le tirage ne se remplisse ;
 * - `first` : les premières actions de l'armée, dans l'ordre donné ;
 * - `middle` : un rang de la 2e à la 10e action de l'armée, tiré dans le flux `forced`, forcé
 *   par forcé dans l'ordre donné ; un rang déjà pris passe au suivant libre ;
 * - `last` : dès la première action de l'armée en phase finale, à la suite, dans l'ordre donné —
 *   la phase finale, une fois ouverte, le reste ; un rang déjà pris passe au suivant ;
 * - toute autre action se tire sans remise parmi les autres personnages (flux `army`).
 *
 * @throws {RangeError} si un identifiant revient dans l'armée, si un forcé n'est pas dans l'armée
 * ou l'est deux fois, ou si l'armée ne garde personne à tirer pour sa première action : ni
 * personnage hors des forcés, ni forcé en premier.
 */
export function lineupOf(
	army: readonly Fighter[],
	forced: readonly Forced[],
	seed: string,
): Lineup {
	const byId = indexed(army);
	checkForced(forced, byId);
	const forcedIds = new Set(forced.map(({ id }) => id));
	const drawable = army.filter(({ id }) => !forcedIds.has(id));
	if (
		drawable.length === 0 &&
		!forced.some(({ position }) => position === "first")
	) {
		throw new RangeError(
			"l'armée doit garder un personnage à tirer : hors des forcés, ou forcé en premier",
		);
	}
	const bag = bagOf(drawable, diceOf("army", seed));
	const ranks = ranksOf(forced, seed);
	const lasts = forced.filter(({ position }) => position === "last");
	const played = new Set<string>();
	let rank = 0;
	let finalPhaseOpen = false;
	return {
		next(finalPhase) {
			rank += 1;
			finalPhaseOpen ||= finalPhase;
			const place =
				ranks.get(rank) ??
				(finalPhaseOpen ? lasts.find(({ id }) => !played.has(id)) : undefined);
			if (place === undefined) return { fighter: bag.draw(), forced: false };
			const fighter = byId.get(place.id) as Fighter;
			played.add(place.id);
			bag.add(fighter);
			return { fighter, forced: true };
		},
		unreached() {
			return forced
				.filter(({ id }) => !played.has(id))
				.map(({ id, position }) => ({ id, position }));
		},
	};
}

/** Les personnages par identifiant. @throws {RangeError} si un identifiant revient. */
function indexed(army: readonly Fighter[]): Map<string, Fighter> {
	const byId = new Map<string, Fighter>();
	for (const fighter of army) {
		if (byId.has(fighter.id)) {
			throw new RangeError(
				`l'identifiant « ${fighter.id} » revient deux fois dans l'armée`,
			);
		}
		byId.set(fighter.id, fighter);
	}
	return byId;
}

/** @throws {RangeError} si un forcé n'est pas dans l'armée, ou l'est deux fois. */
function checkForced(
	forced: readonly Forced[],
	byId: ReadonlyMap<string, Fighter>,
): void {
	const seen = new Set<string>();
	for (const { id } of forced) {
		if (!byId.has(id)) {
			throw new RangeError(`le forcé « ${id} » n'est pas dans l'armée`);
		}
		if (seen.has(id)) {
			throw new RangeError(`le personnage « ${id} » est forcé deux fois`);
		}
		seen.add(id);
	}
}

/**
 * Les rangs fixés d'avance, à partir de 1 : les forcés en premier, puis ceux du milieu, chacun au
 * rang tiré ou au suivant libre.
 */
function ranksOf(forced: readonly Forced[], seed: string): Map<number, Forced> {
	const ranks = new Map<number, Forced>();
	const firsts = forced.filter(({ position }) => position === "first");
	firsts.forEach((first, index) => {
		ranks.set(index + 1, first);
	});
	const dice = diceOf("forced", seed);
	const span = MIDDLE_RANKS.to - MIDDLE_RANKS.from + 1;
	for (const middle of forced.filter(({ position }) => position === "middle")) {
		let rank = MIDDLE_RANKS.from + dice.index(span);
		while (ranks.has(rank)) rank += 1;
		ranks.set(rank, middle);
	}
	return ranks;
}
