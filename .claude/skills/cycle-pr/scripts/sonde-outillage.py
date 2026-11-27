"""Sonde l'outillage d'un cycle avant son briefing, jusqu'à une écriture.

Usage :
    python sonde-outillage.py [--format "<commande>"] [--test "<commande>"]

`cycle-pr` Étape 1, « Éprouver les outils d'abord » : un outil branché sur un hook, un verrou ou
un jeton ne se révèle qu'à l'opération qui le déclenche, et une commande de lecture prouve que le
binaire répond, jamais que l'opération passera. Le script lance six sondes, de la moins chère à
la plus chère, et s'arrête au premier KO :

1. `arbre propre` — `git status --porcelain --untracked-files=normal` ne rend rien : la sonde de
   commit emporterait ce qui est stagé, le format réécrirait ce qui ne l'est pas. Sans
   `--untracked-files=normal`, une configuration `status.showUntrackedFiles=no` cache un fichier
   non suivi (mesuré le 2026-10-21, git 2.47.1) ;
2. `gh auth status --active` — rend 0 : seul le compte actif de chaque hôte connu compte (manuel
   de `gh auth status` : « on each known GitHub host » ; un hôte GHES en défaut rend donc encore
   1) ; sans `--active`, `gh` rend 1 dès qu'un compte, actif ou non, a un problème
   d'authentification (`--active` mesuré le 2026-10-21, gh 2.94.0 ; un `gh` antérieur à ce
   drapeau le rejetterait, non mesuré) ;
3. `droit de push` — `gh api repos/{owner}/{repo} --jq .permissions.push` rend exactement `true` ;
   `{owner}/{repo}` sont remplis par `gh` depuis le dépôt courant ;
4. `commit de sonde` — `git commit --allow-empty -m "chore: sonde outillage"`, qui déclenche les
   hooks du poste, puis `git reset --soft HEAD~1` ; la tête, relue avant, entre les deux et
   après, doit revenir au SHA d'avant. Un reset en échec laisse le commit de sonde en tête
   (mesuré le 2026-10-21, git 2.47.1, sur un verrou de référence) : la sortie nomme son SHA et
   celui d'avant ;
5. `format` — la commande `--format` rend 0 et laisse l'arbre propre : un format qui réécrit un
   arbre propre dit qu'il n'était pas formaté, et ce qu'il a réécrit reste dans l'arbre ;
6. `test` — la commande `--test` rend 0.

`--format` et `--test` sont des lignes de « Commandes du projet » (`.claude/pipeline.config.md`),
que la session choisit et passe : une option omise saute sa sonde, et la sortie le dit
(`SAUTÉE`) — c'est la forme d'une ligne `n/a` ou marquée `# non vérifiée`. Chacune est découpée
comme par un shell POSIX (`shlex.split`) et lancée sans shell : ni tube, ni redirection, ni `&&`,
ni `\\` — `shlex` le mange (mesuré le 2026-10-21), les chemins s'écrivent avec `/`. Son programme
se résout comme le shell le trouve, `PATHEXT` compris (`default_run`) : sous Windows, un `pnpm` ou
un `npm` installés en `.cmd` se lancent sous leur nom nu. Un `.cmd` passe par `cmd.exe`, qui relit
ses arguments sans échappement (CPython, `Doc/library/subprocess.rst`, « Security
Considerations ») : un `%` y est développé, un `&` ou un `|` interprété dans un argument sans
espace (mesuré le 2026-11-27 sur un `.cmd` témoin, Python 3.12.10). Rien n'est refusé : la
commande vient de `pipeline.config.md`, une entrée de confiance.

Il ne corrige rien : il ne répare pas ce qu'une sonde trouve et ne touche à aucune configuration —
un KO se remonte à l'utilisateur, à qui revient l'arbitrage (`cycle-pr` Étape 1).

**Ce qu'il ne couvre pas.** Un dépôt sans commit : sa tête ne se lit pas, et la sonde de commit
rend KO avant d'écrire. Le premier push et la CI ; la ligne « validation » de `pipeline.config.md` ;
les hooks côté serveur ; le choix des commandes, qui reste à la session.

Sortie : une ligne par sonde, `OK   <nom>`, `KO   <nom>` ou `SAUTÉE <nom>` ; au KO, en retrait,
le motif, puis les `TAIL_LINES` dernières lignes de la sortie de la commande fautive — sortie
standard puis sortie d'erreur —, et arrêt. Code : 0 toutes les sondes OK ou sautées ; 1 au premier
KO ; 2 appel mal formé, usage sur la sortie d'erreur. Python 3.11 ou plus, bibliothèque standard
seule ; lancé depuis la racine du dépôt.
"""

