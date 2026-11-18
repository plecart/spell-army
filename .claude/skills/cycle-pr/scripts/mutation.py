"""Éprouve des tests par mutation : témoin d'abord, puis chaque mutation, fichier restauré octet
pour octet. Le verdict se lit dans le **rapport structuré** du lanceur, jamais dans son code de
sortie — un code de sortie ne nomme pas le test qui a rougi.

Usage : python mutation.py <racine du dépôt> <mutations.json>

`mutations.json` :

    {
      "targets": ["back/tests/test_x.py"],
      "reporter": "junit",
      "label": "test ciblé",
      "stack": "Back",
      "mutations": [
        {"name": "garde retirée", "file": "back/x.py", "old": "if n < 0:", "new": "if False:",
         "expect": ["test_refuse_un_negatif"]}
      ]
    }

- `targets` : ce que la commande reçoit en arguments — le **fichier de test visé**, pas la suite.
- `reporter` : `junit` (pytest), `vitest` ou `playwright` ; défaut `junit`. Une commande du
  projet ne nomme pas toujours son lanceur (`make test`, `pnpm -r test`), donc il se nomme ici
  au lieu d'être deviné.
- `label` : la ligne de « Commandes du projet » à lire, défaut `test ciblé`. La ligne doit
  invoquer le lanceur directement (`pnpm vitest run <chemin>`, `uv run pytest <chemin>`) : les
  options du rapport s'ajoutent à la commande.
- `stack` : la pile, nommée par son titre en gras (`**Back (`back/`)** — …`), défaut `Back` ;
  sans effet quand la section n'a pas de titre de pile — projet à une seule pile.
- `timeout` : borne en secondes de chaque lancement, défaut 900. Une mutation qui fait boucler
  du code synchrone fige le worker Vitest au-delà de son propre délai de test (mesuré le
  2026-11-18 : plus de 300 s sur `dice.ts`) ; c'est alors cette borne qui l'arrête.
- `old` s'écrit en LF : les fins de ligne du fichier muté lui sont appliquées à la lecture.

Tout tient dans ce fichier, racine mise à part : un harnais paramétré par sa ligne de commande
n'est pas transmissible tel quel, et c'est ce qui a fait le réécrire sept fois.

Verdict par mutation : `ROUGE` (tous les attendus ont rougi), `VERT` (au moins un attendu est
resté vert — le test ne tient pas), `PANNE` (`old` absent ou multiple, `new` identique à `old`,
rapport illisible, refus, ou un attendu qui n'a pas tourné — sauté, à faire, absent du rapport :
il n'a ni rougi ni tenu).

Python 3.11 ou plus, bibliothèque standard seule.
"""

import contextlib
import json
import os
import re
import signal
import subprocess
import sys
import tempfile
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, cast
from xml.etree import ElementTree

# Une pile de « Commandes du projet » : `**Back (`back/`)** — vérifiées le …`.
STACK_HEADING = re.compile(r"^\*\*(?P<stack>\w+) \(")
# Une ligne de commande : `- test ciblé   : uv run pytest <chemin|motif>     # commentaire`.
# Le libellé peut contenir un `:` — `format:check` en est un, et un `[^:]+?` le rendait
# introuvable alors que sa ligne existe. Ce qui sépare le libellé de la commande est l'espace
# **avant** le deux-points, que l'alignement du fichier garantit.
COMMAND_LINE = re.compile(r"^- (?P<label>.+?)\s+:\s(?P<command>.+)$")
# Un commentaire de fin de ligne, aligné sur au moins deux espaces — pas un `#` dans une
# commande, qui serait tronquée.
TRAILING_COMMENT = re.compile(r"\s{2,}#.*$")
# Une commande écrite en code : `` `pnpm vitest run <chemin>` (Vitest) `` — seul le code compte.
INLINE_CODE = re.compile(r"^`(?P<code>[^`]+)`")
# Un gabarit à remplir par l'appelant : `<chemin|motif>`.
PLACEHOLDER = re.compile(r"\s*<[^>]+>")
COMMANDS_SECTION = "## Commandes du projet"
UNAVAILABLE = "n/a"


def project_command(config: Path, label: str, stack: str = "Back") -> str:
    """La commande que « Commandes du projet » associe à un libellé, dans une pile donnée.

    Les libellés se répètent d'une pile à l'autre — « test ciblé » existe pour le back, l'infra
    et le front —, donc la pile fait partie de la clé. Une ligne placée avant tout titre de pile
    vaut pour le projet entier et répond quelle que soit la pile demandée : c'est la forme d'un
    projet à une seule pile, qui n'a pas de titre. La recherche est bornée à la section : un
    libellé homonyme ailleurs dans le fichier ne doit pas pouvoir répondre à sa place.

    Args:
        config: le `pipeline.config.md` à lire.
        label: le libellé exact de la ligne, sans ses espaces d'alignement.
        stack: le nom de la pile, tel que son titre en gras le porte ; sans effet sur une
            ligne placée hors de toute pile.

    Returns:
        La commande, commentaire retiré, backticks et annotation qui les suit ôtés, gabarits
        `<…>` ôtés — l'appelant ajoute ses cibles.

    Raises:
        LookupError: aucune ligne pour ce couple, ou une ligne marquée `n/a` — l'étape est
            absente du projet, et la deviner vaudrait moins que s'arrêter.
    """
    inside = False
    current: str | None = None
    for line in config.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            inside = line.strip() == COMMANDS_SECTION
            continue
        if not inside:
            continue
        heading = STACK_HEADING.match(line)
        if heading:
            current = heading.group("stack")
            continue
        found = COMMAND_LINE.match(line)
        if not found or current not in (None, stack) or found.group("label").strip() != label:
            continue
        bare = TRAILING_COMMENT.sub("", found.group("command"))
        code = INLINE_CODE.match(bare)
        command = PLACEHOLDER.sub("", code.group("code") if code else bare).strip()
        if command == UNAVAILABLE:
            raise LookupError(f"« {label} » vaut `n/a` pour la pile {stack} : étape absente")
        return command
    raise LookupError(f"aucune commande « {label} » pour la pile {stack} dans {config}")


