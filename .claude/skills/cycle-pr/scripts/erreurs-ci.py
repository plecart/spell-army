"""Première ligne d'erreur de chaque step en échec d'un run de CI.

Usage :
    python erreurs-ci.py <run>

`cycle-pr` Étape 6, « Trier un rouge avant de toucher au code » : le premier message d'erreur du
step sépare presque toujours les familles de causes. Le script lit les jobs du run
(`gh run view <run> --json status,conclusion,jobs`), puis le journal de ses steps en échec
(`gh run view <run> --log-failed`, une ligne `<job>\\t<step>\\t<texte>` par ligne de journal) ;
il lit les deux en octets, décodés en UTF-8 explicitement, jamais par la page de code de la
console.

Un job ou un step est **en échec** quand sa conclusion n'est ni `success`, ni `skipped`, ni
`cancelled`, ni `neutral`. L'API REST (« Workflow jobs », schéma `job`) énumère pour un job
`success`, `failure`, `neutral`, `cancelled`, `skipped`, `timed_out` et `action_required`, et rien
pour un step : une conclusion hors de cette liste — `startup_failure`, celle d'une CI qui ne démarre
pas (`cycle-pr` Étape 6) — compte en échec, jamais en silence. Seuls les steps d'un job en échec
sont lus, comme `gh run view --log-failed` ne lit que le journal de ceux-là (cli/cli,
`pkg/cmd/run/view/logs.go`, `populateLogSegments`, branche `trunk` lue le 2026-10-21) ; un step
sans conclusion, `""`, ne compte pas.

Il rend, dans l'ordre des jobs puis des steps du JSON, une ligne par step en échec,
`<job> › <step> : <première ligne d'erreur>` ; un job en échec sans step en échec — démarrage raté
— rend `<job> : aucun step en échec — conclusion <c>`, et un run en échec sans aucun job
`run <id> : aucun job — conclusion <c>`, sans lire le journal.

**Le journal entier d'un job.** Quand `gh` ne sait pas associer le journal en zip à un job, il lit
le journal du job par l'API et le range entier sous le step `UNKNOWN STEP` (`gh run view --help`,
gh 2.94.0). Il en décide job par job, quand aucun step du job n'a de journal dans le zip (même
fichier de cli/cli, `stepLogAvailable`) ; mais une ligne du zip peut aussi n'être associée à
aucun step, et se range sous le même nom (même aide). La section `UNKNOWN STEP` d'un job ne se
lit donc comme son journal entier que si aucun step du job n'a de section propre et qu'elle
porte au moins une ligne `##[group]Run <commande>` ; sinon elle se rend à part, comme toute
autre section. Lue comme journal entier, elle se coupe en segments, chacun ouvert par une de ces
lignes — 39146227001, Infra : 2 076 lignes, douze segments, un seul `##[error]`. Les steps en
échec du job prennent dans l'ordre les segments qui portent une ligne `##[error]`, et leur ligne
nomme le sien : `<erreur> — segment « Run make scan » du journal du job`. Un step sans tel
segment le dit, sans jamais rendre la ligne d'un autre step, et la section qu'il a lue ne se rend
pas à part.

Toute autre section du journal qu'aucun step en échec ne nomme rend sa ligne à la suite, sous son
nom : aucune section ne se perd en silence. Un journal illisible ne fait pas refuser : chaque step
en échec garde sa ligne, qui dit « journal indisponible » et le motif — `gh` en échec
(`log not found: <job>` sur 38944674078, dont les jobs n'ont aucun step), une ligne sans ses trois
champs, ou aucune section au nom du step. Un octet hors UTF-8 n'en fait pas un journal illisible :
il y devient `\\ufffd`.

**La première ligne d'erreur** d'un step se cherche sur ses lignes, BOM, horodatage et séquences
ANSI ôtés, lignes vides et `##[group]` / `##[endgroup]` sautées. Dans un tube, `gh` écrit
l'échappement ANSI en notation `^[` : 0 octet ESC et 12 séquences `^[[…m` sur les journaux de
39521079941, 39562241493, 38936444116 et 38773936466 (mesuré le 2026-10-21, gh 2.94.0) ; la forme
brute `\\x1b[` est ôtée aussi. Dans cet ordre :

(a) la première ligne, dans l'ordre du journal, qui porte un marqueur d'outil :
    - pytest, détail d'assertion `E\\s{2,}\\S` — 38936444116, Back › Tests, ligne 111 ;
    - pytest, résumé court `(FAILED|ERROR) \\S` — `FAILED` à la ligne 165 du même ; `ERROR` sur
      pytest 9.1.1 au poste, le 2026-10-21 ;
    - pip-audit `Found \\d+ known vulnerabilit` — 39562241493, Back › Audit, ligne 587 ;
    - npm audit `\\d+ (\\w+ severity )?vulnerabilit(y|ies)\\b`, ses deux formes de bilan, lues
      dans `npm-audit-report` 7.0.0, `lib/reporters/install.js` : à plusieurs sévérités,
      `6 vulnerabilities (5 moderate, 1 high)` — 39521079941, Front › Audit, ligne 35 ; à une
      seule, `1 high severity vulnerability` — non mesuré sur un run. C'est le même bilan que
      `npm ci` imprime après une installation (`npm-audit-report` 7.0.0, `lib/reporters/detail.js`
      ligne 7, réutilise `install.summary`) : seul, il ne dit pas qu'un audit a rougi ; dans le
      journal entier d'un job, la coupe le restreint au segment en échec ;
    - trivy `Total: [1-9]\\d* \\(` — 39562241493, Infra › Scan, ligne 536 ; le
      `Total: 0 (HIGH: 0, CRITICAL: 0)` d'une cible propre, ligne 141, ne le porte pas ;
(b) sinon la première qui contient `error`, `errors`, `failed`, `failure` ou `fatal` en mot
    entier, casse ignorée, hors la ligne `make: *** [` et l'annotation générique
    `##[error]Process completed with exit code` ;
(c) sinon la première `##[error]`, sinon la `make: *** [`, sinon la dernière ligne.

(a) passe avant (b) : sur 38936444116, (b) seule rend la ligne 86, `failure = "après
l'écriture", …`, du code source que pytest affiche avant l'assertion.

**Ce qu'il ne couvre pas.** Le classement d'un rouge — infrastructure, avis, code —, qui reste à la
session PR. Un outil dont l'erreur ne porte aucun marqueur : il retombe sur (b) ou (c). Les
annotations des jobs, non lues. Un run relancé : seule sa dernière tentative est lue — sans
`--attempt`, `gh run view 39559119382`, relancé une fois, rend les jobs de la tentative 2 et son
journal, octet pour octet (mesuré le 2026-10-21, gh 2.94.0). Deux steps en échec d'un même job
sous un même nom partagent une section. Une section `UNKNOWN STEP` partielle qui porterait une
ligne `##[group]Run `, dans un job dont aucun step en échec n'a de section propre, se lirait comme
le journal entier — jamais observée : les 7 runs de repli réels relevés en
relecture rendaient tous le journal entier. Dans le journal entier d'un job, la
coupe repose sur les en-têtes `##[group]Run ` du runner, mesurés sur 39146227001 : un step qui
écrirait lui-même une ligne `##[group]Run …` serait mal coupé, un step réussi qui écrirait une
ligne `##[error]` prendrait le segment d'un step en échec, et les lignes des steps `Post`, sans
en-tête, restent au segment qui les précède.

Sortie : 0 lignes rendues, sur la sortie standard ; 1 refus (« refus — »), motif en une ligne, sans
lire le journal — `gh` ne se lance pas, la lecture des jobs échoue ou ne rend pas la forme
attendue, le run n'est pas terminé, ou aucun job n'est en échec — un run vert sans job compris,
le run en échec sans job rendant sa ligne ; 2 appel mal formé, usage sur la
sortie d'erreur. Python 3.11 ou plus, bibliothèque standard seule ; `gh` authentifié, lancé depuis
le dépôt.
"""

