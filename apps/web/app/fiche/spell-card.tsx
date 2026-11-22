import { type Effect, type EffectCategory, effectCategory } from "combat";
import type { PlayerSheet } from "joueurs";
import type { CSSProperties } from "react";

// La pastille de chaque catégorie d'effet (direction artistique § 4, « En-tête ») et sa couleur
// (§ 2, « Couleurs d'effet des sorts »), qui teinte la carte, la pastille et la zone d'image.
const EFFECTS: Record<EffectCategory, { label: string; color: string }> = {
	damage: { label: "Dégâts", color: "#b83b26" },
	heal: { label: "Soin", color: "#4f7a3a" },
	lifesteal: { label: "Vol de vie", color: "#6e1f33" },
};

/**
 * La carte du sort `spell` (direction artistique § 4), au format 63 × 88 : le nom et la pastille
 * d'effet, l'image du sort, ou une zone unie à la couleur de l'effet quand il n'en a pas, la
 * description, puis au pied son numéro sur `poolSize`, la taille de la réserve.
 */
export function SpellCard({
	spell: { number, name, effect, description, hasImage },
	poolSize,
}: Pick<PlayerSheet, "spell" | "poolSize">) {
	// Le jsonb `effect` de `spells` a la forme d'un `Effect` : la réserve de départ transcrit
	// `STARTING_POOL`, que ses tests valident, et le serveur MCP valide chaque écriture
	// (`validateSpell`).
	const { label, color } = EFFECTS[effectCategory(effect as Effect)];
	return (
		<article
			className="spell-card"
			style={{ "--effect-color": color } as CSSProperties}
		>
			<header>
				<h4>{name}</h4>
				<span className="effect">{label}</span>
			</header>
			{hasImage ? (
				// biome-ignore lint/performance/noImgElement: une image décorative servie telle quelle par la route du sort, gardée une heure par le navigateur et le CDN.
				<img
					className="spell-image"
					src={`/api/sorts/${number}/image`}
					alt=""
				/>
			) : (
				<div className="spell-image" />
			)}
			<p className="spell-description">{description}</p>
			<p className="spell-number">
				{number}/{poolSize}
			</p>
		</article>
	);
}