# --- Les rapporteurs : demander un rapport structuré, puis le lire ----------------------------
#
# Un code de sortie dit qu'« un » test a rougi, jamais lequel : une mutation neutralisée par
# l'outil muté lui-même a déjà compté comme preuve parce qu'un *autre* test échouait (complément
# du 2026-10-04). D'où la lecture d'un rapport, et la recherche du nom attendu dedans.
#
# Chaque lanceur se nomme dans le fichier de mutations : une commande du projet ne contient pas
# toujours d'indice de son lanceur — « make test », « pnpm -r test » —, et le renifler serait une
# supposition de plus. Ajouter un lanceur = ajouter une entrée ici, rien d'autre.


def junit_outcomes(text: str) -> dict[str, str]:
    """Les états d'un rapport JUnit (`pytest --junitxml`), par `classname::name`.

    L'identifiant n'est jamais découpé : un test paramétré porte son cas entre crochets, espaces
    et deux-points compris, et le tronquer à la première espace rendait seize rouges « VERT ».
    """
    outcomes: dict[str, str] = {}
    for case in ElementTree.fromstring(text).iter("testcase"):
        state = "passed"
        for child in case:
            if child.tag in ("failure", "error"):
                state = "failed"
            elif child.tag == "skipped":
                state = "skipped"
        outcomes[f"{case.get('classname', '')}::{case.get('name', '')}"] = state
    return outcomes


def vitest_outcomes(text: str) -> dict[str, str]:
    """Les états d'un rapport Vitest (`--reporter=json`), par `fullName`.

    Forme mesurée le 2026-10-09 sur le lanceur du dépôt :
    `{"testResults": [{"assertionResults": [{"fullName", "status"}]}]}`.
    """
    report = cast(dict[str, Any], json.loads(text))
    return {
        str(assertion["fullName"]): str(assertion["status"])
        for suite in cast(list[dict[str, Any]], report.get("testResults") or [])
        for assertion in cast(list[dict[str, Any]], suite.get("assertionResults") or [])
    }


# `expected` / `unexpected` est le vocabulaire d'un `test` Playwright, distinct du
# `passed` / `failed` de ses `results`. `flaky` n'est volontairement pas traduit en `failed` : un
# test qui n'a rougi qu'à un essai sur deux n'a pas *attrapé* la mutation, et le compter rouge
# ferait mentir le harnais dans le sens qui l'arrange.
PLAYWRIGHT_STATES = {"expected": "passed", "unexpected": "failed"}


def playwright_specs(suite: Mapping[str, Any], path: str = "") -> Iterator[tuple[str, str]]:
    """Parcourt les `suites` imbriquées d'un rapport Playwright et rend (nom, état) par essai.

    Le nom porte le chemin complet des groupes, puis le nom du projet quand la spec a tourné
    sur plusieurs : les deux projets du dépôt jouent chaque spec, et une clé sans projet en
    perdrait la moitié en silence.
    """
    here = f"{path} > {suite['title']}" if path else str(suite.get("title", ""))
    for spec in cast(list[dict[str, Any]], suite.get("specs") or []):
        tests = cast(list[dict[str, Any]], spec.get("tests") or [])
        for test in tests:
            project = str(test.get("projectName") or "")
            suffix = f" [{project}]" if project and len(tests) > 1 else ""
            state = str(test.get("status", ""))
            yield f"{here} > {spec['title']}{suffix}", PLAYWRIGHT_STATES.get(state, state)
    for nested in cast(list[dict[str, Any]], suite.get("suites") or []):
        yield from playwright_specs(nested, here)


def playwright_outcomes(text: str) -> dict[str, str]:
    """Les états d'un rapport Playwright (`--reporter=json`), par chemin de spec.

    Forme mesurée le 2026-10-09 sur le lanceur du dépôt : `{"suites": [{"title", "specs": [
    {"title", "ok", "tests": [{"projectName", "status", "results": [{"status"}]}]}], "suites"}]}`.
    """
    report = cast(dict[str, Any], json.loads(text))
    return dict(
        pair
        for suite in cast(list[dict[str, Any]], report.get("suites") or [])
        for pair in playwright_specs(suite)
    )


@dataclass(frozen=True)
class Reporter:
    """Comment obtenir d'un lanceur un rapport lisible, et comment l'interpréter.

    Attributes:
        flags: à ajouter à la commande ; `{report}` y vaut le chemin du rapport.
        outcomes: lit le texte du rapport et rend un état par test.
        env: variables d'environnement à poser, `{report}` substitué de même — Playwright ne
            prend pas le chemin de son rapport JSON en option.
    """

    flags: str
    outcomes: Callable[[str], dict[str, str]]
    env: Mapping[str, str] = field(default_factory=dict[str, str])