import argparse
import io
import json
import re
import subprocess
import sys
from collections.abc import Callable, Sequence
from typing import Any, NamedTuple

Run = Callable[[Sequence[str]], subprocess.CompletedProcess[bytes]]
Key = tuple[str, str]
Sections = dict[Key, list[str]]

JOBS_FIELDS = "status,conclusion,jobs"
# `str.isdigit` accepte « ² » : l'identifiant, qui entre dans une commande, se lit en ASCII.
RUN_ID = re.compile(r"[0-9]+")
NOT_FAILED = frozenset({"success", "skipped", "cancelled", "neutral"})
UNAVAILABLE = "journal indisponible"
# Le step sous lequel `gh` range le journal entier d'un job (voir le module).
WHOLE_JOB = "UNKNOWN STEP"
GROUP_OPEN = "##[group]"
SEGMENT_HEADER = f"{GROUP_OPEN}Run "
NO_FAILED_SEGMENT = "journal du job présent, sans segment en échec repérable"

TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?")
ANSI = re.compile(r"(?:\x1b|\^\[)\[[0-9;]*[A-Za-z]")
GROUP = re.compile(r"##\[(?:end)?group\]")
# Les marqueurs d'outil de la règle (a), chacun cité au module avec ce qui le fonde : un run, le
# poste, ou la source de l'outil.
TOOL_MARKERS = (
    re.compile(r"E\s{2,}\S"),
    re.compile(r"(FAILED|ERROR) \S"),
    re.compile(r"Found \d+ known vulnerabilit"),
    re.compile(r"\d+ (\w+ severity )?vulnerabilit(y|ies)\b"),
    re.compile(r"Total: [1-9]\d* \("),
)
ERROR_WORD = re.compile(r"\b(error|errors|failed|failure|fatal)\b", re.IGNORECASE)
MAKE_FAILURE = "make: *** ["
ERROR_ANNOTATION = "##[error]"
EXIT_ANNOTATION = "##[error]Process completed with exit code"


