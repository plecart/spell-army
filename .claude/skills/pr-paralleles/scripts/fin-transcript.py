"""Reconstitue le récit d'une session Claude Code disparue, depuis ses transcripts JSONL.

Usage : python fin-transcript.py <transcript.jsonl> [<nombre de tours>]

Une session tuée par l'arrêt de l'application n'écrit aucune passation. Le seul récit de l'étape
qu'elle avait atteinte est la fin de son transcript ; le seul récit de ses sous-agents est le leur,
et un sous-agent lancé en fond avant l'arrêt est perdu sans avoir rien rendu. Ce script
rend les trois choses qu'on cherche alors, et rien d'autre :

1. **la fin de l'échange** — les derniers tours, pour savoir où elle en était ;
2. **les messages du mainteneur** — les décisions prises en séance, seule matière du transcript qui
   ne se re-dérive pas des artefacts ;
3. **le dernier texte de chaque sous-agent** — avec son rôle et sa description.

Ce qui est **prouvé** se lit sur les artefacts — tête, base, CI, body de PR, worktrees : ce script
n'en touche aucun. Il rend le *récit*, et la passation qu'on écrit ensuite doit séparer les deux.

Les sous-agents se trouvent seuls, à côté du transcript : `<transcript sans .jsonl>/subagents/`.

Python 3.11 ou plus, bibliothèque standard seule.
"""

import json
import re
import sys
from collections import deque
from collections.abc import Iterator
from pathlib import Path
from typing import Any, cast

TOURS = 12
EXTRAIT = 400

# Les blocs que le harnais injecte dans le rôle `user` : `<task-notification>`, `<command-message>`,
# `<system-reminder>`, `<ide_opened_file>`… Un `sub` **non gourmand** les retire ; ce qui reste est
# de la main du mainteneur — sauf la commande tapée, faite de blocs, que `COMMANDE_TAPEE` rend. Le
# nom se lit sans attribut à dessein — `<pasted_content id="…">` en porte un, et son contenu est du
# texte que le mainteneur a collé, donc il doit rester.
#
# `bilan-session.py` (skill `cycle-pr`) porte une version plus stricte de cette distinction, parce
# qu'il **compte** les contacts humains et doit donc trancher pour chaque message. Ici on ne compte
# rien : on rend du texte à lire, et une erreur de classement se voit — un retrait trop généreux
# laisse un message vide, une forme injectée non reconnue apparaît en clair parmi les messages du
# mainteneur, reconnaissable à sa balise. Les deux scripts ne s'importent pas l'un l'autre à
# dessein : un skill recopié dans un dépôt sans l'autre doit fonctionner seul.
BLOC_INJECTE = re.compile(r"<(?P<balise>[a-z][a-z0-9_-]*)>.*?</(?P=balise)>", re.DOTALL)

# Une commande **tapée** par le mainteneur — skill ou commande locale — porte la barre oblique dans
# son `<command-name>`, et ses arguments vivent dans `<command-args>`. Retirée avec les autres
# blocs, elle disparaissait, arguments compris ; un skill que le harnais charge de lui-même n'a pas
# de barre oblique. Elle n'est faite que de blocs, et commence par l'un des deux qui la nomment :
# citée dans une prose, ou dans une notification qui ouvre le message, elle n'en est pas une.
# Dénombrement : relevé d'origine non joint au seed.
TETES_DE_COMMANDE = ("<command-message>", "<command-name>")
COMMANDE_TAPEE = re.compile(r"<command-name>(/[^<]+)</command-name>")
ARGUMENTS = re.compile(r"<command-args>(.*?)</command-args>", re.DOTALL)

# Les textes injectés qui ne sont pas des blocs balisés.
PREFIXES_INJECTES = (
    "Base directory for this skill:",
    "[Cross-session idle notice]",
    "[Request interrupted",
    "Another Claude session sent a message",
    "This session is being continued from a previous conversation",
)


