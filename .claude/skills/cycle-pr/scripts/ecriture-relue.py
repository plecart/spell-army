"""Écriture distante relue : écrit sur la forge, puis relit en entier ce qu'il y a écrit.

Usage :
    python ecriture-relue.py label <N> [--add <label> …] [--remove <label> …]
    python ecriture-relue.py label create --mapping <fichier>
    python ecriture-relue.py depot create <propriétaire>/<nom> (--private | --public)
    python ecriture-relue.py checkbox patch <N> (--case <ancre> … | --paires <fichier>)
    python ecriture-relue.py checkbox next <N>
    python ecriture-relue.py brief patch <N> (--case <ancre> … | --paires <fichier>)
    python ecriture-relue.py brief write <N> --body-file <fichier>
    python ecriture-relue.py issue edit <N> (--append | --body-file) <fichier>
    python ecriture-relue.py issue create --title <titre> --body-file <fichier> [--label <label> …]
    python ecriture-relue.py issue close <N> [--reason completed|not_planned]
    python ecriture-relue.py milestone attach <N> --title <titre> [--description <texte>]
    python ecriture-relue.py milestone close --title <titre>
    python ecriture-relue.py comment <N> --body-file <fichier>

La règle « Écritures sur un artefact distant » de `contraintes.md` veut que toute écriture sur la
forge se relise ; ce script tient cette relecture pour les gestes de `cycle-pr` Étape 8, le
commentaire de répercussion de son Étape 6, la création d'une issue, la transition de ses labels,
sa fermeture et son thème, le plan de QA d'`execution-qa`, et les gestes de dépôt d'`init-projet`
— les labels du dépôt, le dépôt lui-même.
Chaque sous-commande lit par `gh api` — octets décodés en UTF-8, jamais le mode texte, qui traduit
les fins de ligne, ni la page de code de la console —, écrit, puis relit
par le même canal ; `checkbox next` lit seulement ; `depot create` écrit par `gh repo create`, et
lit aussi le dépôt git courant par `git`. Un texte s'écrit par
`gh api -X PATCH <chemin> --input -` — `-X POST` pour publier un commentaire, créer une issue ou un
milestone —, la charge JSON sur l'entrée standard, et sa relecture compare le **texte entier** à
l'attendu : une forme réduite, longueur ou ancre, ne voit pas une conversion qui la préserve.
`{owner}/{repo}` sont remplis par `gh` depuis le dépôt courant.

- `label` pose les labels `--add` sur l'issue ou la PR `<N>`, puis lui retire les labels
  `--remove`, et relit ses labels. Chaque option se répète, l'une au moins est requise, et aucun
  label ne se nomme deux fois, casse ignorée. La pose précède le retrait : une transition d'état,
  `--remove needs-triage --add needs-interrogation`, ne laisse jamais l'issue sans label d'état,
  et une transition tombée entre les deux laisse les deux labels, que le rejeu achève. Un label
  à poser doit exister dans le dépôt, comme pour `issue create` ;
- `label create` crée les labels du fichier `--mapping` absents du dépôt, puis relit les labels du
  dépôt, lus sur toutes leurs pages. Le fichier, UTF-8 lu en octets, est une liste JSON non vide
  d'objets `{"nom": …, "couleur": …, "description": …}`, ces trois champs seuls, textuels : un nom
  non vide sur une ligne, six chiffres hexadécimaux sans `#`, une description de 100 caractères au
  plus (« Create a label »), aucun nom deux fois, casse ignorée. Un nom se compare sans la casse —
  la forge rend `bug` sous `labels/BUG` —, une couleur aussi. Un label présent n'est jamais
  modifié : sous une autre couleur, la sortie le dit (« présent, couleur <x> au lieu de <y>, non
  modifié »), sans échec. La relecture veut chaque label du fichier dans le dépôt, et chaque label
  créé sous sa couleur et sa description ;
- `depot create` crée le dépôt `<propriétaire>/<nom>` — `--private` ou `--public`, l'un des deux
  requis — et son remote `origin`, par `gh repo create <dépôt> --private|--public --source=.
  --remote=origin`, depuis l'arbre de travail d'un dépôt git sans `origin`. La relecture lit le
  dépôt par l'API REST (« Get a repository ») — son nom, sans la casse : la forge rend le nom
  canonique ; sa visibilité —, puis `git remote get-url origin`, qui doit rendre l'URL HTTPS ou SSH
  du dépôt : celle que `gh` donne au remote selon son `git_protocol` (`FormatRemoteURL`) ;
- `checkbox patch` coche des cases du corps de `<N>`, `brief patch` celles de son commentaire de
  brief — le seul qui s'ouvre par `## Brief d'agent` (`triage/brief-agent.md`). Une ancre est un
  extrait du texte qui suit le marqueur d'une seule ligne de case, `- [ ] …` ou `- [x] …` (`[X]`
  compris), indentation permise ; cocher ne change pas ce texte, et le rejeu rend le verdict du
  premier appel ;
- `checkbox patch --paires` et `brief patch --paires` remplacent des lignes entières du même
  texte — la paire `(ancienne_ligne, nouvelle_ligne)` de `patch-checkbox-gh.md` (`execution-qa`)
  —, lues dans un fichier UTF-8, lu en octets : une ligne `< <ancienne>` suivie d'une ligne
  `> <nouvelle>` par paire, sans échappement, les lignes vides ou de blancs ignorées ; `--case` et
  `--paires` s'excluent, et l'un des deux est requis. Une ligne du texte se compare sans son
  retour chariot final, gardé à l'écriture. Une ligne, une paire : une ancienne ou une nouvelle
  nommée deux fois, ou la nouvelle d'une paire ancienne d'une autre, est refusée — les paires
  chaînées casseraient le rejeu. Une paire dont l'ancienne ligne manque et dont la nouvelle est
  seule dans le texte est déjà appliquée. Borne : une paire dont la nouvelle ligne est déjà
  ailleurs dans le texte s'applique, mais son rejeu y trouve la nouvelle en double et refuse
  (`ligne en double (<n>)`) au lieu de la dire déjà appliquée ;
- `checkbox next` lit la prochaine case en attente du corps de `<N>`, un plan de QA, sans rien
  écrire — la seule lecture de la famille, où se range la prochaine case
  d'`execution-qa` avec le patch de ses cases ; les douze autres sous-commandes écrivent chacune au
  premier appel, onze dénombrées par `REJEUX` (`test_ecriture_relue.py`) — `depot create` en est
  hors : son rejeu trouve `origin` et refuse. Une case est une ligne de
  case GFM, `PLAN_QA_CASE` de `test_agent_skills.py` ; elle attend quand un blanc la laisse non
  cochée et que sa ligne ne porte ni `🔴`, ni ` — BLOQUÉ`, ni ` — accepté`
  (`execution-qa/SKILL.md` §3, §4, §6 et « Passe finale »). La sortie est le dernier titre
  au-dessus d'elle, sans ses `#`, ou `(sans titre)`, puis sa ligne ; sans case en attente, elle le
  dit ;
- `brief write` publie un fichier UTF-8, lu en octets, en commentaire de brief de `<N>`, ou édite
  en place le seul qui existe — jamais un second brief concurrent. Un fichier qui ne s'ouvre pas
  par `## Brief d'agent`, dès son premier caractère, est refusé avant tout appel : `brief patch`
  ne le reconnaîtrait plus ;
- `issue edit --append` ajoute un fichier UTF-8, lu en octets, en fin de corps de `<N>`, séparé
  de son dernier contenu par une ligne vide au moins — celles qui terminent déjà le corps
  restent —, aucune sur un corps vide. Le corps d'une PR passe par le même chemin : pour l'API
  REST, une PR est une issue ;
- `issue edit --body-file` substitue un fichier UTF-8, lu en octets, au corps entier de `<N>` ;
  `--append` et `--body-file` s'excluent, et l'un des deux est requis ;
- `issue create` crée une issue de titre `--title` et de corps le fichier `--body-file`, UTF-8 lu
  en octets, avec ses labels `--label` dans la **même** requête : une issue n'existe jamais sans
  ses labels, même un instant. Chaque label doit exister dans le dépôt — apparié sans la casse,
  il part sous le nom que le dépôt lui donne, une seule fois —, lu sur toutes ses pages. La
  relecture compare le corps entier, le titre exact et l'ensemble des labels — sans droit
  d'écriture sur le dépôt, l'API REST ignore en silence les labels d'une création (« Create an
  issue ») —, et un label manquant nomme l'appel de `label` qui le pose, un label en plus est
  nommé sans réparation ; la ligne de sortie porte le numéro de l'issue, créée ou déjà là ;
- `issue close` ferme l'issue `<N>` avec la raison `--reason` — `completed` par défaut,
  `not_planned` pour une issue écartée —, puis relit son état et sa raison ;
- `milestone attach` rattache l'issue `<N>` au milestone de titre `--title` à l'identique, lu sur
  toutes les pages des milestones ouverts et fermés ; absent, il le crée ouvert, décrit par
  `--description`, et relit son titre, sa description et son état. Un rattachement à un autre
  milestone est remplacé, et la sortie le nomme — la fusion de thèmes de
  `triage/themes-milestones.md`. Le milestone de l'issue se relit : sans droit d'écriture,
  l'API REST ignore en silence un changement de milestone (« Update an issue ») ;
- `milestone close` ferme le milestone de titre `--title`, vidé — sans issue ouverte —, puis relit
  son état ;
- `comment` publie un fichier UTF-8, lu en octets, en commentaire de `<N>`, puis relit le
  commentaire sous l'`id` que la publication rend. Une PR se commente par le même chemin.

Il refuse, sans rien écrire : une ancre introuvable ou ambiguë — toutes sont validées avant la
première écriture —, un fichier de paires mal formé — chaque défaut nommé avec le numéro de sa
ligne, lu avant tout appel à la forge —, une paire dont l'ancienne ligne est en double dans le
texte, ou absente quand la nouvelle y est absente aussi — la plus proche nommée — ou en double —
toutes les paires sont validées avant la première écriture —, zéro brief à cocher, plusieurs
briefs, un fichier de brief qui ne s'ouvre pas par sa marque, un label inconnu du dépôt — chacun
nommé ; `CLAUDE.md` interdit de deviner un label, et les références REST de « Create an issue » et
d'« Add labels to an issue » ne disent pas ce qu'elles font d'un label inconnu —, un fichier
illisible, non UTF-8 ou sans ligne non vide — lu avant tout appel à la forge —, un fichier
`--mapping` mal formé — chaque défaut nommé avec le rang de son label, tous en une passe, lu avant
tout appel —, hors de l'arbre de travail d'un dépôt git — dans son `.git` compris —, un remote
`origin` déjà là — son URL nommée —, une issue ouverte de ce titre et de ce corps sous d'autres
labels — le rejeu d'une création dont la forge a ignoré les labels ; il nomme l'appel de `label`
qui pose les manquants, et ceux en plus sans réparation : l'issue a pu être triée depuis sa
création —, une issue déjà fermée sous une autre raison — une
fermeture ne se réécrit pas, et l'API REST ignore `state_reason` quand `state` ne change pas
(« Update an issue ») —, un milestone à rattacher fermé ou absent sans `--description` — un thème
ne se crée pas sans son périmètre —, un milestone à fermer absent ou pas vidé, une lecture `gh`
qui échoue, ne rend pas du JSON, ou rend un JSON sans un champ attendu ou d'un autre type. Après
l'écriture — sa réponse comprise, dont un commentaire publié tire son `id`, une issue ou un
milestone créé son numéro —, c'est une relecture non conforme : l'écriture a pu partir. Une case
déjà cochée, des paires toutes déjà appliquées, des labels tous déjà posés ou déjà absents, une
issue déjà fermée sous cette raison ou déjà dans ce milestone, un milestone déjà fermé, un fichier
qui termine déjà le corps ou qui l'est déjà tout entier, un commentaire de `<N>` qui porte déjà le
fichier pour corps, une issue ouverte — pas une PR — qui porte déjà ce titre, ce corps et ces
labels, des labels du fichier `--mapping` tous dans le dépôt : rien à écrire, et la sortie le dit —
un rejeu après une relecture tombée n'écrit donc pas une seconde fois.

**Ce qu'il ne prouve pas.** Il ne choisit ni les cases ni les lignes : la session les nomme. Il ne
verrouille rien : une édition faite par un tiers entre sa lecture et son écriture est écrasée, et
la relecture ne la voit pas — elle compare à ce que le script a écrit ; un même commentaire publié
entre la lecture des commentaires et la publication fait un doublon, une même issue créée entre la
lecture des issues ouvertes et la création aussi, un même milestone créé entre la lecture des
milestones et la création aussi — ou un refus de la seconde création, si la forge refuse un titre
pris : non mesuré —, et `milestone` retient alors le premier listé. Le commentaire déjà publié se
reconnaît à son corps seul, l'issue déjà créée à son titre et à son corps — puis ses labels se
comparent, et une issue fermée n'est pas vue —, **quel qu'en soit l'auteur**. Le fichier se
reconnaît à l'identique, fins de ligne comprises, en fin de corps comme en corps de commentaire ou
d'issue : sur une forge qui le stocke transformé — relecture non conforme dès le premier appel —,
un rejeu l'ajoute, le réécrit, le publie ou crée l'issue une seconde fois. Après une création de
thème relue non conforme, le rejeu de `milestone attach` ne relit pas le thème qu'il trouve :
gardé sous une autre description, il y rattache l'issue et sort en 0 — fuite assumée, `xfail`
strict de la forme `milestone-attach-creation-description` (`test_ecriture_relue.py`) ; sous
un autre titre, il ne le reconnaît pas et en crée un second ; fermé, il refuse. `label create` ne
compare pas la description d'un label présent, et ne réécrit pas sa couleur : il la nomme. Après
une relecture de `depot create` tombée, le rejeu trouve `origin` et refuse : le dépôt se relit à
la main ; un `insteadOf` qui réécrit l'URL d'`origin` hors de ses formes HTTPS et SSH rend une
relecture non conforme. Une relecture conforme atteste ce que l'API rend, pas ce que l'interface
web affiche. Le chemin d'un label encodé, la pose d'un label, l'écriture du corps d'une PR, la
publication d'un commentaire sur une PR par l'endpoint `issues`, la création et la fermeture
d'une issue, la création, le rattachement et la fermeture d'un milestone, la création d'un label
du dépôt et celle d'un dépôt ne sont pas mesurés sur la vraie forge.

Sortie : 0 écrit et relu conforme, rien à écrire, ou lu (`checkbox next`) ; 1 refus (« refus — »),
ou écriture lancée et relecture non conforme ou impossible (« relecture non conforme — ») — motif
en une ligne sur la sortie standard ; 2 appel mal formé, usage sur la sortie d'erreur. Python 3.11 ou plus,
bibliothèque standard seule ; `gh` authentifié et `git`, lancé depuis le dépôt.
"""

