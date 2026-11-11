"""Attend la CI du SHA de tête d'une PR et rend son verdict.

Usage :
    python attente-ci.py <PR> [--delai <secondes>] [--intervalle <secondes>]

`cycle-pr` Étape 5, « Sortir du draft, puis lire le run du SHA de tête » : une PR en draft n'a
aucun run, `gh pr ready` déclenche le premier (`ready_for_review`), puis chaque push le
sien. La session lance ce script en fond après `gh pr ready`, et sa fin la réveille. `--delai`
borne l'attente, 1800 s par défaut ; `--intervalle` espace les lectures, 30 s par défaut — les
valeurs de l'intérim, `timeout 1800 gh run watch <id> --exit-status -i 30`,
décidé par le mainteneur. Deux entiers positifs.

Jusqu'à un verdict ou au délai, chaque tour relit la tête et l'état draft de la PR par le même
appel (`gh pr view <PR> --json headRefOid,isDraft`), puis les runs de ce SHA, `{owner}/{repo}`
remplis par `gh` depuis le dépôt courant :

    gh api "repos/{owner}/{repo}/actions/runs?head_sha=<sha>&event=pull_request"

Il en garde le workflow `CI` et prend le plus récent par `created_at`, trié ici — l'ordre de la
réponse n'est pas lu —, l'identifiant départageant deux créations à la même seconde. Chaque
lecture décode ses octets en UTF-8 explicitement, jamais par la page de code de la console.
Puis :

- PR encore en draft : **draft**, sans lire les runs — aucun ne viendra avant `gh pr ready` ;
- aucun run, ou un run `skipped` : relire toutes les `intervalle` secondes — le run d'un push ou
  du passage en ready peut n'apparaître qu'après la première lecture, et sitôt `gh pr ready` le
  plus récent est encore le run sauté d'un push en draft ; au délai, **aucun run**, ou **sauté**
  si ce run sauté est resté le plus récent ;
- run pas terminé : `gh run watch <id> --exit-status -i <intervalle>`, tué au délai, sa sortie
  jetée et son code ignoré — il sort en 1 sur `failure` comme sur `skipped` (mesuré le
  2026-10-21, gh 2.94.0) —, puis relire ; au moins `intervalle` secondes entre deux lectures d'un
  run qui tourne, sauf la dernière, qui tombe au délai. Délai atteint, run en cours : **délai
  dépassé** ;
- `success` : **vert** ;
- `cancelled` : relire la tête — `concurrency` annule le run d'une PR quand un push arrive. Changée,
  la boucle suit la nouvelle ; inchangée : **annulé sans remplaçant** ;
- toute autre conclusion : **rouge**, avec ses jobs en échec, nom et conclusion
  (`gh run view <id> --json jobs`) — ni `success`, ni `skipped`, ni `cancelled`, ni `neutral`,
  la règle d'`erreurs-ci.py`, vers qui la ligne renvoie.

Une seule ligne sur la sortie standard, `<verdict> — run <id> sur <SHA court>[, détail] →
<suite>` — sans run à nommer, `draft` et `aucun run` disent la PR ou le SHA —, la suite nommant
le paragraphe de `cycle-pr` à suivre : vert, Étape 6 ; draft, `gh pr ready <PR>` d'abord
(Étape 5) ; rouge, `erreurs-ci.py <id>` puis Étape 6, « Trier un rouge » ; aucun run, sauté,
annulé sans remplaçant, Étape 5, « Si aucun run n'apparaît » ; délai dépassé, Étape 6, « CI qui
ne démarre pas ».

**Ce qu'il ne couvre pas.** Les autres workflows et les autres événements que `pull_request`. Ce
que le run a combiné : le trunk que chaque job a fusionné se lit dans sa ligne de fusion, à
l'Étape 7. La page d'état de GitHub et la réouverture de la PR, qui restent à la
session (Étape 5, « Si aucun run n'apparaît »), comme toute relance. Un run
relancé : l'API rend sa dernière tentative et garde son `created_at` — 39559119382, relancé une
fois, y porte `run_attempt` 2 et le `run_started_at` de la tentative 2, dans la liste par
`head_sha` comme seul (mesuré le 2026-10-21) ; relancé quand un run plus récent existe sur le même
SHA, il ne décide pas.

Sortie : 0 vert ; 1 rouge, ou refus (« refus — ») — une lecture `gh` qui ne se lance pas, échoue,
ne rend pas du JSON UTF-8 ou pas la forme attendue —, motif en une ligne ; 2 appel mal formé,
usage sur la sortie d'erreur ; 3 draft, aucun run, sauté, ou annulé sans remplaçant ; 124 délai
dépassé, le code de `timeout`. Python 3.11 ou plus, bibliothèque standard seule ; `gh`
authentifié, lancé depuis le dépôt.
"""