REPORTERS = {
    "junit": Reporter(' --junitxml="{report}"', junit_outcomes),
    "vitest": Reporter(' --reporter=json --outputFile="{report}"', vitest_outcomes),
    "playwright": Reporter(
        " --reporter=json",
        playwright_outcomes,
        {"PLAYWRIGHT_JSON_OUTPUT_NAME": "{report}"},
    ),
}


# --- Le refus de muter un réglage de sécurité -------------------------------------------------
#
# Le classifieur du mode auto refuse de lancer une suite sur une configuration de sécurité
# affaiblie, et le refus vaut pour toute voie de contournement : un autre outil, un sous-agent,
# un tour ultérieur. La procédure ne peut donc pas aboutir pour la classe de gardes où elle
# compte le plus — celles qui protègent un réglage de sécurité. Le harnais ne tente rien : il
# refuse, et renvoie à la forme qui prouve autant sans toucher au dépôt.

# Chemins dont le contenu *est* un réglage de sécurité. Recensés sur ce dépôt le 2026-10-09,
# après qu'une relecture en a mesuré 12 formes réelles non couvertes par les trois premiers
# motifs. Un projet qui range ses réglages ailleurs ajoute son motif ici.
#
# Appariés **sans égard à la casse**. Le dépôt vit sur des systèmes de fichiers insensibles à la
# casse — NTFS, APFS par défaut — où `.github/WORKFLOWS/ci.yml` désigne exactement le même
# fichier que `.github/workflows/ci.yml`, et traversait le refus. Un refus qu'une majuscule
# contourne n'est pas un refus. Trois appariements composent ce refus : ces 10 motifs de chemin
# et le test de fichier de configuration sont insensibles, les motifs de **contenu** restent
# sensibles — `--SEVERITY` n'est pas une option et `@SHA256:` n'est pas une empreinte, et les
# clés JSON qu'ils cherchent sont elles-mêmes sensibles à la casse.
SECURITY_PATHS = {
    label: re.compile(pattern, re.IGNORECASE)
    for label, pattern in {
        "exception de scanner": r"(^|/)\.trivyignore|pip-audit-exceptions",
        "porte de CI": r"(^|/)\.github/(workflows|actions)/",
        "configuration de Dependabot": r"(^|/)\.github/dependabot\.ya?ml$",
        "propriétaires du code": r"(^|/)CODEOWNERS$",
        "permission d'agent": r"(^|/)settings(\.local)?\.json$|(^|/)\.claude/settings",
        "serveurs MCP": r"(^|/)\.mcp\.json$",
        "hooks de pré-commit": r"(^|/)\.pre-commit-config\.ya?ml$",
        "en-têtes du serveur web": r"(^|/)Caddyfile$",
        "composition de production": r"(^|/)compose([.-][\w.-]+)?\.ya?ml$",
        "réglages de l'application": r"(^|/)config/settings\.py$",
    }.items()
}

# Motifs de **contenu**, cherchés dans `old` et `new` — mais seulement dans un fichier de
# configuration. Appliqués partout, ils refusaient des mutations parfaitement ordinaires :
# mesuré en relecture, 5 cas sur 6, dont le propre recueil de ce script, son propre test de
# refus, et deux épingles de digest dans des modules de support de test. Un refus qui mord sur
# le travail ordinaire est un refus qu'on apprend à contourner.
SECURITY_CONTENTS = {
    "option de blocage d'un scanner": re.compile(
        r"--ignore-unfixed|--exit-code|--severity|--fail-on|--no-verify|--skip-"
    ),
    "épingle d'empreinte": re.compile(r"@sha256:[0-9a-f]{64}"),
    "règle de permission": re.compile(r'"(allow|deny|ask)"\s*:'),
}

# Ce qui compte comme fichier de configuration, pour borner les motifs de contenu ci-dessus.
# Comparés repliés en minuscules, pour la même raison que les chemins ci-dessus : `ci.YML` est
# le même fichier que `ci.yml`, et sortait les motifs de contenu du périmètre.
CONFIGURATION_SUFFIXES = (".yml", ".yaml", ".toml", ".json", ".cfg", ".ini", ".sh", ".ps1", ".env")
CONFIGURATION_NAMES = ("makefile", "justfile", "dockerfile", "caddyfile", "crontab")

ALTERNATIVE = (
    "écrire la garde en fonction sur du texte et la voir rouge sur un recueil de formes "
    "fautives construites en mémoire, à côté du test qui l'applique au dépôt (modèle "
    "`WORKFLOW_FORMS` de `test_supply_chain.py`) — le dépôt n'est jamais affaibli"
)


def is_configuration(target: str) -> bool:
    """Le chemin désigne-t-il un fichier de configuration, au sens des motifs de contenu ?"""
    name = target.rsplit("/", 1)[-1].casefold()
    return name.startswith(CONFIGURATION_NAMES) or name.endswith(CONFIGURATION_SUFFIXES)