def enregistrements(chemin: Path) -> Iterator[dict[str, Any]]:
    """Les lignes JSON d'un transcript, une par une, les illisibles sautées.

    Args:
        chemin: le fichier `.jsonl` à lire.

    Yields:
        Chaque enregistrement décodé. Un transcript de plusieurs dizaines de mégaoctets se lit
        ligne à ligne : rien n'est gardé en mémoire que ce que l'appelant retient.
    """
    with open(chemin, encoding="utf-8") as flux:
        for ligne in flux:
            try:
                yield json.loads(ligne)
            except json.JSONDecodeError:
                continue


def texte(enregistrement: dict[str, Any]) -> str:
    """Le texte d'un enregistrement, blocs concaténés, ou la chaîne vide s'il n'en porte pas."""
    contenu = cast(dict[str, Any], enregistrement.get("message") or {}).get("content")
    if isinstance(contenu, str):
        return contenu
    if not isinstance(contenu, list):
        return ""
    return "".join(
        str(cast(dict[str, Any], bloc).get("text", ""))
        for bloc in cast(list[object], contenu)
        if isinstance(bloc, dict) and cast(dict[str, Any], bloc).get("type") == "text"
    )


def message_du_mainteneur(enregistrement: dict[str, Any]) -> str | None:
    """Ce que le mainteneur a tapé dans cet enregistrement du rôle `user`, prêt à afficher.

    Le harnais marque `isMeta` ce qu'il injecte : un corps de skill intégré ou un avis de reprise
    ne commence par aucun préfixe commun, et seule l'étiquette les écarte. Une commande tapée se
    rend `/nom arguments`. Sinon, un message n'est injecté que s'il ne reste **rien** après
    retrait des blocs balisés : le harnais préfixe parfois le texte humain d'un bloc de contexte au
    lieu de l'injecter seul (`<ide_opened_file>…</ide_opened_file>oui go`), et s'arrêter à la tête
    perdrait ce « oui go ».

    Args:
        enregistrement: une ligne décodée du transcript.

    Returns:
        Le texte du mainteneur — blocs du harnais retirés, ou sa commande rendue `/nom
        arguments` —, ou `None` si le harnais l'a injecté.
    """
    if enregistrement.get("isMeta"):
        return None
    brut = texte(enregistrement).strip()
    reste = BLOC_INJECTE.sub("", brut).strip()
    if reste:
        return None if reste.startswith(PREFIXES_INJECTES) else reste
    commande = COMMANDE_TAPEE.search(brut) if brut.startswith(TETES_DE_COMMANDE) else None
    if commande is None:
        return None
    arguments = ARGUMENTS.search(brut)
    return " ".join(filter(None, (commande[1], arguments[1].strip() if arguments else "")))


def extrait(brut: str) -> str:
    """Le texte réduit à une ligne d'au plus `EXTRAIT` caractères, pour un rapport lisible."""
    plat = " ".join(brut.split())
    return plat if len(plat) <= EXTRAIT else f"{plat[:EXTRAIT]}…"


def sous_agents(transcript: Path) -> list[Path]:
    """Les transcripts des sous-agents de cette session, triés par nom.

    Args:
        transcript: le `.jsonl` de la session.

    Returns:
        Les `.jsonl` de `<transcript sans extension>/subagents/`, ou une liste vide si ce dossier
        n'existe pas — une session sans sous-agent est le cas normal, pas une anomalie.
    """
    dossier = transcript.with_suffix("") / "subagents"
    return sorted(dossier.glob("*.jsonl")) if dossier.is_dir() else []


