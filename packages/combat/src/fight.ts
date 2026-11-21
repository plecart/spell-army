import { type Fighter, summarize } from "./army.ts";
import { bagOf, diceOf } from "./dice.ts";
import { lineupOf, type Turn } from "./lineup.ts";
import {
	type Action,
	type ArmyAction,
	type CombatLog,
	type Forced,
	type MonsterAction,
	type Outcome,
	RULES_VERSION,
} from "./log.ts";
import type { Monster, MonsterAttack } from "./monster.ts";
import { cast, type Situation, strike } from "./power.ts";

/**
 * Le garde-fou (game design § 4) : au-delà de ce nombre d'actions des deux camps, le combat
 * s'arrête en défaite « par épuisement ». Sécurité du programme, pas règle du jeu.
 */
const MAX_ACTIONS = 10_000;
/** Le compteur d'initiative de départ (game design § 4, « Initiative »). */
const INITIATIVE_START = 0.5;
/**
 * La part de sa Vie de départ sous laquelle une Vie restante compte pour 0 : le résidu des pertes
 * soustraites une à une en flottant (Vie 1 moins dix coups de 0,1 : 1,4e-16). Une action arrondit
 * une Vie d'au plus 2 × 2⁻⁵³ ≈ 2,2e-16 de sa Vie de départ (le soin, puis la perte), 10 000
 * actions d'au plus 2,2e-12 : le seuil garde plus de deux ordres de grandeur de marge.
 */
const LIFE_ROUNDING = 1e-9;
/** La phase finale : un camp sous cette part de sa Vie de départ (game design § 5, « Traduction »). */
const FINAL_PHASE = 0.25;

/**
 * Les entrées d'un combat : l'armée, des personnages déjà calculés ; le monstre ; la graine, un
 * texte non vide, calculée par l'appelant ; la version de la réserve de sorts, portée au journal ;
 * les forcés (game design § 5), placés dans l'ordre de passage de l'armée et portés à l'en-tête.
 */
export interface FightInput {
	army: readonly Fighter[];
	monster: Monster;
	seed: string;
	poolVersion: string;
	forced?: readonly Forced[];
}

type Side = Action["side"];

/**
 * Le combat de `army` contre `monster` (game design § 4), pur et sans E/S : même graine, mêmes
 * entrées, même journal. Chaque dé dérive de la graine, un flux par usage (`dice.ts`).
 *
 * - Initiative : R = Vitesse de l'armée / Vitesse du monstre, une vitesse totale de 0 comptée pour
 *   1. Le compteur part de 0,5 ; à chaque tour il gagne R, l'armée joue tant qu'il vaut au moins 1
 *   (chaque action lui ôte 1), puis le monstre joue une fois : à égalité, l'armée d'abord.
 * - L'armée tire un personnage sans remise (flux `army`), qui lance son sort (`power.ts`), sauf à
 *   la place d'un forcé (`lineup.ts`) ; le monstre tire une attaque sans remise (flux `monster`).
 * - Phase finale, qui place les forcés en dernier : un camp sous 25 % de sa Vie de départ, à
 *   l'arrondi des pertes cumulées près, au moment où l'armée joue.
 * - Les dégâts ne descendent pas une Vie sous 0, et une Vie que seul l'arrondi des pertes cumulées
 *   garde au-dessus tombe à 0 ; le soin ne passe pas la Vie maximale de l'armée ; un sort coûteux
 *   fait perdre à l'armée sa part des dégâts infligés, après le coup.
 * - Fin : victoire quand la Vie du monstre est à 0, défaite quand celle de l'armée l'est — le
 *   monstre se regarde d'abord, avant la première action comme après chacune ; défaite par
 *   épuisement au-delà de 10 000 actions.
 *
 * @throws {RangeError} si l'armée est vide, si le monstre n'a aucune attaque, si la graine n'est
 * pas un texte non vide, ou si l'armée et ses forcés ne se placent pas (`lineupOf`).
 */
export function fight({
	army,
	monster,
	seed,
	poolVersion,
	forced = [],
}: FightInput): CombatLog {
	if (army.length === 0) {
		throw new RangeError("l'armée doit compter au moins un personnage");
	}
	if (monster.attacks.length === 0) {
		throw new RangeError("le monstre doit avoir au moins une attaque");
	}
	const armySummary = summarize(army);
	const lineup = lineupOf(army, forced, seed);
	const attacks = bagOf(monster.attacks, diceOf("monster", seed));
	let situation: Situation = {
		army: armySummary,
		armyLife: armySummary.stats.life,
		monsterLife: monster.stats.life,
		monsterStartLife: monster.stats.life,
		monsterLastHit: 0,
	};
	const actions: Action[] = [];
	for (const side of initiative(armySummary.stats.speed, monster.stats.speed)) {
		if (outcomeOf(situation) || actions.length === MAX_ACTIONS) break;
		const number = actions.length + 1;
		const action =
			side === "army"
				? armyAction(number, lineup.next(inFinalPhase(situation)), situation)
				: monsterAction(number, attacks.draw(), monster, situation);
		actions.push(action);
		situation = after(situation, action);
	}
	return {
		header: {
			rulesVersion: RULES_VERSION,
			poolVersion,
			seed,
			monster,
			army: armySummary,
			forced,
		},
		actions,
		summary: {
			outcome: outcomeOf(situation) ?? "exhaustion",
			actionCount: actions.length,
			armyLife: situation.armyLife,
			monsterLife: situation.monsterLife,
			drawn: drawnIds(actions),
			unreachedForced: lineup.unreached(),
		},
	};
}

