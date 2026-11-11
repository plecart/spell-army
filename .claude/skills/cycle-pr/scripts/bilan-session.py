"""Bilan chiffré d'une session Claude Code, lu dans ses transcripts JSONL.

Usage : python bilan-session.py <transcript.jsonl> [<relais.jsonl> …]
                                [--relecture <transcript.jsonl>] …

Un cycle qui a rempli un contexte a **plusieurs** transcripts : le script en accepte autant
qu'on lui en donne, les fusionne dans l'ordre du temps et rend l'heure de chaque relais.
Les positionnels sont la session et ses relais. La session de relecture, quand la PR en a une,
passe par `--relecture`, une option par transcript, relais compris : ses jetons, ses sous-agents
et son profil se rendent, sans entrer dans la chronologie, les attentes ni le temps des
sous-agents. Son transcript vit sous le dossier de projet de son propre worktree ; le script lit
les sous-agents rangés sous le dossier de chaque transcript (`subagents`).

Rend, sans double compte : la durée de la session ; l'attente — du mainteneur ou d'un pair,
jusqu'au dernier message qui rouvre le tour de l'agent — **scindée** en réactivité (moins d'une
heure) et absences (une heure ou plus), le pourcentage hors absences en tête — les deux n'ont ni
la même cause ni le même remède, et leur somme se lit comme un défaut de la pipeline alors
qu'une nuit relève du calendrier ; le temps des sous-agents et des workflows,
**retiré** de cette attente, qui le compterait sinon comme du temps passé à attendre ; le temps
d'agent seul ; les jetons facturés par la session ; le cache que chaque sous-agent a lu et écrit,
**contact par contact**, lu dans son propre transcript — la notification de fin de son lancement
ne porte que le contexte en fin de premier contact, et un agent au premier plan n'en émet
aucune ; sa sortie, que ce transcript ne porte pas de façon fiable, n'est pas rendue ; les points
de contact humains et les appels d'outils.

Puis le **profil de contexte** de chaque transcript de session donné — pas de ses sous-agents :
ses appels d'API, un par message ; le contexte du premier ; le cache lu moyen de chaque quart
des appels ; sa première porte de relecture — un `Skill` `code-review` ou `security-review`, un
`Agent` `relecteur`, ou un `SendMessage` à une session que le même transcript a démarrée plus
haut (`REVIEW_GATES`) — et la part du cache lu après elle ; la composition de ses blocs de
contenu en caractères — retours d'outils par outil, réflexion, arguments d'outils et leur part
d'édition, skills chargés, texte. N'y comptent pas : les pièces jointes (`attachment`), les
copies de requête (`api-request-blob`), un bloc non textuel d'un retour d'outil (image,
référence d'outil).

Le profil se lit sur une session PR ou une session de relecture : un transcript qui démarre
d'autres sessions que sa relecture — une coordinatrice, par exemple — voit sa « première porte »
au premier message vers l'une d'elles.

Python 3.11 ou plus, bibliothèque standard seule.
"""

import argparse
import json
import re
import sys
from collections import Counter
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from statistics import fmean, median
from typing import Any, NamedTuple, cast

# Une attente d'une heure ou plus n'est pas de la réactivité : c'est une absence, que la pipeline
# ne peut pas réduire. Les mêler fait attribuer au processus ce qui revient au calendrier.
ABSENCE = timedelta(hours=1)
QUESTION_TOOL = "AskUserQuestion"
SUBAGENT_TOOLS = {"Agent", "Task", "Workflow"}
WORKFLOW_TOOL = "Workflow"
SYSTEM_REMINDER = re.compile(r"<system-reminder>.*?</system-reminder>", re.DOTALL)

# Une notification de fin de tâche, telle que le harnais la livre — sous deux formes : une pièce
# jointe `queued_command` dont le `commandMode` le dit, ou un message `user` dont le texte nu
# **commence** par la balise. Un test sur la *ligne* entière — la chaîne `<task-notification`
# apparaît aussi dans le texte du prompt système d'un `prompt_snapshot`, et dans les messages
# qui en citent une — compte ces citations comme des fins de sous-agent. Dénombrement et
# population : `FORMES_DE_LIVRAISON` dans la suite.
NOTIFICATION_MODE = "task-notification"
NOTIFICATION_TAG = "<task-notification>"
TOOL_USE_ID = re.compile(r"<tool-use-id>(?P<id>[^<]+)</tool-use-id>")
STATUS_COMPLETED = "<status>completed</status>"

# Les deux balises qu'un message de pair peut porter. N'en chercher qu'une classait les messages
# d'équipier portant l'autre comme des messages du mainteneur — la classe avait été fermée sur
# la seule forme qui l'avait révélée. Dénombrement et population : `FORMES_REELLES` dans la
# suite, seul endroit où les chiffres vivent — recopiés ici, ils dérivent au recensement suivant.
PEER_TAGS = ("<cross-session-message", "<agent-message")

# L'avis qu'une session voisine est au repos, que l'agent a demandé pour l'attendre : il rouvre un
# tour de pair au même titre que le message qu'elle aurait envoyé.
PEER_NOTICE = "[Cross-session idle notice]"

# Une commande **tapée** par le mainteneur — skill ou commande locale — porte la barre oblique
# dans le bloc de premier niveau qui la nomme ; un skill que le harnais charge de lui-même n'en
# porte pas. Population : `FORMES_REELLES`.
TYPED_COMMAND = ("command-name", "/")

# Les classes de message qui rouvrent un tour de l'agent, donc ferment son attente : le
# mainteneur, prose ou commande tapée, et un pair.
TURN_OPENERS = ("human", "peer")

# Ce qui montre l'agent au travail : sa sortie, et le retour d'un outil qu'il a lancé.
AGENT_ACTIVITY = ("assistant", "tool_result")

# Dans le transcript d'un sous-agent, le message par lequel le coordinateur le reprend — un
# `SendMessage`, que l'agent ait fini ou non. C'est lui qui ouvre un nouveau contact.
COORDINATOR = "The coordinator sent a message"

# Le harnais injecte ses textes dans le rôle `user` sous des **balises** : `<task-notification>`,
# `<command-message>`, `<local-command-caveat>`, `<ide_opened_file>`… Les énumérer une par une,
# c'est rouvrir le défaut à chaque balise neuve ; cette forme-là ferme la famille entière.
#
# Mais une balise **en tête** ne suffit pas à classer : le harnais préfixe le texte humain d'une
# balise de contexte au lieu de l'injecter seule — `<ide_opened_file>…</ide_opened_file>oui go` —
# et s'arrêter à la tête perdait ce « oui go ». Un message n'est injecté que s'il n'est **rien
# d'autre** que des blocs de balises équilibrés ; ce qui dépasse est de la main du mainteneur.
# Le nom se lit sans attribut à dessein : `<pasted_content id="…">` en porte un, et son contenu
# est du texte que le mainteneur a collé. Population et dénombrement : `FORMES_REELLES`.
#
# Le corps d'un bloc ne peut pas contenir sa propre fermeture — `(?:(?!</\1>).)*` et non `.*?`.
# Ce n'est pas un raffinement : avec `.*?`, un découpage ambigu rend le motif **exponentiel**,
# parce que chaque bloc peut se fermer sur n'importe quelle fermeture suivante. Mesuré le
# 2026-10-10 sur `<a>x</a>` répété puis un caractère qui fait échouer : 0,03 s à 18 blocs,
# 0,09 s à 20, ×3 tous les deux blocs — quelques dizaines de blocs suffisent à figer la mesure.
# Sous cette forme, le découpage est unique et le coût redevient quasi linéaire — là où le motif
# naïf n'atteint pas 25 blocs. Relevé, plage et commande dans
# `test_une_suite_de_blocs_qui_echoue_ne_fait_pas_exploser_le_classement`, jamais ici.
_BLOCK = r"\s*<([a-z][a-z0-9_-]*)>((?:(?!</\1>).)*)</\1>"
INJECTED_BLOCKS = re.compile(rf"\A(?:{_BLOCK})+\s*\Z", re.DOTALL)