import argparse
import difflib
import io
import json
import re
import shlex
import subprocess
import sys
from collections.abc import Callable, Generator, Mapping, Sequence
from contextlib import contextmanager
from functools import partial
from pathlib import Path
from typing import Any, NamedTuple, TypeVar, cast
from urllib.parse import quote

Run = Callable[[Sequence[str], bytes | None], subprocess.CompletedProcess[bytes]]
T = TypeVar("T")

REPO = "repos/{owner}/{repo}"
# Les issues du dépôt, et ses PR : pour l'API REST, une PR est une issue.
ISSUES = f"{REPO}/issues"
MILESTONES = f"{REPO}/milestones"
LABELS = f"{REPO}/labels"
# Une couleur de label : six chiffres hexadécimaux, sans `#` (« Create a label », API REST).
HEX_COLOR = re.compile(r"[0-9A-Fa-f]{6}")
# « Create a label » : une description « must be 100 characters or fewer ».
DESCRIPTION_MAX = 100
BRIEF_MARK = "## Brief d'agent"
# Une ligne de case Markdown ; le groupe est l'état de la case. `[X]` vaut coché pour GitHub.
CHECKBOX = re.compile(r"[ \t]*- \[([ xX])\] ")
# Les marques d'une paire dans un fichier `--paires` : la ligne de l'ancienne, puis de la nouvelle.
OLD_MARK, NEW_MARK = "< ", "> "
# Une ligne de case de plan de QA, en GFM (spec §5.2, §5.3) : un ou plusieurs éléments de liste
# ouverts sur la ligne, chacun derrière ses blancs ou ses citations `>`, le dernier suivi d'une case
# et d'un blanc ; le groupe `state` est l'état de la case. C'est `PLAN_QA_CASE` de
# `test_agent_skills.py` (lot 7a), dont `test_ecriture_relue.py` tient le recueil d'accord.
PLAN_CASE = re.compile(r"^(?:[ \t>]*(?:[-*+]|\d+[.)])[ \t]+)+\[(?P<state>[ \txX])\][ \t]+")
# Ce que porte une case laissée `[ ]` qui n'attend plus (`execution-qa/SKILL.md` §3, §4, §6 et
# « Passe finale ») : un échec, consigné ou non, un blocage ou une acceptation — une annotation de
# §3, étape 4, s'écrit ` — <marque>`.
SETTLED_MARKS = ("🔴", " — BLOQUÉ", " — accepté")
# `str.isdigit` accepte « ² » : le numéro, qui entre dans un chemin d'API, se lit en ASCII.
NUMBER = re.compile(r"[0-9]+")
# Un dépôt `<propriétaire>/<nom>`, qui entre dans un chemin d'API et dans `gh repo create` : un
# propriétaire ne s'ouvre pas par `-`, la forme d'une option ; un nom n'est ni `.` ni `..`, segments
# relatifs d'un chemin.
REPOSITORY = re.compile(r"[A-Za-z0-9][A-Za-z0-9-]*/(?!\.\.?$)[A-Za-z0-9._-]+")
INSIDE_WORK_TREE = ("git", "rev-parse", "--is-inside-work-tree")
ORIGIN_URL = ("git", "remote", "get-url", "origin")
# Le code de sortie de `git remote` sur un remote introuvable (git-remote(1), « EXIT STATUS »).
NO_SUCH_REMOTE = 2


class Refusal(Exception):
    """Rien n'est écrit : une condition du geste n'est pas tenue ; le message est le motif."""


class Divergence(Exception):
    """L'écriture est lancée, et la relecture ne rend pas l'attendu ou n'a pas pu se faire."""


class Text(NamedTuple):
    """Un texte de la forge : où l'écrire et le relire, ce qu'il vaut, comment le nommer."""

    path: str
    body: str
    name: str


def default_run(cmd: Sequence[str], stdin: bytes | None) -> subprocess.CompletedProcess[bytes]:
    """Lance `cmd` avec `stdin` sur son entrée standard et capture ses sorties **en octets** : ni
    le mode texte ni la page de code de la console ne touchent ce qui entre ou sort."""
    return subprocess.run(list(cmd), input=stdin, capture_output=True, check=False)


def launch(
    run: Run, cmd: Sequence[str], stdin: bytes | None = None
) -> subprocess.CompletedProcess[bytes]:
    """`cmd` lancé par `run`, quel que soit son code de sortie.

    Raises:
        Refusal: la commande ne se lance pas — exécutable introuvable.
    """
    try:
        return run(cmd, stdin)
    except OSError as error:
        raise Refusal(f"`{cmd[0]}` ne se lance pas : {error}") from error


def failed(cmd: Sequence[str], done: subprocess.CompletedProcess[bytes]) -> Refusal:
    """Le refus de `cmd`, sortie en échec : son code, et sa sortie d'erreur en une ligne."""
    motif = " ".join(done.stderr.decode("utf-8", "replace").split())
    return Refusal(f"`{' '.join(cmd)}` a échoué ({done.returncode}) : {motif}")


def stdout_of(run: Run, cmd: Sequence[str], stdin: bytes | None = None) -> bytes:
    """La sortie de `cmd`, ou un refus si la commande échoue ou ne se lance pas (`launch`,
    `failed`) : une sortie vide d'une commande en échec ne se lit jamais comme une réponse."""
    done = launch(run, cmd, stdin)
    if done.returncode != 0:
        raise failed(cmd, done)
    return done.stdout