def security_refusal(mutation: Mapping[str, Any]) -> str | None:
    """Pourquoi cette mutation est refusée, ou `None` si elle est ordinaire.

    **Une heuristique, pas une frontière.** Elle ne peut pas être complète : le même
    affaiblissement s'obtient par un point de contrôle équivalent qu'aucun motif ne décrit —
    retirer la dépendance d'une cible `make` qui charge les images à scanner affaiblit le scan
    sans qu'aucune option de scanner apparaisse dans le diff. Son office est d'arrêter les
    formes courantes et de **renvoyer à la forme qui prouve autant sans toucher au dépôt** ;
    l'auteur reste responsable de reconnaître les autres. Un refus présenté comme une garantie
    serait plus nuisible que son absence.

    Args:
        mutation: l'entrée `{name, file, old, new, …}` du fichier de mutations.

    Returns:
        Le motif du refus, suivi de la forme à employer à la place, ou `None`.
    """
    # Replié avant appariement : `.github//workflows/ci.yml` et `back/config//settings.py`
    # traversaient le refus, mesuré le 2026-10-09. `PurePosixPath` normalise `//` et `./`.
    target = PurePosixPath(str(mutation.get("file", "")).replace("\\", "/")).as_posix()
    fired = [label for label, pattern in SECURITY_PATHS.items() if pattern.search(target)]
    if is_configuration(target):
        texts = f"{mutation.get('old', '')}\n{mutation.get('new', '')}"
        fired += [label for label, pattern in SECURITY_CONTENTS.items() if pattern.search(texts)]
    if not fired:
        return None
    return f"refus — réglage de sécurité ({', '.join(fired)}) ; à la place : {ALTERNATIVE}"


# --- La boucle : témoin, mutation, restauration, verdict ---------------------------------------

RED = "failed"
SKIPPED = "skipped"
# Les états qui disent « ce test n'a pas tourné ». **Mesurés**, pas supposés : `skipped` par les
# trois rapporteurs, `todo` en plus par Vitest — relevé le 2026-10-10 sur le lanceur du dépôt,
# `it.skip` rendant `skipped` et `it.todo` rendant `todo`. Le `pending` de Jest n'y est pas :
# Vitest ne l'émet pas. Un attendu dans un de ces états est dans l'état exact d'un attendu
# **absent** du rapport — il n'a ni rougi ni tenu —, et il rendait VERT, c'est-à-dire « le test
# ne tient pas », pour un test que personne n'a joué. `flaky` n'en fait pas partie : il a
# tourné, et n'a pas attrapé la mutation de façon fiable.
NOT_RUN = {SKIPPED, "todo"}
CONFIG = Path(".claude") / "pipeline.config.md"
# Une mutation fabrique des boucles sans fin : la condition d'arrêt est ce qu'on vient de casser.
DEFAULT_TIMEOUT = 900
# Le temps laissé aux tubes après que la descendance a été tuée, borné lui aussi.
GRACE_SECONDS = 10


class Unusable(Exception):
    """Une mutation qu'on ne peut pas jouer, avec son motif — jamais un verdict sur le test.

    `old` absent ou trouvé plusieurs fois, aucun rouge attendu nommé, rapport illisible, refus
    d'un réglage de sécurité : dans tous ces cas le test visé n'a rien prouvé ni rien infirmé,
    et les confondre avec un VERT ferait condamner un test que personne n'a éprouvé.
    """


@dataclass(frozen=True)
class Verdict:
    """Le résultat d'une mutation : `ROUGE`, `VERT` ou `PANNE`, et de quoi le relire."""

    verdict: str
    name: str
    detail: str

    def __str__(self) -> str:
        return f"{self.verdict:<6} {self.name} : {self.detail}"


def terminate_tree(process: "subprocess.Popen[str]") -> None:
    """Tue le processus **et toute sa descendance**, sans lever.

    `shell=True` fait de l'enfant direct un interpréteur de commandes : le lanceur — pytest,
    node, make — est toujours un **petit-fils**, que `Popen.kill()` ne touche pas. Mesuré le
    2026-10-09 : un petit-fils en boucle sans fin laissait le harnais bloqué bien au-delà de son
    délai, **le fichier muté sur disque pendant tout ce temps**. `taskkill /T` descend l'arbre
    sous Windows ; ailleurs, le groupe de processus créé au lancement se tue d'un signal.

    « Sans lever » est le contrat, et il porte sur **les deux** voies. Le tueur d'arbre peut
    manquer — `taskkill` hors du `PATH`, groupe de processus hors de portée — et cette panne-là
    est la pire des trois : l'exception sautait le `kill()` qui suit, puis le `raise` qui borne,
    et laissait l'appelant attendre sans délai. Un tueur absent doit coûter une descendance
    survivante, jamais la borne.
    """
    if os.name == "nt":
        with contextlib.suppress(OSError):
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(process.pid)],
                capture_output=True,
                check=False,
            )
    else:  # pragma: no cover — ce poste est Windows ; la CI l'emprunte
        with contextlib.suppress(OSError):
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
    with contextlib.suppress(Exception):
        process.kill()