import argparse
import io
import json
import re
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
from typing import Any, NamedTuple

Run = Callable[[Sequence[str], float | None], subprocess.CompletedProcess[bytes]]
Clock = Callable[[], float]
Sleep = Callable[[float], None]

WORKFLOW = "CI"
# `str.isdigit` accepte « ² » : le numéro, qui entre dans une commande, se lit en ASCII.
NUMBER = re.compile(r"[0-9]+")
# La tête entre dans la requête des runs : un SHA hexadécimal, rien d'autre.
SHA = re.compile(r"[0-9a-f]{40}")
# La forme que l'API rend, mesurée ; seule, elle se trie comme le temps qu'elle écrit.
CREATED_AT = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z")
NOT_FAILED = frozenset({"success", "skipped", "cancelled", "neutral"})
NO_RUN = "cycle-pr Étape 5, « Si aucun run n'apparaît »"


class Refusal(Exception):
    """Une lecture de la forge inutilisable ; le message est le motif, en une ligne."""


class WorkflowRun(NamedTuple):
    """Un run, tel que l'API des runs le rend ; `conclusion` est nulle tant qu'il tourne."""

    id: int
    name: str
    status: str
    conclusion: str | None
    created_at: str


class PullRequest(NamedTuple):
    """La tête d'une PR et son état draft, lus par le même appel."""

    head: str
    draft: bool


class Verdict(NamedTuple):
    """La ligne rendue et le code de sortie."""

    line: str
    code: int


def default_run(cmd: Sequence[str], timeout: float | None) -> subprocess.CompletedProcess[bytes]:
    """Lance `cmd` et capture ses sorties **en octets**. `timeout` passé, le processus
    est tué, puis `subprocess.TimeoutExpired` levée."""
    return subprocess.run(list(cmd), capture_output=True, check=False, timeout=timeout)


def launch(
    run: Run, args: Sequence[str], timeout: float | None = None
) -> subprocess.CompletedProcess[bytes]:
    """`gh <args>`, son code de sortie non lu.

    Raises:
        Refusal: `gh` ne se lance pas.
        subprocess.TimeoutExpired: `timeout` passé.
    """
    try:
        return run(("gh", *args), timeout)
    except OSError as error:
        raise Refusal(f"`gh` ne se lance pas : {error}") from error


def read_json(run: Run, parse: Callable[[Any], Any], *args: str) -> Any:
    """Ce que `parse` tire du JSON que rend `gh <args>`, décodé en UTF-8 explicitement.

    Args:
        parse: tire du document les champs attendus ; un champ absent, d'un autre type ou d'une
            autre forme y lève `KeyError`, `TypeError` ou `ValueError`.

    Raises:
        Refusal: la commande ne se lance pas, sort autrement qu'en 0, ne rend pas du JSON UTF-8,
            ou pas la forme que `parse` attend.
    """
    command = " ".join(("gh", *args))
    done = launch(run, args)
    if done.returncode != 0:
        motif = " ".join(done.stderr.decode("utf-8", "replace").split())
        raise Refusal(f"`{command}` a échoué ({done.returncode}) : {motif}")
    try:
        document = json.loads(done.stdout.decode("utf-8"))
    except ValueError as error:
        raise Refusal(f"`{command}` ne rend pas du JSON UTF-8 : {error}") from error
    try:
        return parse(document)
    except (KeyError, TypeError, ValueError) as error:
        raise Refusal(
            f"`{command}` ne rend pas la forme attendue : {type(error).__name__} {error}"
        ) from error


def field(document: Any, name: str, kind: type[object]) -> Any:
    """Le champ `name` de `document`, exactement de type `kind` — un booléen n'est pas un entier.

    Raises:
        KeyError, TypeError: `document` n'est pas un objet, n'a pas le champ, ou le champ est
            d'un autre type.
    """
    value = document[name]
    if type(value) is not kind:
        raise TypeError(f"`{name}` de type {type(value).__name__}")
    return value