def gh_api(run: Run, *args: str, stdin: bytes | None = None) -> bytes:
    """La sortie de `gh api <args>` (`stdout_of`)."""
    return stdout_of(run, ("gh", "api", *args), stdin)


def read_json(run: Run, parse: Callable[[Any], Any], *args: str, stdin: bytes | None = None) -> Any:
    """Ce que `parse` tire de la réponse JSON de `gh api <args>`, décodée en UTF-8 explicitement.
    La présence et le type des champs s'y gardent pour chaque site qui lit un document
    de la forge — lecture, réponse d'une écriture, relecture —, dénombrés par
    `test_une_reponse_d_une_autre_forme_sort_en_1_en_une_ligne`.

    Args:
        parse: tire du document les champs attendus ; un champ absent ou d'un autre type y lève
            `KeyError` ou `TypeError`.
        stdin: la charge d'une écriture, que `gh` lit sur son entrée standard.

    Raises:
        Refusal: la commande échoue, ne rend pas du JSON en UTF-8, ou pas la forme que `parse`
            attend.
    """
    try:
        document = json.loads(gh_api(run, *args, stdin=stdin).decode("utf-8"))
    except ValueError as error:
        raise Refusal(f"`gh api {' '.join(args)}` ne rend pas du JSON UTF-8 : {error}") from error
    try:
        return parse(document)
    except (KeyError, TypeError) as error:
        raise Refusal(
            f"`gh api {' '.join(args)}` ne rend pas la forme attendue : "
            f"{type(error).__name__} {error}"
        ) from error


def read_pages(run: Run, parse: Callable[[Any], Any], path: str) -> Any:
    """Ce que `parse` tire de la liste `path`, lue sur toutes ses pages par
    `gh api --paginate --slurp` — une liste par page —, 100 par page : le maximum de l'API REST,
    contre 30 par défaut ; `gh` suit l'en-tête `Link`, qui garde `per_page`.

    Raises:
        Refusal: voir `read_json`.
    """
    separator = "&" if "?" in path else "?"
    return read_json(run, parse, "--paginate", "--slurp", f"{path}{separator}per_page=100")


@contextmanager
def writing() -> Generator[None, None, None]:
    """Le bloc qui lance une écriture puis la relit : un refus y devient une divergence.

    Raises:
        Divergence: une commande du bloc échoue, ou un document lu n'a pas la forme attendue —
            l'écriture a pu partir, ce qu'un refus ferait croire impossible.
    """
    try:
        yield
    except Refusal as error:
        raise Divergence(str(error)) from error


def patch_then_reread(run: Run, path: str, payload: bytes, parse: Callable[[Any], Any]) -> Any:
    """Écrit `payload` sur le document `path` par `gh api -X PATCH`, puis rend ce que `parse` tire
    du document relu sous le même chemin ; un échec est une divergence (`writing`)."""
    with writing():
        gh_api(run, "-X", "PATCH", path, "--input", "-", stdin=payload)
        return read_json(run, parse, path)


def post_then_reread(
    run: Run,
    path: str,
    payload: bytes,
    key: str,
    located: Callable[[int], str],
    parse: Callable[[Any], Any],
) -> tuple[int, Any]:
    """Crée `payload` sous la liste `path` par `gh api -X POST`, puis rend le champ `key` que rend
    la création — l'`id` d'un commentaire, le numéro d'une issue ou d'un milestone, entier : il
    entre dans un chemin d'API (`typed`) — et ce que `parse` tire du document relu sous
    `located(<key>)` ; un échec est une divergence (`writing`)."""
    with writing():
        created = read_json(
            run, lambda doc: typed(doc, key, int), "-X", "POST", path, "--input", "-", stdin=payload
        )
        return created, read_json(run, parse, located(created))


def text_or_null(document: Any, field: str) -> str | None:
    """Le champ `field` d'un document de la forge : un texte, ou `None` pour `null`.

    Raises:
        KeyError, TypeError: pas de champ `field`, ou ni texte ni `null` — `read_json` en fait le
            motif.
    """
    value = document[field]
    if not isinstance(value, str | None):
        raise TypeError(f"`{field}` de type {type(value).__name__}")
    return value


def body_of(document: Any) -> str:
    """Le champ `body` d'un document de la forge ; `null` vaut le texte vide.

    Raises:
        KeyError, TypeError: voir `text_or_null`.
    """
    return text_or_null(document, "body") or ""


# `def typed[T]` demande Python 3.12 ; le script tient 3.11 (docstring du module).
def typed(document: Any, field: str, kind: type[T]) -> T:  # noqa: UP047
    """Le champ `field` d'un document de la forge, exactement du type `kind`.

    Raises:
        KeyError, TypeError: pas de champ `field`, ou d'un autre type — un booléen JSON compris,
            que Python tient pour un entier.
    """
    value = document[field]
    if type(value) is not kind:
        raise TypeError(f"`{field}` de type {type(value).__name__}")
    return value


def measure(text: str) -> str:
    """Octets UTF-8 et `\\r` : ce que change la conversion de toutes les fins de ligne LF ↔ CRLF."""
    carriage_returns = text.count("\r")
    return f"{len(text.encode())} octets et {carriage_returns} \\r"


def json_payload(**fields: Any) -> bytes:
    """La charge d'une écriture — `{"body": …}` pour un texte —, en JSON UTF-8 brut, pour
    `--input -`."""
    return json.dumps(fields, ensure_ascii=False).encode("utf-8")


def check_reread(expected: str, reread: str, anchors: Sequence[str]) -> None:
    """Compare le texte relu à l'attendu, **entier** : une forme réduite, longueur ou ancre, ne
    voit pas une conversion qui la préserve.

    Args:
        anchors: ce que la relecture doit contenir — nommé dans le motif s'il manque.

    Raises:
        Divergence: `reread` n'est pas `expected` ; le motif nomme chaque ancre absente, puis les
            octets et les `\\r` attendus et relus.
    """
    if reread != expected:
        missing = [f"ancre absente : {anchor}" for anchor in anchors if anchor not in reread]
        raise Divergence(
            " ; ".join([*missing, f"attendu {measure(expected)}, relu {measure(reread)}"])
        )


def write_body(run: Run, text: Text, expected: str, anchors: Sequence[str]) -> None:
    """Écrit `expected` comme corps de `text`, le relit, et compare le texte entier.

    Raises:
        Divergence: écriture ou relecture en échec, ou texte relu autre que `expected` — voir
            `check_reread`.
    """
    # ponytail: pas de verrou — une édition concurrente entre lecture et écriture est écrasée ;
    # une requête conditionnelle si la forge en accepte une.
    reread = patch_then_reread(run, text.path, json_payload(body=expected), body_of)
    check_reread(expected, reread, anchors)


def resolve_anchors(candidates: Mapping[int, str], anchors: Sequence[str]) -> dict[str, int]:
    """L'indice de la seule ligne candidate qui porte chaque ancre.

    Args:
        candidates: indice → texte cherché, pour les seules lignes de case du texte.

    Raises:
        Refusal: une ancre n'apparaît dans aucune ligne de case, ou dans plusieurs — chaque ancre
            en défaut est nommée, pas seulement la première.
    """
    targets: dict[str, int] = {}
    motifs: list[str] = []
    for anchor in anchors:
        hits = [i for i, line in candidates.items() if anchor in line]
        if not hits:
            motifs.append(f"case introuvable : {anchor}")
        elif len(hits) > 1:
            motifs.append(f"case ambiguë : {anchor} ({len(hits)} lignes)")
        else:
            targets[anchor] = hits[0]
    if motifs:
        raise Refusal(" ; ".join(motifs))
    return targets


def check_boxes(body: str, anchors: Sequence[str]) -> tuple[str, list[str], list[str]]:
    """Coche, dans `body`, la ligne de case que désigne chaque ancre — toutes, ou aucune.

    Une ligne est un segment entre deux `\\n` : un `\\r` final reste sur sa ligne, les fins de
    ligne ressortent telles qu'elles sont entrées. L'ancre se cherche dans le texte qui suit le
    marqueur `- [ ] `, que cocher ne change pas : le rejeu rend le verdict du premier appel.

    Returns:
        Le corps coché, les lignes cochées (sans indentation ni `\\r`, ancres de la relecture),
        et les ancres dont la case l'était déjà.

    Raises:
        Refusal: voir `resolve_anchors` ; rien n'est coché.
    """
    lines = body.split("\n")
    boxes = {i: box for i, line in enumerate(lines) if (box := CHECKBOX.match(line))}
    targets = resolve_anchors({i: lines[i][box.end() :] for i, box in boxes.items()}, anchors)
    already = [anchor for anchor, i in targets.items() if boxes[i].group(1) != " "]
    checked: list[str] = []
    for i in sorted({i for i in targets.values() if boxes[i].group(1) == " "}):
        lines[i] = lines[i][: boxes[i].start(1)] + "x" + lines[i][boxes[i].end(1) :]
        checked.append(lines[i].strip())
    return "\n".join(lines), checked, already


def issue_path(number: int | str) -> str:
    """Le chemin `gh api` de l'issue `number` — d'une PR aussi : pour l'API REST, une PR est une
    issue."""
    return f"{ISSUES}/{number}"


def issue_body(run: Run, number: str) -> Text:
    """Le corps de l'issue ou de la PR `number` ; `null` vaut le texte vide."""
    path = issue_path(number)
    return Text(path, read_json(run, body_of, path), f"corps de #{number}")


def comments_path(number: str) -> str:
    """Le chemin `gh api` des commentaires de l'issue ou de la PR `number`."""
    return f"{issue_path(number)}/comments"


def comment_path(identifier: int) -> str:
    """Le chemin `gh api` du commentaire `identifier`, d'une issue ou d'une PR."""
    return f"{ISSUES}/comments/{identifier}"


