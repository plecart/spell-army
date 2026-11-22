import type { PlayerSheet } from "joueurs";
import { characterOf, STAT_KEYS } from "personnages";
import { CLASS_NAMES } from "../annuaire/address.ts";
import { classColor } from "../class-style.ts";
import { STAT_NAMES } from "../stat-names.ts";
import { arrivalOf } from "./arrival.ts";
import { LiveStage } from "./live-stage.tsx";
import { Sheet, type SheetClose } from "./sheet.tsx";
import { SpellCard } from "./spell-card.tsx";
import { verdictPhraseOf } from "./verdict-phrase.ts";

// L'identifiant du titre de la fiche, qui nomme la feuille qui la porte (`aria-labelledby`).
const FICHE_TITLE_ID = "fiche-title";

// Le plafond d'une stat, une barre pleine (game design § 1, « Statistiques »).
const STAT_MAX = 15;

/**
 * La fiche d'une recrue `player` (direction artistique § 3, « Fiche »), dans l'ordre du prototype :
 * @pseudo, la scène sur le décor de sa classe, la classe et l'arrivée, la phrase de verdict, les
 * quatre stats de `characterOf`, puis la carte de son sort. La fiche prend la couleur de sa classe.
 */
export function Fiche({ player }: { player: PlayerSheet }) {
	const { instagramId, username, classKey, arrivedAt, spell, poolSize } =
		player;
	const character = characterOf(instagramId);
	return (
		<article className="fiche" style={classColor(classKey)}>
			<h2 id={FICHE_TITLE_ID}>@{username}</h2>
			<LiveStage classKey={classKey} />
			<p className="class-name">
				<span className="dot" />
				{CLASS_NAMES[classKey].label}
				<span className="arrival">{arrivalOf(arrivedAt)}</span>
			</p>
			<p className="verdict">{verdictPhraseOf(character)}</p>
			<ul className="stats">
				{STAT_KEYS.map((key) => (
					<Stat
						key={key}
						label={STAT_NAMES[key]}
						value={character.stats[key]}
					/>
				))}
			</ul>
			<p className="points">
				30 points en tout, répartis au hasard d'après le numéro du compte
				Instagram.
			</p>
			<h3>Son sort</h3>
			<SpellCard spell={spell} poolSize={poolSize} />
		</article>
	);
}

/**
 * La fiche de `player` dans la feuille qui la porte par-dessus l'annuaire, nommée par son titre et
 * refermée selon `onClose`.
 */
export function FicheSheet({
	player,
	onClose,
}: {
	player: PlayerSheet;
	onClose: SheetClose;
}) {
	return (
		<Sheet labelledBy={FICHE_TITLE_ID} onClose={onClose}>
			<Fiche player={player} />
		</Sheet>
	);
}

// Une stat : son libellé, sa barre sur `STAT_MAX`, décorative, puis sa valeur.
function Stat({ label, value }: { label: string; value: number }) {
	return (
		<li>
			{label}
			<span className="bar" aria-hidden="true">
				<span style={{ width: `${(value * 100) / STAT_MAX}%` }} />
			</span>
			<strong>{value}</strong>
		</li>
	);
}