# Un seul bloc de premier niveau, pour les parcourir un à un — même motif, même coût.
BLOCK = re.compile(_BLOCK, re.DOTALL)

# Et les formes injectées qui ne sont **pas** des balises — à énumérer, elles. `Caveat: The
# messages below were generated` y figurait et n'a jamais mordu : la forme réelle est
# `<local-command-caveat>Caveat: …`, donc une balise. Dénombrement : `FORMES_REELLES`.
# La première est le corps d'un skill chargé, que la composition d'un profil compte à part.
SKILL_BODY = "Base directory for this skill:"
INJECTED = (
    SKILL_BODY,
    "[Request interrupted",
    "# Workflow authoring reference",
    "This session is being continued from a previous conversation",
)

# Les formes d'une **porte de relecture** : (outil, champ de son `input`, valeur). Le premier
# `tool_use` d'un transcript de session qui en satisfait une est sa première porte (`Profile`) ;
# une forme de plus s'ajoute par une ligne. `STARTED_SESSION` tient lieu de toute session que le
# même transcript a démarrée **plus haut** par `START_SESSION_TOOL`, et c'est aussi ce que le
# libellé en rend. Pour une session PR, c'est la session de relecture qu'elle démarre au go de son
# briefing ; la limite qu'en tire un transcript qui en démarre d'autres est dans la docstring du
# module.
# Population : `PORTES` dans la suite, tenue égale à cette table.
STARTED_SESSION = "→ session démarrée"
REVIEW_GATES = (
    ("Skill", "skill", "code-review"),
    ("Skill", "skill", "security-review"),
    ("Agent", "subagent_type", "relecteur"),
    ("SendMessage", "to", STARTED_SESSION),
)

# L'outil qui démarre une session liée, et les deux adresses que son retour porte — forme relevée
# sur une session PR : `Started session "…" (session_id: local_<uuid>, name: …)`.
# Elles se lisent dans la **dernière** parenthèse de cette forme : le titre, libre, la précède.
# L'identifiant y est obligatoire, le nom optionnel et lu jusqu'à la parenthèse fermante : un nom
# absent, vide ou hors de `[\w-]` ne fait pas perdre l'identifiant.
# `SendMessage` accepte l'une ou l'autre, le nom suivi de ` [<ref>]` quand il est ambigu (doc de
# l'outil : « worker [3fa9c1] ») : le destinataire se compare débarrassé de ce suffixe.
START_SESSION_TOOL = "mcp__ccd_session__start_session"
SESSION_ADDRESS = re.compile(r"\(session_id: ([\w-]+)(?:, name: ([^)]*))?\)")
REF_SUFFIX = re.compile(r" \[[^\]]+\]$")

# Les outils dont les arguments portent une édition de fichier : leur part des arguments d'outils
# se rend à part dans la composition d'un profil.
EDIT_TOOLS = frozenset({"Edit", "Write", "NotebookEdit"})

# Les blocs de réflexion, et les champs dont la longueur compte pour chacun.
THINKING_FIELDS = {"thinking": ("thinking", "signature"), "redacted_thinking": ("data",)}

Interval = tuple[datetime, datetime]


@dataclass
class Event:
    """Une ligne datée d'un transcript.

    Attributes:
        when: son horodatage.
        kind: `assistant`, `tool_result`, `notification`, `peer`, `system` ou `human`.
        uses: les `(identifiant, outil)` lancés par ce tour.
        results: les identifiants d'outils dont le résultat revient ici.
        ends: pour une notification, l'identifiant de l'appel d'outil qu'elle termine — c'est
            lui qui l'apparie à son lancement, et non son ordre d'arrivée.
        source: le rang de son transcript, pour dater les relais.
    """

    when: datetime
    kind: str
    uses: list[tuple[str, str]] = field(default_factory=list[tuple[str, str]])
    results: list[str] = field(default_factory=list[str])
    ends: str = ""
    source: int = 0


@dataclass
class ToolCall:
    """Un appel d'outil dont le résultat est revenu."""

    name: str
    uid: str
    started: datetime
    duration: timedelta


@dataclass
class AgentRun:
    """Un sous-agent ou un workflow, de son lancement à sa notification de fin.

    Rien de plus : le nom et la consommation se lisent dans le transcript du sous-agent
    (`subagents`), la notification de son lancement ne portant que le contexte en fin de premier
    contact.
    """

    uid: str
    tool: str
    window: Interval


@dataclass
class Usage:
    """Jetons facturés par un ensemble d'appels d'API, un seul compte par message."""

    output: int = 0
    cache_read: int = 0
    cache_write: int = 0
    transcripts: int = 0

    def add(self, counts: Mapping[str, int]) -> None:
        """Ajoute l'`usage` d'un appel d'API."""
        self.output += counts.get("output_tokens") or 0
        self.cache_read += counts.get("cache_read_input_tokens") or 0
        self.cache_write += counts.get("cache_creation_input_tokens") or 0


# Ce qu'un appel d'API a eu en contexte : son entrée hors cache, et le cache qu'il a lu ou écrit.
CONTEXT_KEYS = ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")


def context_of(counts: Mapping[str, int]) -> int:
    """Le contexte d'un appel d'API, d'après son `usage` (`CONTEXT_KEYS`)."""
    return sum(counts.get(key) or 0 for key in CONTEXT_KEYS)


@dataclass
class Contact:
    """Un contact d'un sous-agent : son lancement, ou une reprise par le coordinateur.

    Attributes:
        window: du premier enregistrement du contact à son dernier appel d'API.
        calls: les appels d'API, un par message — un message diffusé sur plusieurs lignes
            compte une fois.
        context: le contexte du dernier appel — ce que la notification de fin rapporte, et
            **pas** une consommation.
        used: la consommation du contact, sommée sur ses appels — sa sortie n'est pas rendue,
            le transcript d'un sous-agent ne la portant pas de façon fiable (`consumed`).
    """

    window: Interval
    calls: int = 0
    context: int = 0
    used: Usage = field(default_factory=Usage)