def kept_comments(pages: Any, keep: Callable[[str], bool]) -> list[tuple[int, str]]:
    """L'`id` et le corps de chaque commentaire dont le corps satisfait `keep`, sur les pages que
    `read_pages` rend.

    Raises:
        KeyError, TypeError: des pages qui ne sont pas des listes de commentaires, un commentaire
            sans corps, ou un commentaire retenu sans `id` entier — il entre dans un chemin d'API
            (`typed`).
    """
    return [
        (typed(comment, "id", int), body)
        for page in pages
        for comment in page
        if keep(body := body_of(comment))
    ]


def issue_comments(run: Run, number: str, keep: Callable[[str], bool]) -> list[tuple[int, str]]:
    """Les commentaires de l'issue ou de la PR `number` que `keep` retient, lus sur toutes les
    pages (`kept_comments`)."""
    return read_pages(run, lambda pages: kept_comments(pages, keep), comments_path(number))


def is_brief(body: str) -> bool:
    """Un brief d'agent s'ouvre par `## Brief d'agent`, dès son premier caractère."""
    return body.startswith(BRIEF_MARK)


def brief_comments(run: Run, number: str) -> list[Text]:
    """Les commentaires de brief de l'issue `number` (`is_brief`), cherchés sur toutes les
    pages."""
    return [
        Text(comment_path(identifier), body, f"brief de #{number}")
        for identifier, body in issue_comments(run, number, is_brief)
    ]


def brief_comment(run: Run, number: str) -> Text:
    """Le seul commentaire de brief de l'issue `number` (`brief_comments`).

    Raises:
        Refusal: aucun commentaire ne s'ouvre par `## Brief d'agent`, ou plusieurs.
    """
    briefs = brief_comments(run, number)
    if len(briefs) != 1:
        raise Refusal(
            f"il faut un seul commentaire de brief sur #{number}, il y en a {len(briefs)}"
        )
    return briefs[0]


def bare_lines(text: str) -> list[str]:
    """Les lignes de `text`, segments entre deux `\\n`, chacune sans son `\\r` final : la forme
    qui se compare, les fins de ligne restant à qui écrit."""
    return [line.removesuffix("\r") for line in text.split("\n")]


class Pair(NamedTuple):
    """Une paire d'un fichier `--paires` : l'ancienne ligne, la nouvelle, et le numéro (base 1) de
    la ligne du fichier qui porte chacune."""

    old_number: int
    old: str
    new_number: int
    new: str


def stray(line: str) -> str:
    """Le défaut d'une ligne non vide d'un fichier `--paires` qui n'entre dans aucune paire."""
    if line.startswith(OLD_MARK):
        return "« < » sans « > » qui le suit"
    if line.startswith(NEW_MARK):
        return "« > » sans « < » qui le précède"
    return "ni vide, ni « < … », ni « > … »"


def split_pairs(text: str) -> tuple[list[Pair], list[tuple[int, str]]]:
    """Les paires du texte d'un fichier `--paires`, et les lignes qui n'entrent dans aucune.

    Les lignes sont celles de `bare_lines` ; une ligne vide ou de blancs s'ignore. Une ligne
    ouverte par `< ` porte l'ancienne ligne, et la ligne suivante non ignorée, ouverte par `> `, la
    nouvelle — ce qui suit chaque marque, sans échappement.

    Returns:
        Les paires, et le numéro (base 1) et le défaut (`stray`) de chaque ligne hors d'une paire.
    """
    kept = [(number, line) for number, line in enumerate(bare_lines(text), 1) if line.strip()]
    pairs: list[Pair] = []
    strays: list[tuple[int, str]] = []
    i = 0
    while i < len(kept):
        number, line = kept[i]
        next_number, next_line = kept[i + 1] if i + 1 < len(kept) else (0, "")
        if line.startswith(OLD_MARK) and next_line.startswith(NEW_MARK):
            old, new = line.removeprefix(OLD_MARK), next_line.removeprefix(NEW_MARK)
            pairs.append(Pair(number, old, next_number, new))
            i += 2
        else:
            strays.append((number, stray(line)))
            i += 1
    return pairs, strays


def pair_defects(pairs: Sequence[Pair]) -> list[tuple[int, str]]:
    """Les défauts du contenu des paires, chacun sous le numéro de sa ligne dans le fichier : une
    ligne vide ou de blancs, une paire sans changement, et — une ligne, une paire — une ancienne ou
    une nouvelle ligne nommée deux fois, ou la nouvelle d'une paire ancienne d'une autre : les
    paires chaînées casseraient le rejeu."""
    defects: list[tuple[int, str]] = []
    # Texte → numéro de sa première ligne, pour les paires déjà lues ; un numéro, en base 1, n'est
    # jamais nul.
    olds: dict[str, int] = {}
    news: dict[str, int] = {}
    for pair in pairs:
        if not pair.old.strip():
            defects.append((pair.old_number, "ancienne ligne vide"))
        if not pair.new.strip():
            defects.append((pair.new_number, "nouvelle ligne vide"))
        if pair.old == pair.new:
            defects.append((pair.old_number, "ancienne et nouvelle lignes égales"))
        if first := olds.get(pair.old):
            defects.append((pair.old_number, f"ancienne ligne déjà nommée ligne {first}"))
        if first := news.get(pair.new):
            defects.append((pair.new_number, f"nouvelle ligne déjà nommée ligne {first}"))
        if first := news.get(pair.old):
            defects.append(
                (pair.old_number, f"ancienne ligne qui est la nouvelle de la ligne {first}")
            )
        if first := olds.get(pair.new):
            defects.append(
                (pair.new_number, f"nouvelle ligne qui est l'ancienne de la ligne {first}")
            )
        olds.setdefault(pair.old, pair.old_number)
        news.setdefault(pair.new, pair.new_number)
    return defects


def read_pairs(path: Path) -> list[Pair]:
    """Les paires du fichier `--paires` `path`, UTF-8 lu en octets (`split_pairs`).

    Raises:
        Refusal: fichier illisible ou non UTF-8 (`read_utf8`), ou mal formé — chaque défaut
            nommé avec le numéro de sa ligne, dans l'ordre du fichier (`split_pairs`,
            `pair_defects`), puis l'absence de toute paire.
    """
    pairs, strays = split_pairs(read_utf8(path))
    defects = sorted([*strays, *pair_defects(pairs)])
    motifs = [f"ligne {number} : {defect}" for number, defect in defects]
    if not pairs:
        motifs.append("aucune paire dans le fichier")
    if motifs:
        raise Refusal(f"{path} : {' ; '.join(motifs)}")
    return pairs


def closest(line: str, candidates: Sequence[str]) -> str:
    """Le complément du motif d'une ligne introuvable : la ligne de `candidates` la plus proche de
    `line` (`difflib.get_close_matches`, au seuil de similarité par défaut, 0,6), ou « aucune ligne
    proche »."""
    close = difflib.get_close_matches(line, candidates, n=1)
    return f"la plus proche : {close[0]}" if close else "aucune ligne proche"


def replace_lines(body: str, pairs: Sequence[Pair]) -> tuple[str, list[str], list[str]]:
    """Remplace, dans `body`, l'ancienne ligne de chaque paire par sa nouvelle — toutes, ou aucune.

    Une ligne se compare sous sa forme `bare_lines` ; son `\\r` final reste à l'écriture : les fins
    de ligne ressortent telles qu'elles sont entrées. Une paire dont l'ancienne ligne manque et
    dont la nouvelle est seule dans `body` est déjà appliquée : le rejeu d'un fichier déjà poussé
    n'écrit rien. Borne : la nouvelle ligne déjà ailleurs dans `body`, la paire s'applique, mais
    le rejeu trouve la nouvelle en double et refuse.

    Returns:
        Le texte remplacé, les nouvelles lignes écrites (ancres de la relecture), et l'ancienne
        ligne de chaque paire déjà appliquée.

    Raises:
        Refusal: une ancienne ligne en double ; ou absente, quand la nouvelle l'est aussi — la
            plus proche nommée (`closest`) — ou est en double. Chaque paire en défaut est nommée,
            et rien n'est remplacé.
    """
    lines = body.split("\n")
    keys = bare_lines(body)
    replaced: list[str] = []
    already: list[str] = []
    motifs: list[str] = []
    for pair in pairs:
        olds = [i for i, key in enumerate(keys) if key == pair.old]
        news = keys.count(pair.new)
        if len(olds) == 1:
            lines[olds[0]] = pair.new + lines[olds[0]].removeprefix(pair.old)
            replaced.append(pair.new)
        elif olds:
            motifs.append(f"ligne en double ({len(olds)}) : {pair.old}")
        elif news == 1:
            already.append(pair.old)
        elif news:
            motifs.append(f"ligne en double ({news}) : {pair.new}")
        else:
            motifs.append(f"ligne introuvable : {pair.old} ({closest(pair.old, keys)})")
    if motifs:
        raise Refusal(" ; ".join(motifs))
    return "\n".join(lines), replaced, already


def patch_text(run: Run, args: argparse.Namespace) -> str:
    """`checkbox patch` et `brief patch` : `--case` coche des cases (`check_boxes`), `--paires`
    remplace des lignes (`replace_lines`) — le fichier lu avant tout appel à la forge —, dans le
    texte que `args.locate` désigne (`edit_text`)."""
    if args.pairs:
        return edit_text(
            run,
            args,
            partial(replace_lines, pairs=read_pairs(args.pairs)),
            already="déjà appliquée",
            written="ligne(s) remplacée(s)",
            unchanged="toutes les paires déjà appliquées",
        )
    return edit_text(
        run,
        args,
        partial(check_boxes, anchors=args.anchors),
        already="déjà cochée",
        written="case(s) cochée(s)",
        unchanged="aucune case à cocher",
    )


