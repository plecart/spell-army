import { diceOf } from "./dice.ts";

/** Un sort de la réserve tirable : son identifiant et son poids, un nombre fini ≥ 0. */
export interface SpellEntry {
	id: string;
	weight: number;
}

/**
 * Le sort d'un identifiant Instagram, tiré dans la réserve tirable au prorata des poids (game
 * design § 1, « Sort » ; § 2, « Rareté »). Le tirage ne lit que le flux `spell` des dés : il est
 * indépendant de la classe.
 *
 * Les sorts de poids positif se trient par `id` en unités de code (`<`, jamais `localeCompare`,
 * dont l'ordre change avec la locale : « ä » avant « z » en allemand, après en suédois), puis par
 * poids entre `id` en double, pour que l'ordre de la réserve ne change rien. Avec u, 48 bits du
 * flux `spell`, et r = u × Σ des poids, le sort tiré est le premier dont la somme cumulée des
 * poids, dans cet ordre, dépasse strictement r : un sort de poids 0 n'ouvre aucun intervalle.
 *
 * @throws {RangeError} si l'identifiant n'est pas un texte non vide de chiffres décimaux, si un
 * poids est négatif ou non fini, si aucun poids n'est positif ou si leur somme n'est pas finie.
 */
export function drawSpell(
	instagramId: string,
	pool: readonly SpellEntry[],
): string {
	const dice = diceOf("spell", instagramId);
	const drawable = drawableSpells(pool);
	const total = drawable.reduce((sum, { weight }) => sum + weight, 0);
	if (!Number.isFinite(total)) {
		throw new RangeError(
			"la somme des poids de la réserve tirable doit rester un nombre fini",
		);
	}
	const threshold = dice.fraction() * total;
	let cumulative = 0;
	for (const { id, weight } of drawable) {
		cumulative += weight;
		if (cumulative > threshold) return id;
	}
	// Quand Σ est sous-normale, l'arrondi de u × Σ peut l'atteindre : le dernier sort prend ce reste.
	return (drawable.at(-1) as SpellEntry).id;
}

/** Les sorts de poids positif, dans l'ordre du tirage ; au moins un, sans aucun poids fautif. */
function drawableSpells(pool: readonly SpellEntry[]): SpellEntry[] {
	for (const { id, weight } of pool) {
		if (!(Number.isFinite(weight) && weight >= 0)) {
			throw new RangeError(
				`le poids du sort « ${id} » doit être un nombre fini ≥ 0, reçu : ${weight}`,
			);
		}
	}
	const drawable = pool
		.filter(({ weight }) => weight > 0)
		.toSorted(byIdThenWeight);
	if (drawable.length === 0) {
		throw new RangeError(
			"la réserve tirable doit contenir au moins un sort de poids positif",
		);
	}
	return drawable;
}

// Le poids départage les `id` en double : deux entrées égales en tout sont interchangeables, donc
// l'ordre trié ne dépend que du contenu de la réserve, jusqu'aux arrondis de la somme cumulée.
function byIdThenWeight(a: SpellEntry, b: SpellEntry): number {
	if (a.id !== b.id) return a.id < b.id ? -1 : 1;
	return a.weight - b.weight;
}