import argparse
import io
import shlex
import shutil
import subprocess
import sys
from collections.abc import Callable, Sequence

Run = Callable[[Sequence[str]], subprocess.CompletedProcess[str]]
Probe = Callable[[Run], object]

STATUS = ("git", "status", "--porcelain", "--untracked-files=normal")
AUTH = ("gh", "auth", "status", "--active")
PUSH = ("gh", "api", "repos/{owner}/{repo}", "--jq", ".permissions.push")
HEAD = ("git", "rev-parse", "HEAD")
COMMIT = ("git", "commit", "--allow-empty", "-m", "chore: sonde outillage")
RESET = ("git", "reset", "--soft", "HEAD~1")
# La fin d'une sortie nomme la cause, et c'est là qu'un lanceur l'écrit ; un rapport de test
# entier la noierait.
TAIL_LINES = 20
# Le détail d'un KO, en retrait sous le nom de sa sonde : aucune ligne rapportée ne se lit comme
# une ligne de sonde.
INDENT = " " * 5


class Ko(Exception):
    """Une sonde échoue : le message est le motif, en une ligne ; `output`, la fin de la sortie
    de la commande fautive, s'il y en a une."""

    def __init__(self, motif: str, output: Sequence[str] = ()) -> None:
        super().__init__(motif)
        self.output = output[-TAIL_LINES:]