def edit_text(
    run: Run,
    args: argparse.Namespace,
    edit: Callable[[str], tuple[str, list[str], list[str]]],
    *,
    already: str,
    written: str,
    unchanged: str,
) -> str:
    """Édite par `edit` le texte que `args.locate` désigne, et ne l'écrit que si une ligne change.

    Args:
        edit: texte lu → texte édité, lignes écrites (ancres de la relecture), et ce qui l'était
            déjà, chacun rapporté sous `already`.
        already, written, unchanged: les mots du rapport — d'un élément déjà fait, du compte des
            lignes écrites, et d'un appel sans rien à écrire.
    """
    text = args.locate(run, args.number)
    expected, lines, done = edit(text.body)
    report = [f"{already} : {item}" for item in done]
    if lines:
        write_body(run, text, expected, lines)
        report.append(f"écrit et relu — {text.name} : {len(lines)} {written}")
    else:
        report.append(f"rien à écrire — {text.name} : {unchanged}")
    return "\n".join(report)


def pending_box(body: str) -> tuple[str, str] | None:
    """La prochaine case en attente de `body`, un plan de QA, et le dernier titre au-dessus d'elle.

    Les lignes sont celles de `bare_lines`. Une case (`PLAN_CASE`) est en attente quand un blanc
    la laisse non cochée (GFM §5.3) et que sa ligne ne porte aucune marque de `SETTLED_MARKS`. Un
    titre est une ligne ouverte par `#`, rendu sans ses `#` ni ses blancs.

    Returns:
        Le titre — `(sans titre)` s'il n'y en a pas au-dessus — et la ligne de case ; `None` sans
        case en attente.
    """
    title = "(sans titre)"
    # ponytail: Markdown lu à la ligne — les blocs de code clôturés ne sont pas suivis, un `#` ou
    # une case qui y figure compte, et un `#` de tête fait un titre sans le blanc que GFM (§4.2)
    # lui demande ; un analyseur GFM le jour où un plan en porte au-dessus de ses cases.
    for line in bare_lines(body):
        if line.startswith("#"):
            title = line.lstrip("#").strip()
        elif (
            (box := PLAN_CASE.match(line))
            and box["state"].isspace()
            and not any(mark in line for mark in SETTLED_MARKS)
        ):
            return title, line
    return None


def next_box(run: Run, args: argparse.Namespace) -> str:
    """`checkbox next` : la prochaine case en attente du corps de `<N>` (`pending_box`), lue sans
    rien écrire."""
    text = issue_body(run, args.number)
    found = pending_box(text.body)
    return "\n".join(found) if found else f"aucune case en attente — {text.name}"


def names_of(labels: Any) -> list[str]:
    """Les noms d'une liste de labels — d'une issue ou du dépôt —, telle que l'API REST la rend.

    Raises:
        KeyError, TypeError: pas une liste de labels, ou un label sans nom textuel (`typed`).
    """
    return [typed(label, "name", str) for label in labels]


def label_names(document: Any) -> list[str]:
    """Les noms des labels d'une issue, telle que l'API REST la rend.

    Raises:
        KeyError, TypeError: pas de liste `labels`, ou un label sans nom textuel.
    """
    return names_of(document["labels"])


def carried_label(names: Sequence[str], wanted: str) -> str | None:
    """Le nom sous lequel `names` — les labels d'une issue ou du dépôt — porte le label `wanted` :
    `wanted` lui-même s'il y est, sinon le premier qui lui est égal sans la casse ; `None` si
    aucun."""
    if wanted in names:
        return wanted
    return next((name for name in names if name.casefold() == wanted.casefold()), None)


def label_plan(
    carried: Sequence[str], wanted: Sequence[str], unwanted: Sequence[str]
) -> tuple[list[str], list[str], list[str]]:
    """Ce que `label` écrit sur une issue qui porte `carried` : les labels de `wanted` qu'elle ne
    porte pas, ceux de `unwanted` qu'elle porte — sous le nom qu'elle leur donne, apparié comme
    `carried_label` —, et ce qui est déjà en place, en clair. Rien à poser ni à retirer : chaque
    label est déjà là où on le veut, et le rejeu n'écrit rien.

    Returns:
        Les labels à poser, les labels à retirer, et les labels déjà en place.
    """
    added = [name for name in wanted if carried_label(carried, name) is None]
    found = {label: carried_label(carried, label) for label in unwanted}
    removed = [name for name in found.values() if name is not None]
    done = [f"{name} déjà posé" for name in wanted if name not in added]
    done += [f"{label} déjà absent" for label, name in found.items() if name is None]
    return added, removed, done


def label_edit(run: Run, args: argparse.Namespace) -> str:
    """`label` : pose les labels `--add` absents de l'issue, puis retire les `--remove` qu'elle
    porte (`label_plan`), puis relit ses labels — la pose d'abord : une transition d'état ne laisse
    jamais l'issue sans label d'état, même un instant. Un label à poser part sous le nom que le
    dépôt lui donne (`repo_labels`) ; un retrait vise le nom que l'issue porte, encodé en un seul
    segment de chemin : rien ne dit la forge insensible à la casse.

    Raises:
        Refusal: un label à poser est inconnu du dépôt — rien n'est écrit, pas même un retrait.
        Divergence: écriture ou relecture en échec, label posé absent ou retiré encore là.
    """
    wanted = repo_labels(run, args.add)
    path = issue_path(args.number)
    added, removed, done = label_plan(read_json(run, label_names, path), wanted, args.remove)
    issue = f"#{args.number}"
    if not added and not removed:
        return f"rien à écrire — labels de {issue} : {' ; '.join(done)}"
    with writing():
        if added:
            post = ("-X", "POST", f"{path}/labels", "--input", "-")
            gh_api(run, *post, stdin=json_payload(labels=added))
        for name in removed:
            gh_api(run, "-X", "DELETE", f"{path}/labels/{quote(name, safe='')}")
        reread = read_json(run, label_names, path)
    missing = [f"le label {name} n'est pas sur {issue}" for name in added if name not in reread]
    left = [f"le label {name} est encore sur {issue}" for name in removed if name in reread]
    if missing or left:
        raise Divergence(" ; ".join([*missing, *left]))
    written = [f"ajouté {name}" for name in added] + [f"retiré {name}" for name in removed]
    return f"écrit et relu — labels de {issue} : {' ; '.join([*written, *done])}"


def named_twice(names: Sequence[str]) -> list[str]:
    """Les noms de `names` qui y figurent deux fois au moins, casse ignorée, triés."""
    folded = [name.casefold() for name in names]
    return sorted({name for name in names if folded.count(name.casefold()) > 1})


def label_misuse(args: argparse.Namespace) -> str | None:
    """Ce qu'argparse ne sait pas exiger de `label` : `label create` prend `--mapping`, seul ;
    `label <N>` prend `--add` ou `--remove`, l'un au moins, et aucun label nommé deux fois, casse
    ignorée — posé et retiré, l'état de l'issue dépendrait de l'ordre des requêtes ; retiré deux
    fois, le second retrait viserait un label déjà ôté."""
    names = [*args.add, *args.remove]
    if args.number == "create":
        return (
            None
            if args.mapping and not names
            else "label create : --mapping, sans --add ni --remove"
        )
    if args.mapping:
        return "label <N> : --mapping ne va qu'avec label create"
    if not names:
        return "label : --add ou --remove, l'un au moins"
    twice = named_twice(names)
    return f"label : nommé deux fois, casse ignorée : {', '.join(twice)}" if twice else None


class Label(NamedTuple):
    """Un label du dépôt : son nom, sa couleur — six chiffres hexadécimaux, sans `#` — et sa
    description."""

    name: str
    color: str
    description: str


# Chaque champ d'un label du fichier `--mapping`, et le défaut de sa valeur, un texte — `None` si
# elle tient.
MAPPING_FIELDS: dict[str, Callable[[str], str | None]] = {
    "nom": lambda name: (
        None if is_one_line(name) else f"nom vide ou sur plusieurs lignes : {name!r}"
    ),
    "couleur": lambda color: (
        None
        if HEX_COLOR.fullmatch(color)
        else f"couleur {color!r} : six chiffres hexadécimaux, sans #"
    ),
    "description": lambda text: (
        None
        if len(text) <= DESCRIPTION_MAX
        else f"description de {len(text)} caractères, {DESCRIPTION_MAX} au plus"
    ),
}


def entry_defects(entry: Any) -> list[str]:
    """Les défauts d'un label du fichier `--mapping`, tous en une passe : un objet, ses seuls
    champs `MAPPING_FIELDS`, chacun présent et textuel, puis sa valeur."""
    if not isinstance(entry, dict):
        return [f"{type(entry).__name__} au lieu d'un objet"]
    # Un objet JSON : des clés textuelles, des valeurs de tout type.
    fields = cast(dict[str, Any], entry)
    defects = [f"champ inconnu : {key}" for key in fields if key not in MAPPING_FIELDS]
    for field, defect_of in MAPPING_FIELDS.items():
        if field not in fields:
            defects.append(f"champ {field} absent")
        elif not isinstance(value := fields[field], str):
            defects.append(f"champ {field} de type {type(value).__name__}")
        elif defect := defect_of(value):
            defects.append(defect)
    return defects


def entry_name(entry: Any) -> str | None:
    """Le nom d'un label du fichier `--mapping`, `None` s'il n'en a pas de textuel."""
    try:
        return typed(entry, "nom", str)
    except (KeyError, TypeError):
        return None


def read_mapping(path: Path) -> list[Label]:
    """Les labels du fichier `--mapping` `path` : une liste JSON d'objets
    `{"nom": …, "couleur": …, "description": …}`, UTF-8 lu en octets.

    Raises:
        Refusal: fichier illisible ou non UTF-8 (`read_utf8`), pas du JSON, pas une liste non
            vide, ou mal formé — en une passe, chaque défaut nommé avec le rang de son label
            (`entry_defects`), puis les noms en double, casse ignorée : GitHub les tient pour un
            même label.
    """
    text = read_utf8(path)
    try:
        document = json.loads(text)
    except ValueError as error:
        raise Refusal(f"{path} n'est pas du JSON : {error}") from error
    if not isinstance(document, list) or not document:
        raise Refusal(f"{path} : une liste de labels attendue, non vide")
    entries = cast(list[Any], document)
    motifs = [
        f"label {rank} : {defect}"
        for rank, entry in enumerate(entries, 1)
        for defect in entry_defects(entry)
    ]
    if twice := named_twice([name for entry in entries if (name := entry_name(entry))]):
        motifs.append(f"nommé deux fois, casse ignorée : {', '.join(twice)}")
    if motifs:
        raise Refusal(f"{path} : {' ; '.join(motifs)}")
    return [Label(entry["nom"], entry["couleur"], entry["description"]) for entry in entries]