class Refusal(Exception):
    """Une sortie de `gh` inutilisable, ou un run sans rien à rendre ; le message est le motif,
    en une ligne. À la lecture du journal, il devient le motif d'un journal indisponible."""


class Step(NamedTuple):
    """Un step d'un job, tel que `gh run view --json jobs` le rend."""

    name: str
    conclusion: str


class Job(NamedTuple):
    """Un job d'un run, ses steps dans l'ordre du JSON."""

    name: str
    conclusion: str
    steps: list[Step]


class RunState(NamedTuple):
    """Ce que le script lit d'un run."""

    status: str
    conclusion: str
    jobs: list[Job]


def default_run(cmd: Sequence[str]) -> subprocess.CompletedProcess[bytes]:
    """Lance `cmd` et capture ses sorties **en octets** : ni le mode texte ni la page de code de
    la console ne touchent ce qui sort."""
    return subprocess.run(list(cmd), capture_output=True, check=False)


def gh(run: Run, *args: str) -> bytes:
    """La sortie standard de `gh <args>`.

    Raises:
        Refusal: la commande ne se lance pas, ou sort autrement qu'en 0 — sa sortie d'erreur fait
            le motif, ramenée à une ligne.
    """
    cmd = ("gh", *args)
    try:
        done = run(cmd)
    except OSError as error:
        raise Refusal(f"`gh` ne se lance pas : {error}") from error
    if done.returncode != 0:
        motif = " ".join(done.stderr.decode("utf-8", "replace").split())
        raise Refusal(f"`{' '.join(cmd)}` a échoué ({done.returncode}) : {motif}")
    return done.stdout


def field(document: Any, name: str, kind: type[object]) -> Any:
    """Le champ `name` de `document`, exactement de type `kind`.

    Raises:
        KeyError, TypeError: `document` n'est pas un objet, n'a pas le champ, ou le champ est
            d'un autre type.
    """
    value = document[name]
    if type(value) is not kind:
        raise TypeError(f"`{name}` de type {type(value).__name__}")
    return value


def run_state(document: Any) -> RunState:
    """Le run que décrit `gh run view --json status,conclusion,jobs` ; chacun de ses huit champs
    lus est gardé en présence et en type.

    Raises:
        KeyError, TypeError: un champ absent ou d'un autre type.
    """
    return RunState(
        field(document, "status", str),
        field(document, "conclusion", str),
        [
            Job(
                field(job, "name", str),
                field(job, "conclusion", str),
                [
                    Step(field(step, "name", str), field(step, "conclusion", str))
                    for step in field(job, "steps", list)
                ],
            )
            for job in field(document, "jobs", list)
        ],
    )


def read_run(run: Run, run_id: str) -> RunState:
    """Le run `run_id`, lu par `gh run view --json`.

    Raises:
        Refusal: `gh` en échec, une réponse qui n'est pas du JSON UTF-8, ou d'une autre forme.
    """
    args = ("run", "view", run_id, "--json", JOBS_FIELDS)
    command = " ".join(("gh", *args))
    try:
        document = json.loads(gh(run, *args).decode("utf-8"))
    except ValueError as error:
        raise Refusal(f"`{command}` ne rend pas du JSON UTF-8 : {error}") from error
    try:
        return run_state(document)
    except (KeyError, TypeError) as error:
        raise Refusal(
            f"`{command}` ne rend pas la forme attendue : {type(error).__name__} {error}"
        ) from error