def default_run(cmd: Sequence[str]) -> subprocess.CompletedProcess[str]:
    """Lance `cmd` sans shell — un `.cmd` passe toutefois par `cmd.exe`, voir le docstring du
    module — en capturant ses deux sorties, décodées en UTF-8 — jamais la page
    de code de la console, qui lit un accent de travers sous Windows. Un octet qui n'est
    pas de l'UTF-8 devient `\\ufffd` : une sortie mal encodée ne fait pas tomber la sonde qui la
    rapporte.

    Le programme se résout par `shutil.which`, qui lit `PATHEXT` : sous Windows, le `pnpm` d'une
    commande du projet est un `pnpm.CMD` que `CreateProcess` ne trouve pas sous son nom nu
    (`[WinError 2]`, mesuré le 2026-11-27). Introuvable, il part tel quel, et lève `OSError`.
    """
    program = shutil.which(cmd[0]) or cmd[0]
    return subprocess.run(
        [program, *cmd[1:]],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def launch(run: Run, cmd: Sequence[str]) -> subprocess.CompletedProcess[str]:
    """Lance `cmd` et rend le processus terminé.

    Raises:
        Ko: le programme ne se lance pas — introuvable, non exécutable —, ou la commande rend un
            code non nul ; ses sorties standard puis d'erreur deviennent `output`.
    """
    try:
        done = run(cmd)
    except OSError as error:
        raise Ko(f"`{cmd[0]}` ne se lance pas : {error}") from error
    if done.returncode != 0:
        output = done.stdout.splitlines() + done.stderr.splitlines()
        raise Ko(f"`{shlex.join(cmd)}` a échoué ({done.returncode})", output)
    return done


def require_clean(run: Run, motif: str) -> None:
    """Exige un arbre et un index propres, fichiers non suivis compris.

    Raises:
        Ko: `motif`, avec les lignes de `git status --porcelain` qui le rendent sale.
    """
    out = launch(run, STATUS).stdout
    if out.strip():
        raise Ko(motif, out.splitlines())


def probe_clean(run: Run) -> None:
    """Exige l'arbre propre sur lequel les sondes qui écrivent vont tourner."""
    require_clean(
        run,
        "l'arbre ou l'index n'est pas propre : la sonde de commit emporterait ce qui est stagé, "
        "le format réécrirait le reste",
    )


def probe_push(run: Run) -> None:
    """Exige que le compte de `gh` puisse pousser sur le dépôt courant.

    Raises:
        Ko: la réponse n'est pas exactement `true`.
    """
    value = launch(run, PUSH).stdout.strip()
    if value != "true":
        raise Ko(f"`{shlex.join(PUSH)}` rend {value!r}, pas 'true'")


def head(run: Run) -> str:
    """Le SHA de la tête du dépôt courant."""
    return launch(run, HEAD).stdout.strip()


def probe_commit(run: Run) -> None:
    """Commit vide puis reset, la tête relue à chaque pas : une écriture déclenche les hooks
    qu'aucune lecture ne déclenche.

    Raises:
        Ko: la tête ne se lit pas avant le commit (rien n'est écrit) ; le commit est refusé (la
            tête n'a pas bougé) ; la tête ne se lit pas après le commit — le motif dit qu'elle
            porte peut-être encore le commit de sonde, que rien n'a été annulé, et la tête
            d'avant ; le reset échoue — le motif nomme le commit de sonde resté en tête et la tête
            d'avant ; ou la tête, après le reset, n'est pas celle d'avant.
    """
    before = head(run)
    launch(run, COMMIT)
    probe = None
    try:
        probe = head(run)
        launch(run, RESET)
    except Ko as ko:
        left = (
            "la tête porte peut-être encore le commit de sonde, rien n'a été annulé"
            if probe is None
            else f"le commit de sonde {probe} est encore en tête"
        )
        raise Ko(f"{ko} : {left} (tête d'avant : {before})", ko.output) from ko
    if (after := head(run)) != before:
        raise Ko(f"la tête est {after} après la sonde, pas {before} (commit de sonde : {probe})")


def probe_format(run: Run, command: Sequence[str]) -> None:
    """Lance la commande de format sur un arbre propre, puis exige qu'il le soit resté.

    Raises:
        Ko: la commande échoue, ou elle a réécrit l'arbre — le script ne le restaure pas.
    """
    launch(run, command)
    require_clean(run, "le format a réécrit l'arbre propre : il n'était pas formaté")


def probes(fmt: Sequence[str] | None, test: Sequence[str] | None) -> list[tuple[str, Probe | None]]:
    """Les six sondes et leur nom, de la moins chère à la plus chère ; `None` pour une sonde
    sautée, faute de commande."""
    return [
        ("arbre propre", probe_clean),
        ("gh auth status", lambda run: launch(run, AUTH)),
        ("droit de push", probe_push),
        ("commit de sonde", probe_commit),
        ("format", (lambda run: probe_format(run, fmt)) if fmt else None),
        ("test", (lambda run: launch(run, test)) if test else None),
    ]


def command(value: str) -> list[str]:
    """Type argparse : une commande découpée comme par un shell POSIX, au moins un mot, sans
    antislash — le découpage POSIX le mange."""
    if "\\" in value:
        raise argparse.ArgumentTypeError(
            f"antislash dans {value!r} : écrire les chemins avec `/`, le découpage POSIX mange `\\`"
        )
    try:
        parts = shlex.split(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"commande mal citée : {value!r} ({error})") from error
    if not parts:
        raise argparse.ArgumentTypeError(f"commande vide : {value!r}")
    return parts


def build_parser() -> argparse.ArgumentParser:
    """Les deux options du module, chacune facultative."""
    parser = argparse.ArgumentParser(
        prog="sonde-outillage.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--format", type=command, help="commande de format du projet")
    parser.add_argument("--test", type=command, help="commande de test du projet")
    return parser


def main(argv: Sequence[str], run: Run = default_run) -> int:
    """Point d'entrée ; voir le module pour les sondes, la sortie et les codes."""
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as stop:
        return stop.code if isinstance(stop.code, int) else 2
    for name, probe in probes(args.format, args.test):
        if probe is None:
            print(f"SAUTÉE {name}")
            continue
        try:
            probe(run)
        except Ko as ko:
            print(f"KO   {name}")
            for line in (str(ko), *ko.output):
                print(f"{INDENT}{line}")
            return 1
        print(f"OK   {name}")
    return 0


if __name__ == "__main__":
    # Sur un poste dont la page de code est cp1252, Python écrit un tube dans cet encodage : une
    # sortie accentuée arriverait illisible à la session qui la lit — l'erreur d'argparse, sur la
    # sortie d'erreur, comprise (`pipeline.config.md`, « Qualité »).
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