def repo_label(document: Any) -> Label:
    """Un label du dépôt, tel que l'API REST le liste ; une description `null` vaut le texte vide.

    Raises:
        KeyError, TypeError: un nom ou une couleur absents ou non textuels, une description ni
            textuelle ni `null` (`typed`, `text_or_null`).
    """
    name, color = typed(document, "name", str), typed(document, "color", str)
    return Label(name, color, text_or_null(document, "description") or "")


def repo_label_set(run: Run) -> dict[str, Label]:
    """Les labels du dépôt sous leur nom, lus sur toutes les pages (`repo_label`)."""
    return read_pages(
        run,
        lambda pages: {label.name: label for page in pages for label in map(repo_label, page)},
        LABELS,
    )


def label_named(labels: Mapping[str, Label], name: str) -> Label | None:
    """Le label de `labels` qui porte `name`, apparié comme `carried_label` ; `None` sans lui."""
    found = carried_label(list(labels), name)
    return None if found is None else labels[found]


def label_state(found: Label | None, wanted: Label) -> str:
    """Ce que `label create` dit du label `wanted` du fichier, `found` dans le dépôt : créé s'il en
    est absent, présent sinon — une autre couleur, casse ignorée, nommée et jamais réécrite."""
    if found is None:
        return f"créé {wanted.name}"
    if found.color.casefold() == wanted.color.casefold():
        return f"{found.name} présent"
    return f"{found.name} présent, couleur {found.color} au lieu de {wanted.color}, non modifié"


def appearance(label: Label) -> tuple[str, str]:
    """Ce qui se relit d'un label créé, outre son nom : sa couleur, casse ignorée — des chiffres
    hexadécimaux —, et sa description."""
    return label.color.casefold(), label.description


def label_gaps(
    reread: Mapping[str, Label], wanted: Sequence[Label], created: Sequence[Label]
) -> list[str]:
    """Les écarts des labels du dépôt relus : chaque label de `wanted` doit y être (`label_named`),
    ceux de `created` sous leur couleur et leur description (`appearance`)."""
    gaps: list[str] = []
    for label in wanted:
        found = label_named(reread, label.name)
        if found is None:
            gaps.append(f"label {label.name} absent du dépôt")
        elif label in created and appearance(found) != appearance(label):
            gaps.append(f"label {label.name} relu {appearance(found)}, attendu {appearance(label)}")
    return gaps


def label_create(run: Run, args: argparse.Namespace) -> str:
    """`label create` : crée chaque label du fichier `--mapping` absent du dépôt — nom, couleur et
    description —, puis relit les labels du dépôt. Un label présent, apparié comme
    `carried_label`, n'est jamais modifié (`label_state`). Le fichier est lu, et validé en entier,
    avant tout appel à la forge (`read_mapping`).

    Raises:
        Refusal: fichier inutilisable ou mal formé.
        Divergence: création ou relecture en échec, ou relecture non conforme (`label_gaps`).
    """
    wanted = read_mapping(args.mapping)
    present = repo_label_set(run)
    found = {label: label_named(present, label.name) for label in wanted}
    report = " ; ".join(label_state(there, label) for label, there in found.items())
    absent = [label for label, there in found.items() if there is None]
    if not absent:
        return f"rien à écrire — labels du dépôt : {report}"
    with writing():
        for label in absent:
            payload = json_payload(
                name=label.name, color=label.color, description=label.description
            )
            gh_api(run, "-X", "POST", LABELS, "--input", "-", stdin=payload)
        reread = repo_label_set(run)
    if gaps := label_gaps(reread, wanted, absent):
        raise Divergence(" ; ".join(gaps))
    return f"écrit et relu — labels du dépôt : {report}"


def label_command(run: Run, args: argparse.Namespace) -> str:
    """`label create` crée les labels du dépôt (`label_create`) ; `label <N>` pose et retire ceux
    de l'issue ou de la PR `<N>` (`label_edit`)."""
    return label_create(run, args) if args.number == "create" else label_edit(run, args)


def appended(body: str, addition: str) -> str:
    """`addition` à la suite de `body`, séparée de son dernier contenu par une ligne vide au
    moins : les fins de ligne — `\\n` ou `\\r\\n` — qui terminent déjà `body` comptent, et des
    `\\n` les complètent jusqu'à deux. Un corps vide n'a pas de séparateur ; `body` n'est jamais
    réécrit, seulement prolongé — plusieurs lignes vides qui le terminent restent."""
    if not body:
        return addition
    line_ends = body[len(body.rstrip("\r\n")) :].count("\n")
    return body + "\n" * max(0, 2 - line_ends) + addition


def read_utf8(path: Path) -> str:
    """Le texte d'un fichier UTF-8, lu en octets : ses fins de ligne restent.

    Raises:
        Refusal: fichier illisible ou non UTF-8.
    """
    try:
        return path.read_bytes().decode("utf-8")
    except OSError as error:
        raise Refusal(f"fichier illisible : {error}") from error
    except UnicodeDecodeError as error:
        raise Refusal(f"{path} n'est pas en UTF-8 : {error}") from error


def read_text_file(path: Path) -> tuple[str, str]:
    """Le texte d'un fichier UTF-8 (`read_utf8`), et sa première ligne non vide, ancre de la
    relecture.

    Raises:
        Refusal: fichier illisible, non UTF-8, ou sans ligne non vide.
    """
    text = read_utf8(path)
    anchor = next((line.strip() for line in text.splitlines() if line.strip()), None)
    if anchor is None:
        raise Refusal(f"{path} n'a aucune ligne non vide")
    return text, anchor


def issue_append(run: Run, args: argparse.Namespace) -> str:
    """`issue edit --append` : ajoute le fichier en fin de corps, sauf s'il le termine déjà. Le
    fichier est lu avant tout appel à la forge."""
    addition, anchor = read_text_file(args.append)
    text = issue_body(run, args.number)
    if text.body.endswith(addition):
        return f"rien à écrire — {text.name} : {args.append} déjà en fin de corps"
    write_body(run, text, appended(text.body, addition), [anchor])
    return f"écrit et relu — {text.name} : {args.append} ajouté"


def replace_text(run: Run, text: Text, body: str, anchor: str, file: Path) -> str:
    """Substitue `body`, le texte du fichier `file`, au texte entier de `text`, sauf s'il l'est
    déjà ; `anchor` est l'ancre de la relecture (`write_body`)."""
    if text.body == body:
        return f"rien à écrire — {text.name} : déjà {file}"
    write_body(run, text, body, [anchor])
    return f"écrit et relu — {text.name} : remplacé par {file}"


def issue_edit(run: Run, args: argparse.Namespace) -> str:
    """`issue edit` : `--append` ajoute le fichier en fin de corps (`issue_append`),
    `--body-file` le substitue au corps entier (`replace_text`). Le fichier est lu avant tout
    appel à la forge."""
    if args.append:
        return issue_append(run, args)
    body, anchor = read_text_file(args.body_file)
    return replace_text(run, issue_body(run, args.number), body, anchor, args.body_file)


def publish_comment(run: Run, number: str, expected: str, anchor: str) -> int:
    """Publie `expected` en commentaire de `number`, puis le relit sous l'`id` que rend la
    publication, et rend cet `id`.

    Raises:
        Divergence: publication ou relecture en échec, ou commentaire relu autre que `expected`
            (`check_reread`, ancre `anchor`).
    """
    payload = json_payload(body=expected)
    identifier, reread = post_then_reread(
        run, comments_path(number), payload, "id", comment_path, body_of
    )
    check_reread(expected, reread, [anchor])
    return identifier


def comment_publish(run: Run, args: argparse.Namespace) -> str:
    """`comment` : publie le fichier en commentaire, sauf si un commentaire porte déjà ce texte
    exactement, puis relit le commentaire sous l'`id` que rend la publication. Le fichier est lu
    avant tout appel à la forge."""
    expected, anchor = read_text_file(args.file)
    # ponytail: pas de verrou — un même texte publié entre la lecture et la publication fait un
    # doublon ; relire les commentaires après la publication si un doublon se constate.
    same = issue_comments(run, args.number, lambda body: body == expected)
    if same:
        identifier, _ = same[0]
        return f"rien à écrire — #{args.number} porte déjà ce commentaire ({identifier})"
    identifier = publish_comment(run, args.number, expected, anchor)
    return f"publié et relu — commentaire {identifier} sur #{args.number}"


def brief_write(run: Run, args: argparse.Namespace) -> str:
    """`brief write` : publie le fichier en commentaire de brief de `<N>` (`publish_comment`), ou
    édite en place le seul qui existe (`replace_text`) — « jamais un second brief concurrent »
    (`triage/brief-agent.md`). Le fichier est lu, et sa marque vérifiée, avant tout appel.

    Raises:
        Refusal: fichier inutilisable, fichier qui ne s'ouvre pas par `## Brief d'agent` —
            `brief patch` ne le reconnaîtrait plus (`is_brief`) —, ou plusieurs briefs.
    """
    body, anchor = read_text_file(args.file)
    if not is_brief(body):
        raise Refusal(f"{args.file} ne s'ouvre pas par {BRIEF_MARK}")
    briefs = brief_comments(run, args.number)
    if len(briefs) > 1:
        raise Refusal(
            f"{len(briefs)} commentaires de brief sur #{args.number} : aucun ne s'édite en place"
        )
    if briefs:
        return replace_text(run, briefs[0], body, anchor, args.file)
    identifier = publish_comment(run, args.number, body, anchor)
    return f"publié et relu — brief de #{args.number} : commentaire {identifier}"