def run_bounded(command: str, root: Path, environment: Mapping[str, str], timeout: float) -> str:
    """Lance la commande sous le shell, bornée dans le temps, et rend sa sortie d'erreur.

    Le délai porte sur **l'arbre entier** : à l'expiration, la descendance est tuée avant toute
    lecture des tubes. `subprocess.run(timeout=…)` ne suffit pas — il ne tue que l'enfant
    direct, puis attend que les tubes hérités se ferment, ce qu'un petit-fils survivant empêche.

    Aucune attente n'est laissée sans borne, et c'est pourquoi **rien n'est fermé à la main en
    sortie**. Ce qui bloque n'est pas le `wait()` : c'est la **fermeture des tubes**, qui réclame
    le verrou du tampon que le fil lecteur de `communicate` détient tant que la descendance
    écrit. `with Popen(…)` ferme les deux tubes avant d'attendre, donc son bloc `__exit__` paie
    ce verrou ; un `finally` qui les ferme le paie aussi. Mesuré le 2026-10-10, tueur d'arbre
    rendu indisponible, délai de 2 s : la fermeture rend la main à **30 s**, c'est-à-dire la fin
    du petit-fils, contre **12 s** — le délai plus la grâce — quand on ne ferme rien. Le `wait()`
    seul, lui, a été mesuré **inoffensif** : `terminate_tree` ayant tué l'enfant direct, il rend
    la main aussitôt. Et ne rien faire ne fuit pas : le fil lecteur est démon et referme les
    tubes quand la descendance meurt.

    Raises:
        Unusable: le délai est dépassé. L'appelant restaure alors le fichier muté, ce que seul
            un retour — jamais un blocage — lui permet de faire.
    """
    process = subprocess.Popen(
        command,
        cwd=root,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        errors="replace",
        env=dict(environment),
        start_new_session=os.name != "nt",
    )
    try:
        _, errors = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired as expired:
        terminate_tree(process)
        # Second recours borné : les tubes peuvent rester ouverts le temps que la descendance
        # meure, et une attente non bornée ici annulerait tout le propos.
        with contextlib.suppress(subprocess.TimeoutExpired):
            process.communicate(timeout=GRACE_SECONDS)
        raise Unusable(
            f"délai de {timeout:g} s dépassé par « {command} » — processus et descendance tués"
        ) from expired
    return errors


def rewrite(path: Path, data: bytes, when: float) -> None:
    """Écrit le contenu **et fixe** la date de modification du fichier.

    Un cache de compilation s'invalide sur le couple (date, taille) : `__pycache__` pour Python,
    et le même principe pour tout cache de build. Une mutation de **même longueur** écrite dans
    la même seconde ne change ni l'un ni l'autre — le lanceur sert alors la version **témoin**,
    et le harnais rend VERT un test qui tient. Mesuré le 2026-10-09 en CI Linux sur deux
    mutations de longueur identique (`if n < 0:` → `if False:`, `def positive(n):` →
    `def renommee(n):`) ; invisible sur le poste Windows, dont l'horodatage de fichier est plus
    fin. L'erreur va dans le sens qui fait condamner un bon test, donc dépenser une session à
    renforcer ce qui tenait déjà.
    """
    path.write_bytes(data)
    os.utime(path, (when, when))


def positive_seconds(value: object) -> float:
    """Un délai en secondes, strictement positif.

    `int("beaucoup")` levait une `ValueError` nue depuis la construction de la suite, et le lot
    entier s'arrêtait sur une trace. Un booléen est refusé aussi : `True` vaudrait une seconde.

    Raises:
        Unusable: la valeur n'est pas un nombre strictement positif.
    """
    if isinstance(value, bool) or not isinstance(value, int | float) or value <= 0:
        raise Unusable(f"`timeout` : {value!r} n'est pas un nombre de secondes positif")
    return float(value)


def tail(text: str, lines: int = 6) -> str:
    """Les dernières lignes non vides d'une sortie, pour qu'une PANNE dise ce qui a échoué."""
    kept = [line for line in (text or "").splitlines() if line.strip()][-lines:]
    return " / ".join(kept) if kept else "(vide)"


@dataclass(frozen=True)
class Suite:
    """La suite à relancer entre deux mutations : sa commande, ses cibles, son rapporteur."""

    root: Path
    command: str
    reporter: Reporter
    targets: Sequence[str]
    timeout: float = DEFAULT_TIMEOUT

    @classmethod
    def from_spec(cls, root: Path, spec: Mapping[str, Any]) -> "Suite":
        """Construit la suite d'un fichier de mutations, commande lue dans la configuration.

        Raises:
            Unusable: le rapporteur nommé n'existe pas. Une clé inconnue doit rendre un verdict,
                pas une `KeyError` nue sur une entrée écrite à la main.
            LookupError: propagé par `project_command` — le libellé n'existe pas pour cette
                pile, ou la ligne y vaut `n/a`. `play` traduit les deux en PANNE de témoin.
        """
        name = str(spec.get("reporter", "junit"))
        if name not in REPORTERS:
            raise Unusable(f"rapporteur « {name} » inconnu ; connus : {sorted(REPORTERS)}")
        return cls(
            root,
            project_command(
                root / CONFIG, str(spec.get("label", "test ciblé")), str(spec.get("stack", "Back"))
            ),
            REPORTERS[name],
            string_list(spec.get("targets", []), "targets", allow_empty=True),
            positive_seconds(spec.get("timeout", DEFAULT_TIMEOUT)),
        )

    def outcomes(self) -> dict[str, str]:
        """Lance la suite et rend un état par test.

        La commande passe par le shell : celles du projet en sont (`cd front && npm test`,
        `make test`), et les découper en arguments les casserait.

        Raises:
            Unusable: le lanceur n'a produit aucun rapport, a dépassé le délai, ou a produit un
                rapport illisible. Sans rapport exploitable, aucun verdict ne peut nommer le
                test qui a rougi, et un code de sortie n'y suffit pas. **Jamais une exception
                nue** : une mutation au milieu d'un lot abandonnerait les suivantes sur une
                trace au lieu d'un verdict.
        """
        with tempfile.TemporaryDirectory() as folder:
            report = Path(folder) / "report"
            quoted = "".join(f' "{target}"' for target in self.targets)
            environment = (
                dict(os.environ)
                # Pour que nos propres lancements ne déposent pas de cache qu'un lancement
                # suivant servirait — la date du fichier muté est déjà distincte, ceci ferme
                # l'autre côté du même défaut et ne laisse rien derrière.
                | {"PYTHONDONTWRITEBYTECODE": "1"}
                | {name: value.format(report=report) for name, value in self.reporter.env.items()}
            )
            command = self.command + self.reporter.flags.format(report=report) + quoted
            errors = run_bounded(command, self.root, environment, self.timeout)
            if not report.is_file():
                raise Unusable(
                    f"aucun rapport produit par « {command} » — le libellé doit nommer une ligne "
                    f"qui **invoque le lanceur directement** : les options du rapport sont "
                    f"ajoutées à la commande, et une cible `make` ou `just` les refuse. "
                    f"Fin de sa sortie d'erreur : {tail(errors)}"
                )
            try:
                return self.reporter.outcomes(report.read_text(encoding="utf-8"))
            # Large à dessein : trois lecteurs, trois familles d'erreur (`ParseError`,
            # `JSONDecodeError`, `KeyError`), et un rapport tronqué par un lanceur tué en produit
            # d'autres. Ce qui compte est qu'aucune ne s'échappe en abandonnant le lot.
            except Exception as unreadable:
                raise Unusable(f"rapport illisible : {unreadable!r}") from unreadable