def pull_request_of(document: Any) -> PullRequest:
    """La tête et l'état draft que rend `gh pr view --json headRefOid,isDraft`.

    Raises:
        KeyError, TypeError, ValueError: comme `field`, ou une tête qui n'est pas un SHA.
    """
    sha = field(document, "headRefOid", str)
    if not SHA.fullmatch(sha):
        raise ValueError(f"`headRefOid` n'est pas un SHA : {sha!r}")
    return PullRequest(sha, field(document, "isDraft", bool))


def workflow_run(document: Any) -> WorkflowRun:
    """Un run de l'API des runs ; ses cinq champs lus, gardés en présence, type et forme.

    Raises:
        KeyError, TypeError, ValueError: comme `field`, un `created_at` hors de sa forme, ou un
            run terminé sans conclusion.
    """
    status = field(document, "status", str)
    running = document["conclusion"] is None and status != "completed"
    created_at = field(document, "created_at", str)
    if not CREATED_AT.fullmatch(created_at):
        raise ValueError(f"`created_at` hors de la forme AAAA-MM-JJTHH:MM:SSZ : {created_at!r}")
    return WorkflowRun(
        field(document, "id", int),
        field(document, "name", str),
        status,
        None if running else field(document, "conclusion", str),
        created_at,
    )


def ci_runs(document: Any) -> list[WorkflowRun]:
    """Les runs du workflow `CI` que rend l'API des runs."""
    runs: list[Any] = field(document, "workflow_runs", list)
    return [ci for ci in map(workflow_run, runs) if ci.name == WORKFLOW]


def failed_jobs(document: Any) -> list[str]:
    """Les jobs en échec que rend `gh run view --json jobs`, `<nom> (<conclusion>)` chacun, dans
    l'ordre du JSON : ni `success`, ni `skipped`, ni `cancelled`, ni `neutral`.

    Raises:
        KeyError, TypeError: comme `field`, pour un job.
    """
    jobs: list[Any] = field(document, "jobs", list)
    named = [(field(job, "name", str), field(job, "conclusion", str)) for job in jobs]
    return [f"{name} ({conclusion})" for name, conclusion in named if conclusion not in NOT_FAILED]


def pull_request(run: Run, pr: str) -> PullRequest:
    """La tête de la PR `pr` et son état draft."""
    return read_json(run, pull_request_of, "pr", "view", pr, "--json", "headRefOid,isDraft")


def latest(run: Run, sha: str) -> WorkflowRun | None:
    """Le run `CI` le plus récent du SHA `sha` par `created_at`, l'identifiant départageant deux
    créations à la même seconde — l'ordre de la réponse n'est pas lu ; `None` sans run."""
    # ponytail: la première page seule, 30 runs par défaut — elle porte le plus récent tant que
    # l'API rend du plus récent au plus ancien (mesuré les 2026-10-20 et 2026-10-21) ;
    # `&per_page=100` le jour où un SHA dépasse 30 runs `pull_request`.
    path = f"repos/{{owner}}/{{repo}}/actions/runs?head_sha={sha}&event=pull_request"
    runs: list[WorkflowRun] = read_json(run, ci_runs, "api", path)
    return max(runs, key=lambda ci: (ci.created_at, ci.id), default=None)


def watch(run: Run, ci: WorkflowRun, interval: int, timeout: float) -> None:
    """Attend la fin du run `ci` par `gh run watch`, au plus `timeout` secondes. Sa sortie est
    jetée et son code ignoré : il ne distingue pas un rouge d'un saut, l'API en décide."""
    try:
        launch(run, ("run", "watch", str(ci.id), "--exit-status", "-i", str(interval)), timeout)
    except subprocess.TimeoutExpired:
        pass


def short(sha: str) -> str:
    """Le SHA court, ses sept premiers caractères, comme `git log --oneline` sur ce dépôt."""
    return sha[:7]


def subject(ci: WorkflowRun, sha: str) -> str:
    """Le sujet d'une ligne de verdict : `run <id> sur <SHA court>`."""
    return f"run {ci.id} sur {short(sha)}"