def failed(conclusion: str) -> bool:
    """Vrai si `conclusion` est un échec : ni un succès, ni un saut, ni une annulation, ni neutre."""
    return conclusion not in NOT_FAILED


def sections(log: str) -> Sections:
    """Les lignes de `gh run view --log-failed`, rangées par (job, step) dans l'ordre du journal.

    Raises:
        Refusal: une ligne non vide sans ses trois champs séparés par des tabulations.
    """
    found: Sections = {}
    for number, line in enumerate(log.split("\n"), 1):
        if not line:
            continue
        fields = line.split("\t", 2)
        if len(fields) != 3:
            raise Refusal(
                f"la ligne {number} du journal n'a pas la forme `<job>\\t<step>\\t<texte>`"
            )
        job, step, rest = fields
        found.setdefault((job, step), []).append(rest)
    return found


def read_log(run: Run, run_id: str) -> tuple[Sections, str]:
    """Les sections du journal des steps en échec, et ce que rend un step en échec qui n'y a pas
    de section : un journal illisible ne fait pas refuser, il n'a aucune section."""
    try:
        log = gh(run, "run", "view", run_id, "--log-failed").decode("utf-8", "replace")
        return sections(log), f"{UNAVAILABLE} — aucune section du journal à son nom"
    except Refusal as refusal:
        return {}, f"{UNAVAILABLE} — {refusal}"


def cleaned(line: str) -> str:
    """Le texte d'une ligne du journal sans BOM, horodatage, séquence ANSI ni blanc autour."""
    return ANSI.sub("", TIMESTAMP.sub("", line.removeprefix("\ufeff"), count=1)).strip()


def tool_marker(line: str) -> bool:
    """Règle (a) : la ligne porte un marqueur d'outil."""
    return any(marker.match(line) for marker in TOOL_MARKERS)


def error_word(line: str) -> bool:
    """Règle (b) : la ligne nomme une erreur, hors `make: *** [` et l'annotation générique."""
    return bool(ERROR_WORD.search(line)) and not line.startswith((MAKE_FAILURE, EXIT_ANNOTATION))


# Les règles de la première ligne d'erreur, dans leur ordre ; la dernière ligne vient après.
RULES: tuple[Callable[[str], bool], ...] = (
    tool_marker,
    error_word,
    lambda line: line.startswith(ERROR_ANNOTATION),
    lambda line: line.startswith(MAKE_FAILURE),
)


def first_error(texts: Sequence[str]) -> str:
    """La première ligne d'erreur d'une section : la première ligne que satisfait la première
    règle qui en trouve une (`RULES`), sinon la dernière ligne."""
    lines = [line for text in texts if (line := cleaned(text)) and not GROUP.match(line)]
    if not lines:
        return "section du journal sans ligne non vide"
    return next((line for rule in RULES for line in lines if rule(line)), lines[-1])


def opens_segment(text: str) -> bool:
    """Vrai si la ligne, nettoyée, commence par `##[group]Run ` : l'en-tête d'un segment."""
    return cleaned(text).startswith(SEGMENT_HEADER)


def whole_job(job: Job, found: Sections) -> bool:
    """Vrai si la section `UNKNOWN STEP` du job est son journal entier (voir le module) : aucun
    step du job n'a de section propre, et elle porte au moins un en-tête `##[group]Run `."""
    if any((job.name, step.name) in found for step in job.steps):
        return False
    return any(opens_segment(text) for text in found.get((job.name, WHOLE_JOB), []))


def failed_segments(texts: Sequence[str]) -> list[list[str]]:
    """Les segments du journal entier d'un job qui portent une ligne `##[error]`, dans l'ordre.
    Un segment s'ouvre à son en-tête (`opens_segment`) ; les lignes qui précèdent le premier n'en
    forment aucun."""
    segments: list[list[str]] = []
    for text in texts:
        if opens_segment(text):
            segments.append([])
        if segments:
            segments[-1].append(text)
    return [
        segment
        for segment in segments
        if any(cleaned(text).startswith(ERROR_ANNOTATION) for text in segment)
    ]