def repo_labels(run: Run, wanted: Sequence[str]) -> list[str]:
    """Le nom que le dépôt donne à chaque label de `wanted`, apparié comme `carried_label`, sur
    toutes les pages de ses labels ; un label nommé deux fois, casse ignorée, n'y est qu'une
    fois, à sa première place.

    Raises:
        Refusal: un label de `wanted` n'existe pas dans le dépôt — chacun est nommé.
    """
    if not wanted:
        return []
    known = read_pages(
        run, lambda pages: [name for page in pages for name in names_of(page)], LABELS
    )
    found = {label: carried_label(known, label) for label in wanted}
    missing = [f"label inconnu du dépôt : {label}" for label, name in found.items() if name is None]
    if missing:
        raise Refusal(" ; ".join(missing))
    return list(dict.fromkeys(name for name in found.values() if name is not None))


def same_issue(pages: Any, title: str, body: str) -> tuple[int, list[str]] | None:
    """Le numéro et les labels de la première issue — pas une PR, que sa clé `pull_request`
    distingue (« List repository issues ») ; une clé `null` n'en fait pas une — qui porte
    exactement `title` et `body`, sur les pages que `read_pages` rend.

    Raises:
        KeyError, TypeError: une issue sans titre textuel ou sans corps textuel ni `null`, ou
            l'issue retenue sans numéro entier ou sans labels nommés (`typed`).
    """
    return next(
        (
            (typed(issue, "number", int), label_names(issue))
            for page in pages
            for issue in page
            if ("pull_request" not in issue or issue["pull_request"] is None)
            and typed(issue, "title", str) == title
            and body_of(issue) == body
        ),
        None,
    )


def labels_gap(number: int, expected: Sequence[str], carried: Sequence[str]) -> str | None:
    """L'écart entre les labels `carried` de l'issue `number` et l'ensemble `expected` ; `None` à
    ensembles égaux. Un manque se nomme avec l'appel de `label` qui le pose, noms cités pour le
    shell : c'est l'effet des labels qu'ignore une création sans droit d'écriture. Un label en
    plus se nomme sans réparation : l'issue a pu être triée depuis, et le retirer défairait le
    tri."""
    missing = [name for name in expected if name not in carried]
    extra = sorted(name for name in carried if name not in expected)
    if not missing and not extra:
        return None
    parts: list[str] = []
    if missing:
        repair = [part for name in missing for part in ("--add", name)]
        parts.append(f"à réparer par `{shlex.join(['label', str(number), *repair])}`")
    if extra:
        parts.append(f"#{number} porte en plus {extra} : l'issue a pu vivre depuis sa création")
    return f"labels attendus {sorted(expected)}, relus {sorted(carried)} — {' ; '.join(parts)}"


def issue_create(run: Run, args: argparse.Namespace) -> str:
    """`issue create` : crée l'issue — titre, corps et labels en une seule requête —, sauf si une
    issue ouverte porte déjà ce titre, ce corps et ces labels — la liste des issues de l'API REST
    ne rend que les ouvertes par défaut —, puis la relit sous le numéro que rend la création. Le
    fichier est lu, et les labels validés, avant toute écriture.

    Raises:
        Refusal: fichier inutilisable (`read_text_file`), label inconnu (`repo_labels`), ou
            issue ouverte de ce titre et de ce corps sous d'autres labels — un rejeu après des
            labels ignorés ; l'écart est nommé, et la pose des manquants (`labels_gap`).
        Divergence: création ou relecture en échec, ou issue relue autre que celle écrite —
            corps entier (`check_reread`), titre exact, ensemble des labels (`labels_gap`).
    """
    body, anchor = read_text_file(args.file)
    labels = repo_labels(run, args.labels)
    same = read_pages(run, lambda pages: same_issue(pages, args.title, body), ISSUES)
    if same is not None:
        number, carried = same
        if gap := labels_gap(number, labels, carried):
            raise Refusal(f"#{number} existe déjà ; {gap}")
        return f"rien à écrire — #{number} existe déjà"
    # ponytail: pas de verrou — une même issue créée entre la lecture et la création fait un
    # doublon ; relire les issues ouvertes après la création si un doublon se constate.
    number, (title, reread, carried) = post_then_reread(
        run,
        ISSUES,
        json_payload(title=args.title, body=body, labels=labels),
        "number",
        issue_path,
        lambda issue: (typed(issue, "title", str), body_of(issue), label_names(issue)),
    )
    check_reread(body, reread, [anchor])
    if title != args.title:
        raise Divergence(f"titre attendu {args.title!r}, relu {title!r}")
    if gap := labels_gap(number, labels, carried):
        raise Divergence(gap)
    return f"créée et relue — issue #{number}"


def closure(issue: Any) -> tuple[str, str | None]:
    """L'état d'une issue, `open` ou `closed`, et sa raison — `null` sur une issue jamais fermée.

    Raises:
        KeyError, TypeError: voir `typed` et `text_or_null`.
    """
    return typed(issue, "state", str), text_or_null(issue, "state_reason")


def issue_close(run: Run, args: argparse.Namespace) -> str:
    """`issue close` : ferme l'issue avec la raison `--reason`, sauf si elle l'est déjà avec cette
    raison, puis relit son état et sa raison.

    Raises:
        Refusal: l'issue est déjà fermée avec une autre raison — une fermeture ne se réécrit pas,
            et l'API REST ignore `state_reason` quand `state` ne change pas (« Update an issue »).
        Divergence: écriture ou relecture en échec, ou état et raison relus autres que l'attendu.
    """
    path, issue = issue_path(args.number), f"#{args.number}"
    wanted = ("closed", args.reason)
    state, reason = read_json(run, closure, path)
    if (state, reason) == wanted:
        return f"rien à écrire — {issue} déjà fermée ({reason})"
    if state == "closed":
        raise Refusal(f"{issue} déjà fermée ({reason}), pas en {args.reason}")
    payload = json_payload(state="closed", state_reason=args.reason)
    state, reason = patch_then_reread(run, path, payload, closure)
    if (state, reason) != wanted:
        raise Divergence(f"{issue} relue {state} ({reason}), attendue closed ({args.reason})")
    return f"fermée et relue — {issue} ({args.reason})"


class Milestone(NamedTuple):
    """Ce que `milestone` lit d'un milestone du dépôt."""

    number: int
    state: str
    open_issues: int


def same_milestone(pages: Any, title: str) -> Milestone | None:
    """Le premier milestone de titre `title` à l'identique, sur les pages que `read_pages` rend.

    Raises:
        KeyError, TypeError: un milestone sans titre textuel, ou celui retenu sans numéro, état ou
            nombre d'issues ouvertes de leur type (`typed`).
    """
    return next(
        (
            Milestone(typed(m, "number", int), typed(m, "state", str), typed(m, "open_issues", int))
            for page in pages
            for m in page
            if typed(m, "title", str) == title
        ),
        None,
    )


def milestone_titled(run: Run, title: str) -> Milestone | None:
    """Le milestone de titre `title` à l'identique — un thème porte le nom exact de son domaine
    (`triage/themes-milestones.md`) —, ouvert ou fermé, lu sur toutes les pages ; `None` s'il n'y
    en a pas (`same_milestone`)."""
    return read_pages(run, lambda pages: same_milestone(pages, title), f"{MILESTONES}?state=all")


def milestone_of(issue: Any) -> str | None:
    """Le titre du milestone d'une issue, `None` sans milestone.

    Raises:
        KeyError, TypeError: pas de champ `milestone`, ou ni `null` ni un milestone titré.
    """
    milestone = issue["milestone"]
    return None if milestone is None else typed(milestone, "title", str)


def milestone_path(number: int) -> str:
    """Le chemin `gh api` du milestone `number`."""
    return f"{MILESTONES}/{number}"


def create_milestone(run: Run, title: str, description: str) -> int:
    """Crée le milestone ouvert `title`, décrit par `description`, le relit sous le numéro que rend
    la création, et rend ce numéro.

    Raises:
        Divergence: création ou relecture en échec, ou titre, description ou état relus autres
            que ceux écrits.
    """
    written = (title, description, "open")
    number, reread = post_then_reread(
        run,
        MILESTONES,
        json_payload(title=title, description=description, state="open"),
        "number",
        milestone_path,
        lambda theme: (
            typed(theme, "title", str),
            text_or_null(theme, "description"),
            typed(theme, "state", str),
        ),
    )
    if reread != written:
        raise Divergence(f"milestone {number} relu {reread}, attendu {written}")
    return number


def milestone_attach(run: Run, args: argparse.Namespace) -> str:
    """`milestone attach` : rattache l'issue au milestone `--title`, sauf si elle l'est déjà, en le
    créant ouvert avec `--description` s'il n'existe pas, puis relit le milestone de l'issue. Un
    rattachement à un autre milestone est remplacé, et la sortie le nomme : c'est la fusion de
    thèmes de `triage/themes-milestones.md`.

    Raises:
        Refusal: le milestone est fermé, ou absent sans `--description` — un thème ne se crée pas
            sans son périmètre.
        Divergence: écriture ou relecture en échec, ou issue relue dans un autre milestone — sans
            droit d'écriture, l'API REST ignore en silence un changement de milestone (« Update an
            issue »).
    """
    path, issue = issue_path(args.number), f"#{args.number}"
    former = read_json(run, milestone_of, path)
    if former == args.title:
        return f"rien à écrire — {issue} déjà dans le milestone {args.title}"
    milestone = milestone_titled(run, args.title)
    if milestone is None and args.description is None:
        raise Refusal(f"aucun milestone {args.title}, et pas de --description pour le créer")
    if milestone is not None and milestone.state != "open":
        raise Refusal(f"le milestone {args.title} est fermé")
    report: list[str] = []
    if milestone is None:
        number = create_milestone(run, args.title, args.description)
        report.append(f"milestone {args.title} créé ({number})")
    else:
        number = milestone.number
    reread = patch_then_reread(run, path, json_payload(milestone=number), milestone_of)
    if reread != args.title:
        raise Divergence(f"{issue} relue dans le milestone {reread}, attendue dans {args.title}")
    replaced = "" if former is None else f", à la place de {former}"
    report.append(f"{issue} rattachée à {args.title}{replaced}")
    return f"écrit et relu — {' ; '.join(report)}"