def mutated_bytes(path: Path, old: str, new: str) -> tuple[bytes, bytes]:
    """Rend (contenu d'origine, contenu muté), en octets de bout en bout.

    Les fins de ligne du fichier muté commandent celles du motif : les worktrees sont extraits
    en CRLF et l'arbre de l'auteur en LF, donc un `old` écrit en LF n'y serait jamais trouvé.
    Tout passe par des octets — décoder pour remplacer réécrirait le fichier dans un autre
    encodage et changerait ce qu'on prétend n'avoir pas touché.

    Raises:
        Unusable: `old` n'apparaît pas exactement une fois ; le remplacement porterait alors
            sur autre chose que ce que la mutation annonce. Ou le contenu muté est identique à
            l'original : une mutation qui ne mute rien rendrait VERT, le verdict qui se lit
            « l'invariant n'est pas gardé ».
    """
    original = path.read_bytes()
    newline = "\r\n" if b"\r\n" in original else "\n"
    pattern = old.replace("\n", newline).encode("utf-8")
    count = original.count(pattern)
    if count != 1:
        raise Unusable(f"`old` trouvé {count} fois dans {path.name}, il en faut exactement une")
    mutated = original.replace(pattern, new.replace("\n", newline).encode("utf-8"))
    if mutated == original:
        raise Unusable(f"`new` identique à `old` dans {path.name} : la mutation ne mute rien")
    return original, mutated


def resolve(expected: Sequence[str], known: Mapping[str, str]) -> list[str]:
    """Résout chaque fragment de `expect` en **un** nom de test de la suite témoin.

    C'est la symétrie de l'unicité exigée de `old` : le motif muté doit désigner un seul
    endroit, le rouge attendu doit désigner un seul test. Sans elle, l'appariement se fait en
    sous-chaîne sur le nom complet, et deux formes banales rendent ROUGE sans que le test visé
    ait rougi — un frère de préfixe (`…_negatif` apparié par `…_negatif_et_double_le_reste`) et
    le nom du module, qui est une partie de chaque clé. C'est le défaut mesuré le 2026-10-04,
    déplacé du code de sortie vers le nom : un nom ambigu ne nomme rien.

    Args:
        expected: les fragments de `expect`, tels que le fichier de mutations les écrit.
        known: les tests de la suite témoin, par nom complet.

    Returns:
        Un nom complet par fragment, dans l'ordre.

    Raises:
        Unusable: un fragment apparie zéro test — une faute de frappe — ou plusieurs. Un
            identifiant paramétré s'écrit dans sa forme naturelle : l'échappement que pytest
            applique aux non-ASCII est appliqué au fragment avant la comparaison.
    """
    resolved: list[str] = []
    for fragment in expected:
        # pytest échappe les non-ASCII des identifiants paramétrés — `tâche` devient le littéral
        # `t\xe2che` —, et c'est ce nom-là qui arrive dans le rapport comme sur la ligne de
        # commande. Un harnais qui ne sait nommer que l'ASCII laisse hors de sa portée la part de
        # la suite qui en porte — près de trois dixièmes de celle de ce dépôt ; le dénombrement
        # et la commande qui le produit vivent dans
        # `test_un_identifiant_accentue_se_nomme_dans_sa_forme_naturelle`, jamais ici, parce
        # qu'un chiffre recopié dérive au recensement suivant. Le fragment se résout donc tel
        # qu'il est écrit **ou** tel que le lanceur l'écrit, par la transformation même du
        # lanceur ; l'unicité porte sur le résultat, pas sur la forme, et reste donc entière.
        forms = {fragment, fragment.encode("unicode_escape").decode("ascii")}
        matches = sorted({name for name in known for form in forms if form in name})
        if len(matches) != 1:
            raise Unusable(
                f"« {fragment} » apparie {len(matches)} tests de la suite témoin, il en faut "
                f"exactement un{' : ' + str(matches[:3]) if matches else ''}"
            )
        resolved.append(matches[0])
    return resolved


def text_field(entry: Mapping[str, Any], key: str) -> str:
    """La valeur d'une clé obligatoire d'une entrée de mutations, qui doit être une chaîne.

    Le fichier de mutations s'écrit à la main : une clé oubliée ou mal typée doit rendre un
    verdict, pas une `KeyError` nue qui abandonne les mutations suivantes du lot avec une trace.

    Raises:
        Unusable: la clé est absente, ou sa valeur n'est pas textuelle.
    """
    if key not in entry:
        raise Unusable(f"clé « {key} » absente de l'entrée de mutations")
    value = entry[key]
    if not isinstance(value, str):
        raise Unusable(f"clé « {key} » : {type(value).__name__} au lieu d'une chaîne")
    return value