@dataclass
class Subagent:
    """Un sous-agent tel que son transcript le raconte, contact par contact.

    Attributes:
        role: son `agentType` (`relecteur`, `verificateur`…).
        name: sa description, à défaut son nom, à défaut le nom de son transcript.
        launcher: l'identifiant de l'appel d'outil qui l'a lancé — vide pour un agent de
            workflow, que le harnais lance sans appel de la session.
        contacts: ses contacts, dans l'ordre.
    """

    role: str
    name: str
    launcher: str
    contacts: list[Contact]


def records(path: Path | str) -> Iterator[dict[str, Any]]:
    """Les enregistrements d'un transcript JSONL, lignes illisibles écartées."""
    with open(path, encoding="utf-8") as stream:
        for line in stream:
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def content_blocks(record: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Les blocs d'un message, qu'il porte une liste de blocs ou un texte nu."""
    content = cast(dict[str, Any], record.get("message") or {}).get("content", [])
    if isinstance(content, list):
        return cast(list[dict[str, Any]], content)
    return [{"type": "text", "text": content}]


def api_call(record: Mapping[str, Any]) -> tuple[str, Mapping[str, int]] | None:
    """L'identifiant de message et l'`usage` d'un appel d'API, ou `None`.

    Un message diffusé en plusieurs blocs occupe plusieurs lignes qui portent le même `id` et le
    même `usage` : c'est l'identifiant qui permet de n'en compter qu'une.
    """
    message = cast(dict[str, Any], record.get("message") or {})
    if record.get("type") == "assistant" and message.get("usage"):
        return message.get("id") or record.get("uuid", ""), message["usage"]
    return None


def api_calls(kept: Iterable[Mapping[str, Any]]) -> dict[str, Mapping[str, int]]:
    """L'`usage` de chaque appel d'API de ces enregistrements, par identifiant de message
    (`api_call`), dans l'ordre de première apparition — un message diffusé sur plusieurs lignes
    compte une fois."""
    return dict(call for record in kept if (call := api_call(record)))


def token_usage(paths: Sequence[Path]) -> Usage:
    """Somme l'`usage` de chaque message assistant de ces transcripts, une fois par message."""
    usage = Usage(transcripts=len(paths))
    for path in paths:
        for counts in api_calls(records(path)).values():
            usage.add(counts)
    return usage


def resumes(record: Mapping[str, Any]) -> bool:
    """Vrai si l'enregistrement est un message du coordinateur, qui reprend le sous-agent."""
    return record.get("type") == "user" and any(
        str(block.get("text", "")).startswith(COORDINATOR)
        for block in content_blocks(record)
        if block.get("type") == "text"
    )


def contacts(path: Path) -> list[Contact]:
    """Les contacts d'un transcript de sous-agent, et ce que chacun a consommé.

    Un contact s'ouvre au premier enregistrement, puis à chaque message du coordinateur — la
    seule forme qui reprenne un agent. Les relances du harnais (« [Your previous response had
    no visible output… », « [SYSTEM NOTIFICATION… », « [Request interrupted… ») restent dans
    le contact en cours. Population et dénombrement : la docstring de
    `test_un_sous_agent_se_mesure_contact_par_contact_dans_son_transcript`.
    """
    segments: list[list[dict[str, Any]]] = []
    for record in records(path):
        if record.get("timestamp"):
            if not segments or resumes(record):
                segments.append([])
            segments[-1].append(record)
    return [measure_contact(segment) for segment in segments]


def measure_contact(segment: Sequence[Mapping[str, Any]]) -> Contact:
    """La fenêtre, les appels, le contexte final et la consommation d'un contact non vide."""
    start = end = datetime.fromisoformat(segment[0]["timestamp"])
    calls: dict[str, Mapping[str, int]] = {}
    for record in segment:
        if call := api_call(record):
            calls[call[0]] = call[1]
            end = datetime.fromisoformat(record["timestamp"])
    contact = Contact((start, end), calls=len(calls))
    for counts in calls.values():
        contact.used.add(counts)
    if calls:
        contact.context = context_of(list(calls.values())[-1])
    return contact


def consumed(agents: Sequence[Subagent]) -> Usage:
    """Le cache que ces sous-agents ont lu et écrit, somme de leurs contacts.

    Pas leur sortie : dans un transcript de sous-agent, une partie des messages porte un
    `output_tokens` figé bien en dessous de ce qu'ils contiennent — population et mesure dans
    `test_la_sortie_d_un_sous_agent_ne_se_rend_pas`. Elle reste à zéro ici, et le rapport le dit.
    """
    usage = Usage(transcripts=len(agents))
    for agent in agents:
        for contact in agent.contacts:
            usage.cache_read += contact.used.cache_read
            usage.cache_write += contact.used.cache_write
    return usage


def subagents(paths: Sequence[Path]) -> list[Subagent]:
    """Les sous-agents de ces transcripts de session, lus dans leurs propres transcripts.

    Le harnais les range sous `<uuid de session>/subagents/` — ceux d'un workflow un cran plus
    bas —, chacun avec un `.meta.json`. Partir de là, et non des notifications de fin, voit
    l'agent lancé au premier plan, qui n'en émet aucune, et chaque reprise d'un agent repris.
    """
    found: list[Subagent] = []
    for path in paths:
        for transcript in sorted(path.with_suffix("").glob("subagents/**/agent-*.jsonl")):
            meta_path = transcript.with_name(transcript.stem + ".meta.json")
            meta: dict[str, Any] = (
                json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
            )
            found.append(
                Subagent(
                    role=str(meta.get("agentType", "")),
                    name=str(meta.get("description") or meta.get("name") or transcript.stem),
                    launcher=str(meta.get("toolUseId", "")),
                    contacts=contacts(transcript),
                )
            )
    return sorted(found, key=first_contact)


def first_contact(agent: Subagent) -> list[datetime]:
    """La clé de l'ordre du temps des sous-agents — pas celui des noms de fichier, qui sont des
    identifiants aléatoires. Un transcript sans enregistrement daté n'a pas de contact : il passe
    en tête."""
    return [contact.window[0] for contact in agent.contacts[:1]]


def delivered_notification(record: Mapping[str, Any]) -> str | None:
    """Le texte de la notification de fin que cet enregistrement **livre**, ou `None`.

    Deux formes, et elles seules : une pièce jointe dont le `commandMode` vaut
    `task-notification`, ou un message `user` dont le texte nu commence par la balise. Un
    message qui en cite une plus loin n'en livre pas.
    """
    if record.get("type") == "attachment":
        attachment = cast(dict[str, Any], record.get("attachment") or {})
        if attachment.get("commandMode") == NOTIFICATION_MODE:
            return str(attachment.get("prompt", ""))
        return None
    content = cast(dict[str, Any], record.get("message") or {}).get("content")
    if (
        record.get("type") == "user"
        and isinstance(content, str)
        and content.lstrip().startswith(NOTIFICATION_TAG)
    ):
        return content
    return None


def notification_event(when: datetime, text: str, source: int) -> Event | None:
    """L'événement d'une notification livrée, ou `None` si elle ne ferme rien.

    Seule une notification `completed` ferme une fenêtre : la même tâche peut notifier plusieurs
    fois, le harnais le dit lui-même dans sa note.
    """
    if STATUS_COMPLETED not in text:
        return None
    call = TOOL_USE_ID.search(text)
    return Event(when, "notification", ends=call.group("id") if call else "", source=source)


def read_events(paths: Sequence[Path | str]) -> list[Event]:
    """Lit tous les transcripts d'une session et rend leurs événements, ordonnés par le temps."""
    events: list[Event] = []
    for source, path in enumerate(paths):
        for record in records(path):
            if not record.get("timestamp") or record.get("isSidechain"):
                continue
            when = datetime.fromisoformat(record["timestamp"])
            delivered = delivered_notification(record)
            if delivered is not None:
                found = notification_event(when, delivered, source)
                if found:
                    events.append(found)
                continue
            if record.get("type") not in ("user", "assistant"):
                continue
            blocks = content_blocks(record)
            events.append(
                Event(
                    when,
                    kind_of(record, blocks),
                    [(b["id"], b["name"]) for b in blocks if b.get("type") == "tool_use"],
                    [b["tool_use_id"] for b in blocks if b.get("type") == "tool_result"],
                    source=source,
                )
            )
    events.sort(key=lambda event: event.when)
    return events


def kind_of(record: Mapping[str, Any], blocks: list[dict[str, Any]]) -> str:
    """La classe d'un enregistrement : celle de son texte, sauf qu'une injection du harnais
    n'est jamais du mainteneur.

    Le harnais marque `isMeta` ce qu'il injecte. Le texte seul classait `human` des corps de
    skills intégrés et des avis de reprise qu'aucun préfixe commun ne réunit ; l'étiquette les
    rend tous `system`. Elle laisse un pair en pair : l'avis de repos en porte une. Population
    et dénombrement : `ETIQUETTES` dans la suite.
    """
    found = classify(str(record["type"]), blocks)
    return "system" if found == "human" and record.get("isMeta") else found


def classify(role: str, blocks: list[dict[str, Any]]) -> str:
    """La classe d'un message d'après son seul texte : d'où il vient, et s'il rouvre le tour de
    l'agent. `kind_of` y ajoute l'étiquette `isMeta` du harnais.

    Un message de pair **commence** par « Another Claude session sent a message: » et porte la
    balise plus loin : le chercher en tête le classait humain. Un texte injecté par le harnais —
    chargement de skill, commande, notification — est dans le rôle `user` sans qu'un humain
    l'ait tapé. Une balise de contexte **suivie** d'un texte reste un message du mainteneur :
    c'est lui qui a tapé ce qui dépasse la balise.

    Un texte injecté se reconnaît à son **début**, donc avant toute recherche de balise de pair :
    le texte d'un skill peut citer `<cross-session-message>`, et cette citation classait son
    chargement `peer` (dénombrement : `FORMES_REELLES`). Une commande tapée par
    le mainteneur est faite de blocs de balises, mais c'est lui qui agit : `human`.
    """
    if role == "assistant":
        return "assistant"
    if any(block.get("type") == "tool_result" for block in blocks):
        return "tool_result"
    text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
    stripped = SYSTEM_REMINDER.sub("", text).strip()
    if not stripped or stripped.startswith(INJECTED):
        return "system"
    if stripped.startswith(PEER_NOTICE) or any(tag in stripped for tag in PEER_TAGS):
        return "peer"
    if INJECTED_BLOCKS.match(stripped) and not typed_command(stripped):
        return "system"
    return "human"


def typed_command(message: str) -> bool:
    """Si l'un des blocs de **premier niveau** du message nomme une commande tapée.

    Cité à l'intérieur d'un autre bloc — le résumé d'une notification, la sortie d'une
    commande —, `<command-name>/…` ne fait pas une commande du mainteneur.

    Args:
        message: un texte fait de blocs de balises, rappels système retirés.

    Returns:
        Vrai si un bloc `<command-name>` de premier niveau commence par la barre oblique.
    """
    name, prefix = TYPED_COMMAND
    position = 0
    while block := BLOCK.match(message, position):
        if block.group(1) == name and block.group(2).startswith(prefix):
            return True
        position = block.end()
    return False


def tool_calls(events: Sequence[Event]) -> list[ToolCall]:
    """Les appels d'outils dont le résultat est revenu, avec leur durée."""
    started: dict[str, tuple[str, datetime]] = {}
    for event in events:
        for uid, name in event.uses:
            started[uid] = (name, event.when)
    calls: list[ToolCall] = []
    for event in events:
        for uid in event.results:
            if uid in started:
                name, began = started[uid]
                calls.append(ToolCall(name, uid, began, event.when - began))
    return calls


def agent_runs(events: Sequence[Event], calls: Sequence[ToolCall]) -> list[AgentRun]:
    """Chaque sous-agent ou workflow lancé, apparié à sa notification de fin par son identifiant.

    L'appariement passe par le `<tool-use-id>` que porte la notification, jamais par l'ordre
    d'arrivée : entre le lancement d'un sous-agent et sa fin s'intercalent les notifications des
    commandes Bash de fond, et « la première non attribuée » raccourcit la fenêtre d'autant.
    """
    ended: dict[str, Event] = {}
    for event in events:
        if event.kind == "notification" and event.ends:
            # La **première** fin l'emporte : une compréhension de dictionnaire garderait la
            # dernière, et une tâche reprise puis arrêtée notifie plusieurs fois.
            ended.setdefault(event.ends, event)
    runs: list[AgentRun] = []
    for uid, (tool, started) in launched_subagents(events, calls):
        end = ended.get(uid)
        if end is None:
            continue
        runs.append(AgentRun(uid, tool, (started, end.when)))
    return runs


def launched_subagents(
    events: Sequence[Event], calls: Sequence[ToolCall]
) -> list[tuple[str, tuple[str, datetime]]]:
    """Tous les sous-agents et workflows **lancés**, par ordre de lancement.

    Distinct de `agent_runs`, qui ne garde que ceux dont la notification de fin est arrivée :
    un agent au premier plan n'en émet aucune, et un agent mort sans notifier serait écarté sans
    laisser de trace. Le rapport compte les lancements ici, et les rapproche des notifications
    et des transcripts pour que l'écart se voie.
    """
    launches = {
        uid: (name, event.when)
        for event in events
        for uid, name in event.uses
        if name in SUBAGENT_TOOLS
    }
    for call in calls:
        if call.name in SUBAGENT_TOOLS:
            launches.setdefault(call.uid, (call.name, call.started))
    return sorted(launches.items(), key=lambda item: item[1][1])


def waits(events: Sequence[Event], calls: Sequence[ToolCall]) -> list[Interval]:
    """Les attentes de l'agent et les questions formelles, fusionnées.

    Une attente court de la dernière activité de l'agent — sa sortie, ou le retour d'un outil
    qu'il a lancé (`AGENT_ACTIVITY`) — au **dernier** message qui rouvre son tour avant la
    sortie suivante — du mainteneur ou d'un pair (`TURN_OPENERS`). Le dernier, pas le premier :
    un message qui n'a rien déclenché n'a pas mis l'agent au travail. Ne compter que le
    mainteneur faisait passer en travail d'agent toute attente close par un pair — l'écart entre
    deux transcripts compris (`test_un_relais_ouvert_par_un_pair_le_lendemain_est_une_absence`).

    Brutes : le temps des sous-agents s'en retire dans `measure`, **après** leur classement —
    le retrait est essentiel : sans lui une session à relectures parallèles facture au
    mainteneur le temps de ses sous-agents.

    Les événements des transcripts positionnels sont fusionnés. Une session lue en parallèle
    fermerait donc les attentes de l'autre, d'où `--relecture`. Mesuré le 2026-10-21 sur le
    lot 4a : réactivité de la session PR seule 0 h 07, 0 h 02 quand sa relecture était fusionnée.
    """
    reopened: dict[datetime, datetime] = {}
    idle_since: datetime | None = None
    for event in events:
        if event.kind in AGENT_ACTIVITY:
            idle_since = event.when
        elif event.kind in TURN_OPENERS and idle_since is not None:
            reopened[idle_since] = event.when
    windows = list(reopened.items())
    windows += [
        (call.started, call.started + call.duration) for call in calls if call.name == QUESTION_TOOL
    ]
    return union(windows)


def split_waits(blocked: Sequence[Interval]) -> tuple[list[Interval], list[Interval]]:
    """Scinde les attentes en réactivité (moins d'une heure) et absences (une heure ou plus)."""
    reactivity = [window for window in blocked if window[1] - window[0] < ABSENCE]
    absences = [window for window in blocked if window[1] - window[0] >= ABSENCE]
    return reactivity, absences


def union(intervals: Sequence[Interval]) -> list[Interval]:
    """Fusionne les intervalles qui se chevauchent, pour qu'aucune minute ne compte deux fois."""
    merged: list[Interval] = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def without(intervals: Sequence[Interval], holes: Sequence[Interval]) -> list[Interval]:
    """Retire des intervalles tout ce que couvrent les `holes`, en gardant les morceaux restants."""
    kept: list[Interval] = []
    for start, end in intervals:
        pieces = [(start, end)]
        for hole_start, hole_end in holes:
            remaining: list[Interval] = []
            for piece_start, piece_end in pieces:
                if hole_end <= piece_start or hole_start >= piece_end:
                    remaining.append((piece_start, piece_end))
                    continue
                if piece_start < hole_start:
                    remaining.append((piece_start, hole_start))
                if hole_end < piece_end:
                    remaining.append((hole_end, piece_end))
            pieces = remaining
        kept += pieces
    return kept


def total(intervals: Sequence[Interval]) -> timedelta:
    """La somme des durées d'intervalles déjà fusionnés."""
    return sum((end - start for start, end in intervals), timedelta())


def hm(duration: timedelta) -> str:
    """Une durée en heures et minutes, arrondie à la minute inférieure."""
    minutes = int(duration.total_seconds() // 60)
    return f"{minutes // 60} h {minutes % 60:02d}"


def local(moment: datetime) -> str:
    """Un horodatage dans le fuseau du lecteur."""
    return f"{moment.astimezone():%H:%M}"


def thousands(count: int) -> str:
    """Un nombre de jetons, groupé par milliers avec une espace."""
    return f"{count:,}".replace(",", " ")


def cached(usage: Usage) -> str:
    """Le cache lu et écrit d'un ensemble de transcripts, en millions."""
    return f"cache lu {usage.cache_read / 1e6:5.1f} M · écrit {usage.cache_write / 1e6:4.1f} M"


def tokens(usage: Usage) -> str:
    """La ligne de jetons de la session : sa sortie, puis son cache."""
    return f"sortie {usage.output / 1e3:6.0f} k · {cached(usage)}"


def relays(events: Sequence[Event]) -> list[datetime]:
    """Le premier instant de chaque transcript après le premier : les heures de relais."""
    first: dict[int, datetime] = {}
    for event in events:
        first.setdefault(event.source, event.when)
    # Dans l'ordre du **temps**, pas dans celui des arguments : le skill autorise à donner
    # les transcripts dans n'importe quel ordre, et classer par index d'argument annonçait
    # alors le début de la session comme heure de relais. Mesuré le 2026-10-09.
    return sorted(first.values())[1:]


@dataclass(frozen=True)
class Measures:
    """Ce qu'une session a coûté — mesuré une fois, indépendamment de la mise en page.

    Séparer les deux rend les chiffres assertables sans passer par des chaînes de rapport, et
    c'est le seul moyen de relire la mise en page sans relire les mesures.
    """

    start: datetime
    end: datetime
    span: timedelta
    sessions: int
    relayed: list[datetime]
    blocked: list[Interval]
    reactivity: list[Interval]
    absences: list[Interval]
    windows: list[Interval]
    alone: timedelta
    launched: list[str]
    dangling: int
    calls: list[ToolCall]
    kinds: Counter[str]
    questions: int

    @property
    def workflows(self) -> int:
        """Combien de lancements sont des `Workflow` — notifiés ou non."""
        return self.launched.count(WORKFLOW_TOOL)

    @property
    def active(self) -> timedelta:
        """La durée de la session **hors absences** — le seul denominateur actionnable.

        Rapporter la réactivité à la session entière la dilue d'autant que la session a dormi —
        mainteneur absent, pair attendu, écart entre deux transcripts —, et le chiffre flatte
        alors la pipeline sans que rien n'ait été amélioré — le sens d'erreur même du temps des
        sous-agents facturé au mainteneur. Hors absences, la même attente pèse ce que la pipeline
        peut réellement réduire. Les absences, elles, se rapportent à la session : c'est leur
        poids réel.

        Les deux dénominateurs sont épinglés, sur un montage dont les durées sont celles du
        transcript synthétique, par
        `test_la_reactivite_se_rapporte_au_temps_actif_et_les_absences_a_la_session` — seul
        endroit où ces pourcentages vivent. Aucun n'est recopié ici : un chiffre pris sur une
        session réelle n'est pas reproductible, son transcript pouvant avoir disparu,
        et l'arrondi d'affichage des durées ne redonne **pas toujours** le pourcentage que le
        rapport imprime, qui se calcule sur les secondes — il le redonne sur le montage ci-dessus
        (15 min sur 0 h 45 affichés, 33 % imprimés), et pas sur une session dont les durées
        tombent entre deux minutes.
        """
        return self.span - total(self.absences)


def measure(events: Sequence[Event], agents: Sequence[Subagent] = ()) -> Measures:
    """Mesure une session à partir de ses événements, sans rien mettre en forme.

    `agents` sont les sous-agents de la session et de ses relais, seuls : ceux d'une autre
    session retireraient leur temps de ses attentes.
    """
    if not events:
        raise ValueError("aucun événement à mesurer — transcripts vides ou illisibles")
    calls = tool_calls(events)
    runs = agent_runs(events, calls)
    # Les fenêtres se déduisent des `runs` déjà calculés, une seule fois : les recalculer à
    # chaque usage coûtait un parcours complet de la liste d'événements par usage — sensible
    # sur un transcript de plusieurs dizaines de méga-octets. S'y ajoutent les contacts lus dans
    # les transcripts des sous-agents : une notification ne borne que le premier contact d'un
    # agent de fond, et un agent au premier plan n'en a pas.
    windows = union(
        [run.window for run in runs] + [c.window for agent in agents for c in agent.contacts]
    )
    seen = {run.uid for run in runs} | {agent.launcher for agent in agents}
    launched = launched_subagents(events, calls)
    # Une attente se classe sur sa durée **brute**, puis perd le temps des sous-agents : retiré
    # d'abord, un sous-agent au milieu d'une absence la coupait en morceaux de moins d'une heure,
    # reclassés en réactivité (`test_une_absence_reste_une_absence_quand_un_sous_agent_y_travaille`).
    raw_reactivity, raw_absences = split_waits(waits(events, calls))
    reactivity, absences = without(raw_reactivity, windows), without(raw_absences, windows)
    blocked = union(reactivity + absences)
    start, end = events[0].when, events[-1].when
    span = end - start
    return Measures(
        start=start,
        end=end,
        span=span,
        sessions=max((event.source for event in events), default=0) + 1,
        relayed=relays(events),
        blocked=blocked,
        reactivity=reactivity,
        absences=absences,
        windows=windows,
        alone=span - total(union(list(blocked) + list(windows))),
        launched=[tool for _, (tool, _) in launched],
        dangling=sum(1 for uid, _ in launched if uid not in seen),
        calls=calls,
        kinds=Counter(event.kind for event in events),
        questions=sum(1 for call in calls if call.name == QUESTION_TOOL),
    )


def chars(block: Mapping[str, Any], *keys: str) -> int:
    """La longueur cumulée de ces champs d'un bloc de contenu, un champ absent comptant vide."""
    return sum(len(str(block.get(key) or "")) for key in keys)


@dataclass
class Composition:
    """Ce que pèsent, en caractères, les blocs de contenu des messages d'une session.

    Attributes:
        thinking: la réflexion — les champs `THINKING_FIELDS` de ses blocs.
        tool_input: les arguments d'outils, sérialisés en JSON sans échappement ASCII.
        editing: la part de `tool_input` qui revient aux outils d'édition (`EDIT_TOOLS`).
        skills: les corps de skills chargés — un bloc `text` du rôle `user` qui commence par
            `SKILL_BODY`.
        text: tous les autres blocs `text`, `user` comme `assistant`.
        results: le texte des retours d'outils (`result_text`), par outil — « ? » pour un retour
            dont le transcript ne porte pas l'appel.
    """

    thinking: int = 0
    tool_input: int = 0
    editing: int = 0
    skills: int = 0
    text: int = 0
    results: Counter[str] = field(default_factory=Counter[str])

    @classmethod
    def of(cls, kept: Sequence[Mapping[str, Any]], tools: Mapping[str, str]) -> "Composition":
        """La composition de ces messages : chaque bloc de chaque ligne une fois — un message
        diffusé sur plusieurs lignes y porte des blocs différents (relevé : la docstring de
        `test_la_composition_compte_chaque_bloc_dans_sa_categorie`).

        Args:
            kept: les messages de la session (`session_records`).
            tools: le nom de l'outil de chaque appel d'outil (`tool_names`).
        """
        found = cls()
        for record in kept:
            for block in content_blocks(record):
                found.add(str(record.get("type")), block, tools)
        return found

    def add(self, role: str, block: Mapping[str, Any], tools: Mapping[str, str]) -> None:
        """Ajoute un bloc de contenu d'un message `user` ou `assistant`.

        Args:
            role: le rôle du message qui porte le bloc.
            block: le bloc ; une autre nature que les cinq comptées (image…) ne compte pas.
            tools: le nom de l'outil de chaque appel d'outil (`tool_names`).
        """
        kind = str(block.get("type"))
        if kind in THINKING_FIELDS:
            self.thinking += chars(block, *THINKING_FIELDS[kind])
        elif kind == "tool_use":
            size = len(json.dumps(block.get("input", {}), ensure_ascii=False))
            self.tool_input += size
            if block.get("name") in EDIT_TOOLS:
                self.editing += size
        elif kind == "tool_result":
            self.results[tools.get(str(block.get("tool_use_id")), "?")] += len(result_text(block))
        elif kind == "text":
            size = chars(block, "text")
            if role == "user" and str(block.get("text")).startswith(SKILL_BODY):
                self.skills += size
            else:
                self.text += size


class Gate(NamedTuple):
    """La première porte de relecture d'une session : le rang, à partir de 1, de l'appel d'API
    qui porte son `tool_use`, et son libellé — l'outil et la valeur qui ont mordu."""

    call: int
    label: str


@dataclass(frozen=True)
class Profile:
    """Le profil de contexte d'un transcript de session — mesuré, sans mise en page.

    Attributes:
        name: le nom du transcript, sans suffixe.
        reads: le cache lu par chaque appel d'API, dans l'ordre de première apparition de son
            message — un message diffusé sur plusieurs lignes compte une fois.
        context: le contexte du premier appel (`CONTEXT_KEYS`), 0 sans appel.
        gate: sa première porte de relecture (`REVIEW_GATES`), `None` sans porte.
        composition: ce que pèsent ses blocs de contenu, en caractères.
    """

    name: str
    reads: list[int]
    context: int
    gate: Gate | None
    composition: Composition

    @property
    def calls(self) -> int:
        """Le nombre d'appels d'API de la session."""
        return len(self.reads)

    @property
    def quarters(self) -> list[float]:
        """Le cache lu moyen de chaque quart des appels, `[n*k//4 : n*(k+1)//4]` pour k = 0..3.

        Vide sous quatre appels : un quart y serait vide, et sa moyenne n'existe pas.
        """
        n = len(self.reads)
        if n < 4:
            return []
        return [fmean(self.reads[n * k // 4 : n * (k + 1) // 4]) for k in range(4)]

    @property
    def after_gate(self) -> float | None:
        """La part du cache lu par les appels **strictement après** celui de la porte — `None`
        sans porte, ou sans cache lu à rapporter."""
        read = sum(self.reads)
        if self.gate is None or not read:
            return None
        return sum(self.reads[self.gate.call :]) / read


def session_records(path: Path) -> list[dict[str, Any]]:
    """Les messages `user` et `assistant` d'un transcript de session, sous-agents écartés.

    Un enregistrement `isSidechain` est un message de sous-agent resté dans le transcript de
    session : il est écarté comme dans `read_events`.
    """
    return [
        record
        for record in records(path)
        if record.get("type") in ("user", "assistant") and not record.get("isSidechain")
    ]


def tool_names(kept: Sequence[Mapping[str, Any]]) -> dict[str, str]:
    """Le nom de l'outil de chaque `tool_use` de ces messages, par identifiant d'appel."""
    return {
        str(block.get("id")): str(block.get("name"))
        for record in kept
        for block in content_blocks(record)
        if block.get("type") == "tool_use"
    }


def result_text(block: Mapping[str, Any]) -> str:
    """Le texte d'un `tool_result` : son contenu s'il est une chaîne, le `text` de ses blocs
    joints sinon — une image ou une référence d'outil n'en porte pas."""
    content = block.get("content")
    if isinstance(content, str):
        return content
    return "".join(str(part.get("text") or "") for part in cast(list[Any], content or []))


def gate_label(block: Mapping[str, Any], started: set[str]) -> str | None:
    """Le libellé de la porte de relecture qu'ouvre ce `tool_use`, ou `None`.

    Args:
        block: un bloc `tool_use` — son `input`, écrit par le modèle, peut être mal formé : un
            destinataire qui n'est pas une chaîne ne mord pas.
        started: les adresses — identifiant, et nom s'il en a un — des sessions que le
            transcript a démarrées jusqu'ici (`SESSION_ADDRESS`).

    Returns:
        « outil valeur » pour la première forme de `REVIEW_GATES` satisfaite.
    """
    given = cast(dict[str, Any], block.get("input") or {})
    for tool, key, value in REVIEW_GATES:
        found = given.get(key)
        to_started = (
            value == STARTED_SESSION
            and isinstance(found, str)
            and REF_SUFFIX.sub("", found) in started
        )
        if block.get("name") == tool and (found == value or to_started):
            return f"{tool} {value}"
    return None


def review_gate(
    kept: Sequence[Mapping[str, Any]], ranks: Mapping[str, int], tools: Mapping[str, str]
) -> Gate | None:
    """La première porte de relecture d'un transcript, dans son ordre, ou `None`.

    Une session ne compte pour la forme `STARTED_SESSION` qu'à partir du retour de son
    démarrage : un message qui la précède dans le transcript ne mord pas.

    Args:
        kept: les messages de la session (`session_records`), dans l'ordre du transcript.
        ranks: le rang de chaque appel d'API, par identifiant de message.
        tools: le nom de l'outil de chaque appel d'outil (`tool_names`).
    """
    started: set[str] = set()
    for record in kept:
        call = api_call(record)
        for block in content_blocks(record):
            if call and block.get("type") == "tool_use" and (label := gate_label(block, started)):
                return Gate(ranks[call[0]], label)
            # Seul un `tool_result` porte un `tool_use_id`.
            if tools.get(str(block.get("tool_use_id"))) == START_SESSION_TOOL:
                for found in list(SESSION_ADDRESS.finditer(result_text(block)))[-1:]:
                    started.update(address for address in found.groups() if address)
    return None


def context_profile(path: Path) -> Profile:
    """Le profil de contexte d'un transcript de session.

    Args:
        path: le transcript JSONL d'une session — pas d'un sous-agent.

    Returns:
        Ses appels d'API, le cache que chacun a lu, le contexte du premier, sa première
        porte de relecture et la composition de ses messages.
    """
    kept = session_records(path)
    calls = api_calls(kept)
    usages = list(calls.values())
    ranks = {key: rank for rank, key in enumerate(calls, start=1)}
    tools = tool_names(kept)
    return Profile(
        name=path.stem,
        reads=[usage.get("cache_read_input_tokens") or 0 for usage in usages],
        context=context_of(usages[0]) if usages else 0,
        gate=review_gate(kept, ranks, tools),
        composition=Composition.of(kept, tools),
    )


def contact_line(contact: Contact) -> str:
    """Une ligne de contact : sa fenêtre, ses appels, son contexte final et le cache consommé —
    pas la sortie, que le transcript d'un sous-agent ne porte pas de façon fiable (`consumed`)."""
    start, end = contact.window
    return (
        f"    {local(start)} → {local(end)}   {hm(end - start):>7}   {contact.calls:>4} appels   "
        f"contexte final {thousands(contact.context):>9}   "
        f"cache lu {thousands(contact.used.cache_read):>11}"
        f" · écrit {thousands(contact.used.cache_write):>9}"
    )


def agent_lines(agent: Subagent) -> list[str]:
    """Le titre d'un sous-agent, puis une ligne par contact."""
    count = len(agent.contacts)
    title = f"  {agent.role} « {agent.name} » — {count} contact{'s' if count > 1 else ''}"
    return [title, *(contact_line(contact) for contact in agent.contacts)]


def kilo(count: float) -> str:
    """Une grandeur en milliers arrondis — l'unité est à l'appelant."""
    return f"{count / 1e3:.0f}"


def percent(share: float) -> str:
    """Une part en pourcentage entier, l'espace avant le signe."""
    return f"{share:.0%}".replace("%", " %")


def composition_line(weights: Composition) -> str:
    """La ligne de composition, en milliers de caractères : les retours d'outils et la part des
    trois outils les plus lourds — aucune quand ces retours sont vides —, puis la réflexion, les
    arguments d'outils et leur part d'édition, les skills chargés et le texte."""
    results = weights.results.total()
    heaviest = ", ".join(
        f"{tool} {percent(size / results)}"
        for tool, size in (weights.results.most_common(3) if results else [])
    )
    return (
        f"  composition (caractères) : résultats d'outils {kilo(results)} K"
        + (f" ({heaviest})" if heaviest else "")
        + f" · réflexion {kilo(weights.thinking)} K"
        f" · arguments d'outils {kilo(weights.tool_input)} K dont édition {kilo(weights.editing)} K"
        f" · skills chargés {kilo(weights.skills)} K · texte {kilo(weights.text)} K"
    )


def profile_lines(profile: Profile) -> list[str]:
    """La section d'un profil de contexte : son titre, ses appels, sa première porte et sa
    composition — un tiret pour les quarts d'une session de moins de quatre appels."""
    quarters = " → ".join(kilo(quarter) for quarter in profile.quarters)
    gate, after = profile.gate, profile.after_gate
    where = f"appel {gate.call} ({gate.label})" if gate else "aucune"
    return [
        f"profil de contexte — {profile.name[:8]}",
        (
            f"  appels {profile.calls} · contexte au 1er appel {thousands(profile.context)}"
            f" · cache lu moyen par quart {quarters + ' K' if quarters else '—'}"
        ),
        f"  première porte de relecture : {where}"
        + (f" · cache lu après elle {percent(after)}" if after is not None else ""),
        composition_line(profile.composition),
    ]


def report(
    events: Sequence[Event],
    session: Usage,
    agents: Sequence[Subagent],
    profiles: Sequence[Profile] = (),
    review: Usage | None = None,
    review_agents: Sequence[Subagent] = (),
) -> str:
    """Le bilan, prêt à être recopié dans une rétrospective.

    `session` et `review` sont les jetons de la session — relais compris — et ceux de sa session
    de relecture, chacun sur sa ligne ; sans `review`, aucune ligne de relecture. De même pour
    les sous-agents, `agents` et `review_agents` : tous se rendent un à un et dans les jetons des
    sous-agents, qui disent la part de la relecture ; seuls les premiers entrent dans la mesure
    de la session (`measure`).

    L'ordre des lignes est celui de leur lecture : l'attente **hors absences** d'abord, parce
    que c'est la seule que la pipeline peut réduire ; l'agrégat brut ensuite, pour mémoire.

    Deux dénominateurs, et chaque ligne dit le sien. Ce que la pipeline peut réduire se rapporte
    au temps **actif** (session moins absences) ; les absences et l'attente totale se rapportent
    à la session. Tout rapporter à la session diluait la réactivité d'autant que la session avait
    dormi, d'un facteur qui croît avec l'absence — et un pourcentage dont le dénominateur ne se
    lit pas est le défaut, pas le chiffre. Les deux parts sont épinglées par
    `test_la_reactivite_se_rapporte_au_temps_actif_et_les_absences_a_la_session`.

    Chaque sous-agent se rend **contact par contact**, consommation comprise : c'est la seule
    grandeur que deux lots peuvent comparer, un total dépendant de la taille du delta relu.

    Puis une section par profil de contexte (`profile_lines`) : le cache que la session a lu,
    quart par quart de ses appels, la place de sa première relecture dans cette courbe, et ce
    que pèsent ses blocs de contenu.
    """
    m = measure(events, agents)
    humans = m.kinds["human"]
    listed = sorted([*agents, *review_agents], key=first_contact)
    used = consumed(listed)
    review_share = (
        f", dont {len(review_agents)} de la session de relecture" if review_agents else ""
    )
    relayed = ", ".join(f"relais à {local(moment)}" for moment in m.relayed)

    def row(label: str, duration: timedelta, basis: timedelta, note: str = "") -> str:
        """Une ligne « libellé · durée · part de son dénominateur »."""
        share = f"{duration / basis:4.0%}" if basis else "   —"
        return f"{label:<28} {hm(duration):>9}   {share}{'   ' + note if note else ''}"

    def typical(windows: Sequence[Interval]) -> str:
        # En microsecondes entières : `median` n'est typé que pour les nombres, et le constructeur
        # de `timedelta` arrondit la demi-microseconde au pair, comme sa division par deux.
        if not windows:
            return "—"
        micros = [(end - start) // timedelta.resolution for start, end in windows]
        return hm(timedelta(microseconds=median(micros)))

    lines = [
        (
            f"session          {local(m.start)} → {local(m.end)}   {hm(m.span)}   "
            f"(sessions : {m.sessions}{', ' + relayed if relayed else ''})"
        ),
        f"actif (hors absences)        {hm(m.active):>9}   — dénominateur des trois lignes qui suivent",
        row(
            "réactivité (< 1 h)",
            total(m.reactivity),
            m.active,
            f"({len(m.reactivity)} attentes, médiane {typical(m.reactivity)})",
        ),
        row(
            "sous-agents en cours",
            total(m.windows),
            m.active,
            f"({len(m.launched)} lancés, dont {m.workflows} workflows)",
        ),
        row("agent seul", m.alone, m.active),
        row(
            "absences (≥ 1 h)", total(m.absences), m.span, f"({len(m.absences)} — détail plus bas)"
        ),
        row("attente totale", total(m.blocked), m.span),
        *(
            [f"sous-agents sans notification de fin ni transcript rattaché : {m.dangling}"]
            if m.dangling
            else []
        ),
        f"jetons de la session         {tokens(session)}",
        *([f"jetons de la session de relecture {tokens(review)}"] if review is not None else []),
        (
            f"jetons des sous-agents       {cached(used)} · sortie non mesurée"
            f"   ({used.transcripts} transcripts{review_share})"
        ),
        (
            f"points de contact humains    {humans + m.questions:>9}   "
            f"(messages {humans}, questions formelles {m.questions}, "
            f"pairs {m.kinds['peer']}, injectés {m.kinds['system']})"
        ),
        *(
            ["par agent — consommation lue dans ses transcripts, contact par contact :"]
            if listed
            else []
        ),
        *(line for agent in listed for line in agent_lines(agent)),
        *(["absences, une à une :"] if m.absences else []),
        *(f"  {local(start)} → {local(end)}   {hm(end - start)}" for start, end in m.absences),
        "appels d'outils : "
        + ", ".join(
            f"{name} {count}" for name, count in Counter(c.name for c in m.calls).most_common(8)
        ),
        *(line for profile in profiles for line in profile_lines(profile)),
    ]
    return "\n".join(lines)


def say(text: str) -> None:
    """Écrit une ligne sur la sortie standard en octets UTF-8, quelle que soit la console.

    La console du poste est en cp1252, et le rapport porte des `→` et des `≥` : imprimé tel quel,
    il lèverait `UnicodeEncodeError`. Les octets vont au tampon **sans** envelopper `sys.stdout` :
    un `TextIOWrapper` collecté ferme le flux qu'il enveloppe, et un appelant en processus — la
    suite de tests — perd sa sortie derrière. Même forme que `dire` de `mutation.py`.
    """
    sys.stdout.flush()
    sys.stdout.buffer.write(f"{text}\n".encode())
    sys.stdout.buffer.flush()


def arguments(argv: Sequence[str]) -> tuple[list[Path], list[Path]]:
    """Les transcripts demandés : la session et ses relais, puis sa session de relecture et ses
    relais (`--relecture`, une option par transcript). Les positionnels peuvent suivre une
    option : `parse_intermixed_args` les garde positionnels, là où `parse_args` refuse ceux qui
    suivent `--relecture`. Sans transcript positionnel, `argparse` rend l'usage et sort en 2."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "transcripts",
        nargs="+",
        type=Path,
        metavar="transcript.jsonl",
        help="la session et ses relais",
    )
    parser.add_argument(
        "--relecture",
        action="append",
        type=Path,
        default=[],
        metavar="transcript.jsonl",
        help="la session de relecture, puis chacun de ses relais : une option par transcript",
    )
    given = parser.parse_intermixed_args(argv)
    return given.transcripts, given.relecture


def main(argv: Sequence[str]) -> int:
    """Point d'entrée : la session et ses relais en positionnels, chacun lu avec les sous-agents
    rangés sous son dossier (`subagents`) et rendu avec son profil de contexte. La session de
    relecture passe par `--relecture` : fusionnée aux positionnels, elle en fermerait les
    attentes (`waits`), et ses sous-agents en retireraient leur temps (`measure`).

    Un transcript absent, positionnel ou de relecture, se **dit**, il ne fait ni planter le
    script ni rendre en silence un bilan sur la moitié du cycle : le harnais a le droit de
    supprimer un transcript entre deux sessions, et le relevé que la session sortante a
    déposé s'additionne alors à la main.
    """
    asked_session, asked_review = arguments(argv)
    session = [path for path in asked_session if path.is_file()]
    review = [path for path in asked_review if path.is_file()]
    asked = [*asked_session, *asked_review]
    absent = ", ".join(str(path) for path in asked if not path.is_file())
    if absent:
        partial = " (bilan partiel : additionner le relevé déposé par chaque session absente)"
        say(
            f"transcripts demandés {len(asked)}, lus {len(session) + len(review)}"
            f" — absents : {absent}" + (partial if session else "")
        )
    events = read_events(session)
    if not events:
        say("transcripts vides ou illisibles")
        return 1
    profiles = [context_profile(path) for path in session + review]
    reviewed = token_usage(review) if review else None
    ours, theirs = subagents(session), subagents(review)
    say(report(events, token_usage(session), ours, profiles, reviewed, theirs))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