def milestone_close(run: Run, args: argparse.Namespace) -> str:
    """`milestone close` : ferme le milestone `--title`, vidé, sauf s'il l'est déjà, puis relit son
    état.

    Raises:
        Refusal: aucun milestone de ce titre, ou il compte encore des issues ouvertes —
            `triage/themes-milestones.md` ne ferme qu'un milestone vidé.
        Divergence: écriture ou relecture en échec, ou état relu autre que `closed`.
    """
    milestone = milestone_titled(run, args.title)
    if milestone is None:
        raise Refusal(f"aucun milestone {args.title}")
    if milestone.state == "closed":
        return f"rien à écrire — milestone {args.title} déjà fermé"
    if milestone.open_issues:
        raise Refusal(
            f"le milestone {args.title} porte encore {milestone.open_issues} issue(s) ouverte(s)"
        )
    path, payload = milestone_path(milestone.number), json_payload(state="closed")
    state = patch_then_reread(run, path, payload, lambda theme: typed(theme, "state", str))
    if state != "closed":
        raise Divergence(f"milestone {args.title} relu {state}, attendu closed")
    return f"fermé et relu — milestone {args.title}"


def origin_url(run: Run) -> str | None:
    """L'URL du remote `origin` du dépôt git courant, `None` s'il n'en a pas.

    Raises:
        Refusal: `git` ne se lance pas, ou échoue autrement qu'en remote introuvable.
    """
    done = launch(run, ORIGIN_URL)
    if done.returncode == NO_SUCH_REMOTE:
        return None
    if done.returncode != 0:
        raise failed(ORIGIN_URL, done)
    return done.stdout.decode("utf-8", "replace").strip()


class Repository(NamedTuple):
    """Ce que `depot create` relit d'un dépôt de la forge : son nom complet, sa visibilité, et les
    URL HTTPS et SSH que `gh` donne à son remote."""

    name: str
    visibility: str
    urls: tuple[str, str]


def repository_of(document: Any) -> Repository:
    """Un dépôt, tel que l'API REST le rend (« Get a repository »).

    Raises:
        KeyError, TypeError: un champ absent ou non textuel (`typed`).
    """
    urls = (typed(document, "clone_url", str), typed(document, "ssh_url", str))
    return Repository(typed(document, "full_name", str), typed(document, "visibility", str), urls)


def repository_gaps(
    repository: Repository, wanted: str, visibility: str, origin: str | None
) -> list[str]:
    """Les écarts du dépôt relu et d'`origin` relu au dépôt `wanted` de visibilité `visibility`.
    Le nom se compare sans la casse : la forge rend le nom canonique. `origin` doit être l'une des
    URL du dépôt — HTTPS ou SSH, selon le `git_protocol` de `gh` (`FormatRemoteURL`)."""
    gaps: list[str] = []
    if repository.name.casefold() != wanted.casefold():
        gaps.append(f"dépôt relu {repository.name}, attendu {wanted}")
    if repository.visibility != visibility:
        gaps.append(f"dépôt {wanted} relu {repository.visibility}, attendu {visibility}")
    if origin not in repository.urls:
        read = "absent" if origin is None else f"relu {origin}"
        gaps.append(f"origin {read}, attendu {' ou '.join(repository.urls)}")
    return gaps


def depot_create(run: Run, args: argparse.Namespace) -> str:
    """`depot create` : crée le dépôt `<propriétaire>/<nom>` sur la forge, privé ou public, et son
    remote `origin` dans le dépôt git courant, par `gh repo create --source=. --remote=origin` ;
    puis relit le dépôt — nom et visibilité — et `origin`.

    Raises:
        Refusal: hors de l'arbre de travail d'un dépôt git, ou `origin` déjà là — son URL nommée.
        Divergence: création ou relecture en échec, ou relecture non conforme
            (`repository_gaps`).
    """
    # Hors d'un dépôt, `git` échoue sans rien écrire sur sa sortie ; dans `.git`, il rend `false`.
    if launch(run, INSIDE_WORK_TREE).stdout.strip() != b"true":
        raise Refusal("hors de l'arbre de travail d'un dépôt git")
    if (origin := origin_url(run)) is not None:
        raise Refusal(f"le remote origin existe déjà : {origin}")
    wanted, visibility = args.repository, args.visibility
    with writing():
        options = (f"--{visibility}", "--source=.", "--remote=origin")
        stdout_of(run, ("gh", "repo", "create", wanted, *options))
        repository = read_json(run, repository_of, f"repos/{wanted}")
        origin = origin_url(run)
    if gaps := repository_gaps(repository, wanted, visibility, origin):
        raise Divergence(" ; ".join(gaps))
    return f"créé et relu — dépôt {repository.name} ({visibility}), origin {origin}"


def issue_number(value: str) -> str:
    """Type argparse : un numéro d'issue ou de PR, chiffres ASCII seulement."""
    if not NUMBER.fullmatch(value):
        raise argparse.ArgumentTypeError(f"numéro d'issue ou de PR attendu, pas {value!r}")
    return value


def owner_repo(value: str) -> str:
    """Type argparse : un dépôt `<propriétaire>/<nom>` (`REPOSITORY`)."""
    if not REPOSITORY.fullmatch(value):
        raise argparse.ArgumentTypeError(f"dépôt <propriétaire>/<nom> attendu, pas {value!r}")
    return value


def label_target(value: str) -> str:
    """Type argparse : `create`, ou un numéro d'issue ou de PR (`issue_number`)."""
    return value if value == "create" else issue_number(value)


def is_one_line(value: str) -> bool:
    """Un texte non vide sur une ligne — il ressort dans une ligne de motif."""
    return bool(value.strip()) and "\n" not in value and "\r" not in value


def one_line(value: str) -> str:
    """Type argparse : un texte non vide sur une ligne (`is_one_line`)."""
    if not is_one_line(value):
        raise argparse.ArgumentTypeError(f"texte non vide sur une seule ligne attendu : {value!r}")
    return value


def build_parser() -> argparse.ArgumentParser:
    """Les sous-commandes du module ; chacune pose son `handler`."""
    parser = argparse.ArgumentParser(
        prog="ecriture-relue.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    commands = parser.add_subparsers(dest="command", required=True)
    label = commands.add_parser("label")
    label.add_argument("number", metavar="<N>|create", type=label_target)
    for option in ("--add", "--remove"):
        label.add_argument(option, type=one_line, action="append", default=[])
    label.add_argument("--mapping", type=Path)
    label.set_defaults(handler=label_command)
    checkbox = commands.add_parser("checkbox").add_subparsers(dest="action", required=True)
    brief = commands.add_parser("brief").add_subparsers(dest="action", required=True)
    for actions, locate in ((checkbox, issue_body), (brief, brief_comment)):
        boxes = actions.add_parser("patch")
        boxes.add_argument("number", type=issue_number)
        edits = boxes.add_mutually_exclusive_group(required=True)
        edits.add_argument("--case", dest="anchors", type=one_line, action="append")
        edits.add_argument("--paires", dest="pairs", type=Path)
        boxes.set_defaults(handler=patch_text, locate=locate)
    pending = checkbox.add_parser("next")
    pending.add_argument("number", type=issue_number)
    pending.set_defaults(handler=next_box)
    write = brief.add_parser("write")
    write.add_argument("number", type=issue_number)
    write.add_argument("--body-file", dest="file", type=Path, required=True)
    write.set_defaults(handler=brief_write)
    issues = commands.add_parser("issue").add_subparsers(dest="action", required=True)
    edit = issues.add_parser("edit")
    edit.add_argument("number", type=issue_number)
    source = edit.add_mutually_exclusive_group(required=True)
    source.add_argument("--append", type=Path)
    source.add_argument("--body-file", type=Path)
    edit.set_defaults(handler=issue_edit)
    create = issues.add_parser("create")
    create.add_argument("--title", type=one_line, required=True)
    create.add_argument("--body-file", dest="file", type=Path, required=True)
    create.add_argument("--label", dest="labels", type=one_line, action="append", default=[])
    create.set_defaults(handler=issue_create)
    close = issues.add_parser("close")
    close.add_argument("number", type=issue_number)
    close.add_argument("--reason", choices=("completed", "not_planned"), default="completed")
    close.set_defaults(handler=issue_close)
    themes = commands.add_parser("milestone").add_subparsers(dest="action", required=True)
    attach = themes.add_parser("attach")
    attach.add_argument("number", type=issue_number)
    attach.add_argument("--title", type=one_line, required=True)
    attach.add_argument("--description", type=one_line)
    attach.set_defaults(handler=milestone_attach)
    close_theme = themes.add_parser("close")
    close_theme.add_argument("--title", type=one_line, required=True)
    close_theme.set_defaults(handler=milestone_close)
    comment = commands.add_parser("comment")
    comment.add_argument("number", type=issue_number)
    comment.add_argument("--body-file", dest="file", type=Path, required=True)
    comment.set_defaults(handler=comment_publish)
    depots = commands.add_parser("depot").add_subparsers(dest="action", required=True)
    new_repository = depots.add_parser("create")
    new_repository.add_argument("repository", metavar="<propriétaire>/<nom>", type=owner_repo)
    visibility = new_repository.add_mutually_exclusive_group(required=True)
    for option in ("private", "public"):
        visibility.add_argument(
            f"--{option}", dest="visibility", action="store_const", const=option
        )
    new_repository.set_defaults(handler=depot_create)
    return parser


def main(argv: Sequence[str], run: Run = default_run) -> int:
    """Point d'entrée ; voir le module pour les sous-commandes et les sorties."""
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
        if args.command == "label" and (misuse := label_misuse(args)):
            parser.error(misuse)
    except SystemExit as stop:
        return stop.code if isinstance(stop.code, int) else 2
    try:
        print(args.handler(run, args))
    except Refusal as refusal:
        print(f"refus — {refusal}")
        return 1
    except Divergence as divergence:
        print(f"relecture non conforme — {divergence}")
        return 1
    return 0


if __name__ == "__main__":
    # Sur un poste dont la page de code est cp1252, Python écrit un tube dans cet encodage : un
    # motif accentué arriverait illisible à la session qui le lit — l'erreur d'argparse, sur la
    # sortie d'erreur, comprise (`pipeline.config.md`, « Qualité »).
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