def identite(agent: Path) -> str:
    """Le rôle et la description d'un sous-agent, lus dans son `.meta.json` voisin."""
    meta = agent.with_suffix(".meta.json")
    if not meta.is_file():
        return agent.stem
    try:
        champs: dict[str, Any] = json.loads(meta.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return agent.stem
    return f"{champs.get('agentType', '?')} — {champs.get('description', agent.stem)}"


def dernier_texte(chemin: Path) -> tuple[str, str]:
    """L'horodatage et le texte du dernier message d'assistant de ce transcript.

    Returns:
        Le couple (horodatage, texte), ou `("", "")` si le transcript n'en contient aucun — un
        sous-agent mort avant son premier mot laisse un transcript sans texte d'assistant, et
        c'est une information, pas une erreur.
    """
    trouve = ("", "")
    for enregistrement in enregistrements(chemin):
        if enregistrement.get("type") == "assistant" and (corps := texte(enregistrement).strip()):
            trouve = (str(enregistrement.get("timestamp", "")), corps)
    return trouve


def rapport(transcript: Path, tours: int) -> list[str]:
    """Les trois sections du rapport, prêtes à imprimer."""
    derniers: deque[tuple[str, str, str]] = deque(maxlen=tours)
    humains: list[tuple[str, str]] = []
    for enregistrement in enregistrements(transcript):
        type_ = enregistrement.get("type")
        if type_ not in ("user", "assistant"):
            continue
        brut = texte(enregistrement).strip()
        if not brut:
            continue
        horodatage = str(enregistrement.get("timestamp", ""))
        derniers.append((horodatage, str(type_), brut))
        if type_ == "user" and (tape := message_du_mainteneur(enregistrement)):
            humains.append((horodatage, tape))

    agents = sous_agents(transcript)
    puces_humains = [f"- `{quand}` {extrait(corps)}" for quand, corps in humains]
    puces_agents: list[str] = []
    for agent in agents:
        quand, corps = dernier_texte(agent)
        rendu = f"`{quand}` {extrait(corps)}" if corps else "**aucun texte** — mort avant de rendre"
        puces_agents += [f"- **{identite(agent)}**", f"  {rendu}"]

    return [
        f"# Fin de transcript — {transcript.name}",
        "",
        f"## Derniers tours ({len(derniers)} sur les {tours} demandés)",
        "",
        *[f"- `{quand}` **{role}** : {extrait(corps)}" for quand, role, corps in derniers],
        "",
        f"## Messages du mainteneur ({len(humains)})",
        "",
        *(puces_humains or ["- aucun"]),
        "",
        f"## Sous-agents ({len(agents)})",
        "",
        *(puces_agents or ["- aucun"]),
    ]


def nombre_de_tours(argument: str | None) -> int | None:
    """Le nombre de tours demandé, ou `None` si l'argument n'est pas un entier positif.

    Args:
        argument: le second argument de la ligne de commande, absent → `TOURS`.

    Returns:
        L'entier, ou `None` pour tout ce qui n'en est pas un ou vaut moins de 1 — les deux
        refus sont le même refus pour l'appelant, qui n'a qu'un code de sortie à rendre.
    """
    if argument is None:
        return TOURS
    try:
        valeur = int(argument)
    except ValueError:
        return None
    return valeur if valeur >= 1 else None


def main(arguments: list[str]) -> int:
    """Imprime le rapport ; sort en 2 sur un usage fautif, en 1 si le transcript est introuvable.

    La ligne de commande est une frontière d'entrée saisie à la main : chaque champ est vérifié
    pour sa présence **et** son type, en une passe — le transcript (présent, existant), le nombre
    de tours (entier, positif), et rien de plus. Un usage fautif sort en 2, distinct du 1 de
    l'absence : un `abc` qui sortait sur une trace en 1 se lisait comme « transcript introuvable ».
    """
    if not arguments or arguments[0] in ("-h", "--help") or len(arguments) > 2:
        print(__doc__, file=sys.stderr)
        return 2
    transcript = Path(arguments[0])
    if not transcript.is_file():
        print(f"transcript introuvable : {transcript}", file=sys.stderr)
        return 1
    tours = nombre_de_tours(arguments[1] if len(arguments) > 1 else None)
    if tours is None:
        print(f"nombre de tours invalide : {arguments[1]!r}", file=sys.stderr)
        return 2
    # La console du poste est en cp1252 et les transcripts sont pleins de flèches et d'emojis :
    # imprimé tel quel, le rapport mourait sur le premier `→` — rc 1, rien d'imprimé, l'outil
    # d'incident mort à l'incident (mesuré). D'où des octets UTF-8 écrits sur le tampon, **sans**
    # envelopper `sys.stdout` dans un `TextIOWrapper` : collecté, il ferme le flux qu'il enveloppe,
    # et un appelant en processus — la suite de tests — perdait sa sortie derrière (mesuré : toute
    # la suite suivante rougissait).
    sys.stdout.flush()
    sys.stdout.buffer.write(("\n".join(rapport(transcript, tours)) + "\n").encode("utf-8"))
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