def segment_error(segment: Sequence[str] | None) -> str:
    """La première ligne d'erreur d'un segment, qui nomme son en-tête ; sans segment, le dit."""
    if segment is None:
        return NO_FAILED_SEGMENT
    header = cleaned(segment[0]).removeprefix(GROUP_OPEN)
    return f"{first_error(segment)} — segment « {header} » du journal du job"


def step_line(job: str, step: str, error: str) -> str:
    """La ligne d'un step : `<job> › <step> : <erreur>`."""
    return f"{job} › {step} : {error}"


def job_lines(job: Job, found: Sections, missing: str) -> tuple[list[str], set[Key]]:
    """Les lignes d'un job en échec, et les sections du journal qu'elles ont lues.

    Un step en échec lit sa section propre, sinon le segment en échec suivant du journal entier
    de son job quand `gh` l'a rendu (`whole_job`), sinon rend `missing`.
    """
    steps = [step for step in job.steps if step.conclusion and failed(step.conclusion)]
    if not steps:
        return [f"{job.name} : aucun step en échec — conclusion {job.conclusion}"], set()
    whole = (job.name, WHOLE_JOB)
    whole_log = whole_job(job, found)
    segments = iter(failed_segments(found.get(whole, [])))
    lines: list[str] = []
    read: set[Key] = set()
    for step in steps:
        own = (job.name, step.name)
        if own in found:
            read.add(own)
            error = first_error(found[own])
        elif whole_log:
            read.add(whole)
            error = segment_error(next(segments, None))
        else:
            error = missing
        lines.append(step_line(job.name, step.name, error))
    return lines, read


def report(jobs: Sequence[Job], found: Sections, missing: str) -> list[str]:
    """Les lignes rendues, dans l'ordre des jobs en échec puis de leurs steps, puis les sections
    du journal qu'aucune n'a lues.

    Args:
        found: les sections du journal (`sections`).
        missing: ce que rend un step en échec sans section.
    """
    lines: list[str] = []
    read: set[Key] = set()
    for job in jobs:
        if failed(job.conclusion):
            job_rendered, job_read = job_lines(job, found, missing)
            lines += job_rendered
            read |= job_read
    lines += [
        step_line(job, step, first_error(texts))
        for (job, step), texts in found.items()
        if (job, step) not in read
    ]
    return lines


def errors(run: Run, run_id: str) -> list[str]:
    """Les lignes du run `run_id` (voir le module).

    Raises:
        Refusal: les jobs ne se lisent pas, le run n'est pas terminé, ou aucun job n'est en
            échec hors d'un run en échec sans job — le journal n'est alors pas lu.
    """
    state = read_run(run, run_id)
    if state.status != "completed":
        raise Refusal(
            f"run {run_id} pas terminé (status {state.status}) : l'attendre par `attente-ci.py`"
        )
    if not state.jobs and failed(state.conclusion):
        return [f"run {run_id} : aucun job — conclusion {state.conclusion}"]
    if not any(failed(job.conclusion) for job in state.jobs):
        raise Refusal(f"aucun job en échec dans le run {run_id} (conclusion {state.conclusion})")
    found, missing = read_log(run, run_id)
    return report(state.jobs, found, missing)


def run_id(value: str) -> str:
    """Type argparse : un identifiant de run, chiffres ASCII seulement."""
    if not RUN_ID.fullmatch(value):
        raise argparse.ArgumentTypeError(f"identifiant de run attendu, pas {value!r}")
    return value


def build_parser() -> argparse.ArgumentParser:
    """L'unique argument du script : le run."""
    parser = argparse.ArgumentParser(
        prog="erreurs-ci.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("run", type=run_id)
    return parser


def main(argv: Sequence[str], run: Run = default_run) -> int:
    """Point d'entrée ; voir le module pour les sorties."""
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as stop:
        return stop.code if isinstance(stop.code, int) else 2
    try:
        print("\n".join(errors(run, args.run)))
    except Refusal as refusal:
        print(f"refus — {refusal}")
        return 1
    return 0


if __name__ == "__main__":
    # Sur un poste dont la page de code est cp1252, Python écrit un tube dans cet encodage : un
    # nom de job accentué arriverait illisible à la session qui le lit — l'erreur d'argparse, sur
    # la sortie d'erreur, comprise (`pipeline.config.md`, « Qualité »).
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