def string_list(value: object, field: str, *, allow_empty: bool = False) -> list[str]:
    """Une liste de chaînes non vides, venue d'un fichier de mutations écrit à la main.

    **Une chaîne est itérable**, et c'est tout le danger : écrite là où une liste est attendue,
    elle est parcourue **caractère par caractère**, et chaque lettre devient un élément. Mesuré
    le 2026-10-09 sur `expect` : `"un"` rendait ROUGE, et `"test_refuse_un_negatiff"` — un nom
    mal orthographié — aussi, parce que sur une suite témoin à un seul test chaque lettre s'y
    résolvait. Le défaut que `resolve` ferme, rouvert par une erreur de type.

    Les **trois** champs de liste du fichier passent par ici — `targets`, `expect`, et les noms
    des `mutations` — parce qu'un constat sur l'un d'eux est un échantillon, pas un inventaire :
    `targets` écrit en chaîne aurait envoyé une lettre par argument au lanceur.

    Args:
        value: la valeur lue dans le fichier.
        field: le nom du champ, pour le message.
        allow_empty: si la liste vide est acceptable.

    Raises:
        Unusable: une chaîne, autre chose qu'une liste, ou une liste contenant autre chose que
            des chaînes non vides.
    """
    if isinstance(value, str):
        raise Unusable(
            f"`{field}` est une chaîne ; il faut une **liste** — une chaîne serait lue lettre "
            f"par lettre, et chaque lettre traitée séparément (ici : {value[:1]!r}, …)"
        )
    if not isinstance(value, list):
        raise Unusable(f"`{field}` : {type(value).__name__} au lieu d'une liste")
    items = cast(list[object], value)
    if not items and not allow_empty:
        raise Unusable(f"`{field}` est vide")
    wrong = [item for item in items if not isinstance(item, str) or not item]
    if wrong:
        raise Unusable(f"`{field}` contient des entrées qui ne sont pas des noms : {wrong}")
    return cast(list[str], items)


def expected_fragments(entry: Mapping[str, Any]) -> list[str]:
    """Les fragments de `expect` — une liste de noms, jamais une chaîne.

    Raises:
        Unusable: `expect` est absent, vide, ou mal typé. Sans rouge attendu nommé, il n'y a
            rien à conclure : c'est le nom qui porte la preuve, pas le code de sortie.
    """
    return string_list(entry.get("expect"), "expect")


def within(root: Path, declared: str) -> Path:
    """Le fichier à muter, à condition qu'il soit **sous** la racine désignée.

    Un `file` absolu, ou qui remonte par `..`, fait muter — et restaurer — hors du worktree
    isolé : dans le clone principal où l'auteur travaille au même moment, voire dans la
    configuration du poste. C'est la rupture d'isolation que la vérification de
    `git rev-parse --show-toplevel` existe pour empêcher, et elle contourne au passage le refus
    de sécurité, qui n'apparie que le chemin déclaré. `Path` ne borne rien : joint à un chemin
    absolu, il le rend tel quel.

    Raises:
        Unusable: le chemin sort de la racine, ou ne désigne aucun fichier.
    """
    base = root.resolve()
    path = (base / declared).resolve()
    if not path.is_relative_to(base):
        raise Unusable(f"« {declared} » sort de la racine {base} — mutation refusée")
    if not path.is_file():
        raise Unusable(f"« {declared} » ne désigne aucun fichier sous {base}")
    links = path.stat().st_nlink
    if links > 1:
        # `resolve()` ne suit pas un lien **dur** : ce n'est pas un lien dans le chemin, c'est le
        # même fichier sous un autre nom. Mesuré le 2026-10-09 : un lien dur créé dans la racine
        # vers un fichier hors racine passait la borne, et l'écriture atteignait bien le fichier
        # extérieur. Les 239 fichiers suivis de ce dépôt ont tous exactement un lien, donc la
        # garde ne coûte rien — git n'en crée pas dans une copie de travail.
        raise Unusable(
            f"« {declared} » porte {links} liens durs : les mêmes octets sont désignés par un "
            f"autre nom, possiblement hors de la racine — mutation refusée"
        )
    return path