def absent_verdict(ci: WorkflowRun | None, sha: str, delay: int) -> Verdict:
    """Le verdict au délai sans run qui compte sur le SHA `sha` : aucun run, ou `ci`, le run sauté
    d'un push en draft resté le plus récent, sans run du passage en ready."""
    if ci is None:
        return Verdict(f"aucun run — aucun run CI sur {short(sha)} en {delay} s → {NO_RUN}", 3)
    return Verdict(
        f"sauté — {subject(ci, sha)}, aucun run du passage en ready en {delay} s → {NO_RUN}", 3
    )


def verdict(run: Run, ci: WorkflowRun, sha: str) -> Verdict:
    """Le verdict d'un run terminé sur le SHA `sha`, sauté excepté (`absent_verdict`)."""
    about = subject(ci, sha)
    if ci.conclusion == "success":
        return Verdict(f"vert — {about} → cycle-pr Étape 6", 0)
    if ci.conclusion == "cancelled":
        return Verdict(f"annulé sans remplaçant — {about} → {NO_RUN}", 3)
    failed: list[str] = read_json(run, failed_jobs, "run", "view", str(ci.id), "--json", "jobs")
    return Verdict(
        f"rouge — {about}, conclusion {ci.conclusion}, jobs en échec :"
        f" {', '.join(failed) or 'aucun'}"
        f" → erreurs-ci.py {ci.id}, puis cycle-pr Étape 6, « Trier un rouge »",
        1,
    )


def wait(run: Run, pr: str, delay: int, interval: int, clock: Clock, sleep: Sleep) -> Verdict:
    """Attend un verdict sur la tête de la PR `pr`, au plus `delay` secondes (voir le module)."""
    deadline = clock() + delay
    while True:
        state = pull_request(run, pr)
        sha = state.head
        if state.draft:
            return Verdict(
                f"draft — PR {pr} encore en draft sur {short(sha)}"
                f" → gh pr ready {pr} d'abord, cycle-pr Étape 5",
                3,
            )
        ci = latest(run, sha)
        remaining = deadline - clock()
        # Sitôt `gh pr ready`, le plus récent est encore le run sauté d'un push en draft : celui du
        # passage en ready n'apparaît qu'après.
        if ci is None or ci.conclusion == "skipped":
            if remaining <= 0:
                return absent_verdict(ci, sha, delay)
            sleep(min(interval, remaining))
        elif ci.status != "completed":
            if remaining <= 0:
                return Verdict(
                    f"délai dépassé — {subject(ci, sha)} encore {ci.status} après {delay} s"
                    " → cycle-pr Étape 6, « CI qui ne démarre pas »",
                    124,
                )
            started = clock()
            watch(run, ci, interval, remaining)
            pause = min(started + interval, deadline) - clock()
            if pause > 0:
                sleep(pause)
        elif ci.conclusion != "cancelled" or pull_request(run, pr).head == sha:
            return verdict(run, ci, sha)


def pr_number(value: str) -> str:
    """Type argparse : un numéro de PR, chiffres ASCII seulement."""
    if not NUMBER.fullmatch(value):
        raise argparse.ArgumentTypeError(f"numéro de PR attendu, pas {value!r}")
    return value


def seconds(value: str) -> int:
    """Type argparse : un nombre entier de secondes, positif — `int` lève sur un texte qui n'en est
    pas un, et argparse en fait une erreur d'usage."""
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError(f"entier positif de secondes attendu, pas {value!r}")
    return number


def build_parser() -> argparse.ArgumentParser:
    """La PR, puis le délai et l'intervalle, en secondes."""
    parser = argparse.ArgumentParser(
        prog="attente-ci.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("pr", type=pr_number)
    parser.add_argument("--delai", type=seconds, default=1800)
    parser.add_argument("--intervalle", type=seconds, default=30)
    return parser


def main(
    argv: Sequence[str],
    run: Run = default_run,
    clock: Clock = time.monotonic,
    sleep: Sleep = time.sleep,
) -> int:
    """Point d'entrée ; voir le module pour les sorties."""
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as stop:
        return stop.code if isinstance(stop.code, int) else 2
    try:
        line, code = wait(run, args.pr, args.delai, args.intervalle, clock, sleep)
    except Refusal as refusal:
        line, code = f"refus — {refusal}", 1
    print(line)
    return code


if __name__ == "__main__":
    # Sur un poste dont la page de code est cp1252, Python écrit un tube dans cet encodage : un
    # verdict accentué arriverait illisible à la session qui le lit — l'erreur d'argparse, sur la
    # sortie d'erreur, comprise (`pipeline.config.md`, « Qualité »).
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