/**
 * L'ordre des camps, sans fin : le compteur part de 0,5 et gagne R à chaque tour ; l'armée joue
 * tant qu'il vaut au moins 1, puis le monstre une fois.
 *
 * Au tour t, après n actions de l'armée, le compteur vaut 0,5 + t × R − n : l'armée rejoue tant que
 * t × Vitesse de l'armée ≥ (n + 0,5) × Vitesse du monstre. Ces produits se recalculent à chaque
 * comparaison, sans division ni compteur cumulé : cumulé en flottant, 0,5 + 5 × 0,1 vaut
 * 0,9999999999999999, et l'armée perdait l'action d'égalité.
 */
function* initiative(
	armySpeed: number,
	monsterSpeed: number,
): Generator<Side, never> {
	const army = armySpeed || 1;
	const monster = monsterSpeed || 1;
	for (let turn = 1, armyActions = 0; ; turn++) {
		while (turn * army >= (armyActions + INITIATIVE_START) * monster) {
			yield "army";
			armyActions++;
		}
		yield "monster";
	}
}

/** La situation après `action` : les Vie qu'elle laisse, et le dernier coup du monstre. */
function after(situation: Situation, action: Action): Situation {
	return {
		...situation,
		armyLife: action.armyLife[1],
		monsterLife: action.monsterLife[1],
		monsterLastHit:
			action.side === "monster" ? action.damage : situation.monsterLastHit,
	};
}

/** Les identifiants des tirés, chacun une fois, dans l'ordre de leur première action. */
function drawnIds(actions: readonly Action[]): string[] {
	return [
		...new Set(
			actions.flatMap((action) =>
				action.side === "army" ? [action.fighter.id] : [],
			),
		),
	];
}

/** Un camp est-il sous 25 % de sa Vie de départ, à l'arrondi des pertes cumulées près ? */
function inFinalPhase({
	army,
	armyLife,
	monsterLife,
	monsterStartLife,
}: Situation): boolean {
	const threshold = FINAL_PHASE - LIFE_ROUNDING;
	return (
		armyLife < threshold * army.stats.life ||
		monsterLife < threshold * monsterStartLife
	);
}

/** L'issue, dès qu'un camp est à 0 : le monstre se regarde d'abord. */
function outcomeOf({
	armyLife,
	monsterLife,
}: Situation): Exclude<Outcome, "exhaustion"> | undefined {
	if (monsterLife <= 0) return "victory";
	if (armyLife <= 0) return "defeat";
	return undefined;
}

/**
 * L'action d'un personnage : son sort frappe le monstre, sans descendre sa Vie sous 0, puis soigne
 * l'armée jusqu'à sa Vie maximale ; un sort coûteux lui ôte ensuite sa part des dégâts infligés,
 * ceux qu'a perdus le monstre — toute sa Vie restante quand il tombe à 0. `forced` : le personnage
 * joue à sa place forcée.
 */
function armyAction(
	number: number,
	{ fighter, forced }: Turn,
	situation: Situation,
): ArmyAction {
	const { recipe, armyStat, efficiency, damage, heal } = cast(
		fighter,
		situation,
	);
	const { armyLife, monsterLife, monsterStartLife, army } = situation;
	const monsterAfter = lifeAfter(monsterLife, damage, monsterStartLife);
	const inflicted = monsterAfter === 0 ? monsterLife : damage;
	const { form } = fighter.spell;
	const armyLoss = form.kind === "costly" ? form.armyLossShare * inflicted : 0;
	const armyAfter = lifeAfter(
		Math.min(army.stats.life, armyLife + heal),
		armyLoss,
		army.stats.life,
	);
	return {
		number,
		side: "army",
		fighter: { id: fighter.id, characterClass: fighter.characterClass },
		spell: { number: fighter.spell.number, name: fighter.spell.name },
		recipe,
		armyStat,
		efficiency,
		damage,
		heal,
		armyLife: [armyLife, armyAfter],
		monsterLife: [monsterLife, monsterAfter],
		forced,
	};
}

/** L'action du monstre : son attaque frappe l'armée, sans descendre sa Vie sous 0. */
function monsterAction(
	number: number,
	attack: MonsterAttack,
	monster: Monster,
	{ armyLife, monsterLife, army }: Situation,
): MonsterAction {
	const { monsterStat, damage } = strike(attack, monster.stats);
	return {
		number,
		side: "monster",
		attack: attack.name,
		recipe: attack.recipe,
		monsterStat,
		damage,
		armyLife: [armyLife, lifeAfter(armyLife, damage, army.stats.life)],
		monsterLife: [monsterLife, monsterLife],
	};
}

/**
 * Une Vie après une perte, jamais sous 0 : 0 dès qu'il n'en reste que l'arrondi des soustractions
 * cumulées, au plus `LIFE_ROUNDING` de la Vie de départ.
 */
function lifeAfter(life: number, loss: number, startLife: number): number {
	const left = life - loss;
	return left > LIFE_ROUNDING * startLife ? left : 0;
}