def judge(suite: Suite, entry: Mapping[str, Any], witness: Mapping[str, str]) -> Verdict:
    """Joue une mutation et rend son verdict, le fichier restauré octet pour octet.

    Args:
        suite: la suite à relancer sous la mutation.
        entry: l'entrée `{name, file, old, new, expect}` du fichier de mutations.
        witness: les tests de la suite témoin, par nom complet — ce contre quoi `expect` se
            résout, et ce qui rend le verdict opposable à un nom précis.

    Returns:
        `ROUGE` si **tous** les tests résolus depuis `expect` ont rougi, `VERT` si l'un d'eux est
        resté vert — instable compris, qui a tourné sans attraper la mutation de façon fiable —,
        `PANNE` si la mutation n'a pas pu être jouée **ou** si un attendu n'a pas tourné : sauté,
        à faire, ou absent du rapport muté.
    """
    name = str(entry.get("name", "?"))
    try:
        refusal = security_refusal(entry)
        if refusal:
            raise Unusable(refusal)
        aimed = resolve(expected_fragments(entry), witness)
        path = within(suite.root, text_field(entry, "file"))
        original, mutated = mutated_bytes(path, text_field(entry, "old"), text_field(entry, "new"))
        stamp = path.stat().st_mtime
        try:
            rewrite(path, mutated, stamp + 1)
            outcomes = suite.outcomes()
        finally:
            rewrite(path, original, stamp)
    except Unusable as reason:
        return Verdict("PANNE", name, str(reason))

    red = sorted(test for test, state in outcomes.items() if state == RED)
    not_run = [test for test in aimed if outcomes.get(test, SKIPPED) in NOT_RUN]
    if not_run:
        # Une mutation qui empêche la **collecte** fait disparaître le test visé du rapport, et
        # un test sauté y figure sans avoir tourné : les deux états sont le même, et un attendu
        # absent prend donc l'état d'un sauté par défaut. Le compter survivant condamnait un
        # test que personne n'a éprouvé — exactement ce que `Unusable` existe pour distinguer.
        return Verdict("PANNE", name, f"attendus qui n'ont pas tourné : {not_run} ; rouges : {red}")
    survivors = [test for test in aimed if test not in red]
    detail = f"rouges : {red}"
    return Verdict(
        "VERT" if survivors else "ROUGE",
        name,
        f"attendus restés verts : {survivors} ; {detail}" if survivors else detail,
    )


def play(root: Path, spec: Mapping[str, Any]) -> list[Verdict]:
    """Joue toutes les mutations d'un fichier de mutations et rend un verdict par mutation.

    Dans l'ordre : les refus de sécurité, qui n'exécutent rien ; le témoin sur l'arbre propre,
    dont le vert est exigé — un rouge déjà présent ferait passer pour attrapée une mutation que
    rien n'a vue ; puis chaque mutation.

    Args:
        root: la racine du dépôt muté.
        spec: `{targets, mutations, reporter?, label?, stack?}`.

    Returns:
        Un `Verdict` par mutation, dans l'ordre du fichier.
    """
    raw = spec.get("mutations")
    if isinstance(raw, str):
        # Même classe que `targets` et `expect` : une chaîne est itérable, donc lue lettre par
        # lettre, et `.get` serait appelé sur une lettre. Même vocabulaire pour les trois.
        return [Verdict("PANNE", "—", "`mutations` est une chaîne ; il faut une liste d'entrées")]
    if not isinstance(raw, list):
        return [Verdict("PANNE", "—", f"`mutations` : {type(raw).__name__} au lieu d'une liste")]
    entries = cast(list[object], raw)
    if not entries:
        return [Verdict("PANNE", "—", "`mutations` est vide — rien à jouer")]
    wrong = [entry for entry in entries if not isinstance(entry, Mapping)]
    if wrong:
        return [Verdict("PANNE", "—", f"`mutations` contient des entrées non nommables : {wrong}")]
    mutations = cast(list[dict[str, Any]], entries)
    names = [str(entry.get("name", "?")) for entry in mutations]

    try:
        suite = Suite.from_spec(root, spec)
        witness = suite.outcomes()
        already = sorted(test for test, state in witness.items() if state == RED)
        if already:
            raise Unusable(f"rouges déjà présents avant toute mutation : {already}")
    except (Unusable, LookupError) as reason:
        return [Verdict("PANNE", name, f"témoin : {reason}") for name in names]

    # Le refus de sécurité vit dans `judge`, et là seulement. Un court-circuit ici — « si tout
    # est refusé, ne pas lancer le témoin » — épargnait un lancement, mais les deux gardes se
    # masquaient mutuellement : retirer l'une laissait l'autre rendre le même verdict, donc
    # aucun test ne pouvait épingler ni l'une ni l'autre. Mesuré en relecture : les deux
    # mutations correspondantes rendaient VERT. Une seule garde, éprouvable.
    return [judge(suite, entry, witness) for entry in mutations]


def dire(texte: str) -> None:
    """Écrit une ligne sur la sortie standard en octets UTF-8, quelle que soit la console.

    La console du poste est en cp1252 : un nom de mutation, un identifiant de test ou un extrait
    d'ancre portant `→` ou un emoji faisait lever `UnicodeEncodeError` au premier verdict imprimé
    — **après** que toutes les mutations ont tourné, donc en perdant tous les verdicts (mesuré).
    Les octets vont au tampon sans envelopper `sys.stdout` : un
    `TextIOWrapper` collecté ferme le flux qu'il enveloppe, et un appelant en processus — la
    suite de tests — perd sa sortie derrière.

    Args:
        texte: la ligne, sans son saut final.
    """
    sys.stdout.flush()
    sys.stdout.buffer.write(f"{texte}\n".encode())
    sys.stdout.buffer.flush()


def main(argv: Sequence[str]) -> int:
    """Point d'entrée : rend 0 si *toutes* les mutations sont ROUGE, 1 sinon.

    Un seul VERT ou une seule PANNE fait rendre 1 : le harnais est une porte, et une preuve
    partielle n'est pas une preuve.
    """
    if len(argv) != 2:
        dire(__doc__ or "")
        return 2
    verdicts = play(Path(argv[0]), json.loads(Path(argv[1]).read_text(encoding="utf-8")))
    for verdict in verdicts:
        dire(str(verdict))
    caught = sum(1 for verdict in verdicts if verdict.verdict == "ROUGE")
    dire(f"\n{caught}/{len(verdicts)} mutations attrapées")
    return 0 if verdicts and caught == len(verdicts) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
