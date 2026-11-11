"""Croise les fichiers qu'une PR a mergés avec ceux de chaque branche encore en vol.

Usage :
    python croisement-fichiers.py <PR> <branche> [<branche> …] [--base <référence>]

`pr-paralleles` §7, « Après chaque merge du lot, avant toute consigne aux sessions encore en
vol » : la consigne du lead se fonde sur ce que le merge a réellement livré. `--base` vaut
`origin/main` par défaut, la base que le §7 diffe ; une référence git chacune, non vide et sans `-`
de tête. Dans cet ordre :

1. chaque branche, puis la base, se résout en commit — `git rev-parse --verify --quiet
   <ref>^{commit}` —, sinon refus qui nomme la référence, avant toute lecture de la forge et tout
   `git merge-tree`, qui sort en 1 sur une référence inconnue comme sur un conflit (mesuré le
   2026-10-21, git 2.47.1 : un nom absent comme un arbre qui n'est pas un commit) ;
2. la PR est mergée — `gh pr view <PR> --json state,mergeCommit,baseRefName` —, sinon refus : le
   croisement suit un merge ; son commit de merge, `mergeCommit.oid`, est gardé en 40
   hexadécimaux, et la branche où elle a été mergée, `baseRefName`, en texte ;
3. la base contient ce commit — `git merge-base --is-ancestor <oid> <base>` —, sinon refus qui
   nomme les deux remèdes : `git fetch origin`, ou `--base origin/<baseRefName>` pour une PR
   mergée ailleurs — la PR 142, mergée dans `feat/contexte-court` et croisée contre
   `origin/main`, n'y entrerait par aucun fetch (mesuré le 2026-10-21). Un commit absent du dépôt
   local ne s'y trouve pas non plus, là où `--is-ancestor` sortirait en 128 (mesuré le même
   jour) ;
4. les fichiers mergés, M, sont ceux de `gh pr diff <PR> --name-only` ;
5. pour chaque branche, ses fichiers — `git diff --name-only <base>...<branche>` — et le code de
   `git merge-tree --write-tree --name-only <base> <branche>` : 0 sans conflit, 1 avec, les
   fichiers en conflit étant les lignes entre l'arbre et la première ligne vide.

Sur la sortie standard, la table — une ligne `<fichier> → <branche>, <branche>` par fichier de M
que touche au moins une branche, ou une ligne qui dit qu'aucun ne l'est —, puis une ligne par
branche : `<branche> : merge-tree <code> — sans conflit`, ou `— conflit : <fichiers>`. La consigne
aux sessions reste au lead : le script la lui donne, il ne l'envoie pas. Chaque lecture décode ses
octets en UTF-8 explicitement, jamais par la page de code de la console.

**Ce qu'il ne couvre pas.** Les renommages : `--name-only` rend le nouveau chemin, et un fichier
qu'une branche touche sous l'ancien ne se croise pas. Les fichiers qu'une branche touche hors de M.
La consigne aux sessions et la relance de la CI de leurs branches. Le `fetch` : le script l'exige,
il ne le fait pas. Ce que `git merge-tree` ne voit pas : un conflit de sens sans conflit de texte.
Un chemin hors ASCII : `gh` le rend cité comme git le cite (`core.quotePath` ; `changedFilesNames`
de `pkg/cmd/pr/diff/diff.go`, gh, lu le 2026-10-21), et git le cite pareil tant que
`core.quotePath` garde son défaut, vrai — la rencontre des deux formes n'est pas mesurée.

Sortie : 0 la table rendue, conflits compris ; 1 refus (« refus — ») — une référence introuvable,
une PR non mergée, une base sans son merge, une commande qui ne se lance pas, sort sur un code
inattendu, ne rend pas de l'UTF-8, ou pas le JSON attendu —, motif en une ligne ; 2 appel mal
formé, usage sur la sortie d'erreur. Python 3.11 ou plus, bibliothèque standard seule ; `gh`
authentifié et `git`, lancé depuis le dépôt.
"""

import argparse
import io
import json
import re
import subprocess
import sys
from collections.abc import Callable, Container, Mapping, Sequence
from itertools import takewhile
from typing import Any, NamedTuple

Run = Callable[[Sequence[str]], subprocess.CompletedProcess[bytes]]

# `str.isdigit` accepte « ² » : le numéro, qui entre dans une commande, se lit en ASCII.
NUMBER = re.compile(r"[0-9]+")
# Le commit de merge entre dans des commandes git : un SHA complet, rien d'autre.
SHA = re.compile(r"[0-9a-f]{40}")
PR_FIELDS = "state,mergeCommit,baseRefName"


class Refusal(Exception):
    """Un croisement impossible ; le message est le motif, en une ligne."""


class Merge(NamedTuple):
    """Ce que le script lit de la PR : son état, la branche où elle vise ou a été mergée — nom nu,
    sans `origin/` —, et son commit de merge, `None` tant qu'elle n'est pas mergée."""

    state: str
    target: str
    oid: str | None


def default_run(cmd: Sequence[str]) -> subprocess.CompletedProcess[bytes]:
    """Lance `cmd` dans le répertoire courant et capture ses sorties **en octets**."""
    return subprocess.run(list(cmd), capture_output=True, check=False)


def launch(run: Run, *cmd: str, accepted: Container[int] = (0,)) -> tuple[int, str]:
    """Le code de sortie de `cmd` et sa sortie standard, décodée en UTF-8 explicitement.

    Args:
        accepted: les codes de sortie qui portent une réponse — `(0, 1)` pour un prédicat git.

    Raises:
        Refusal: `cmd` ne se lance pas, sort sur un autre code — motif tiré de sa sortie
            d'erreur, en une ligne —, ou n'écrit pas de l'UTF-8.
    """
    command = " ".join(cmd)
    try:
        done = run(cmd)
    except OSError as error:
        raise Refusal(f"`{cmd[0]}` ne se lance pas : {error}") from error
    if done.returncode not in accepted:
        motif = " ".join(done.stderr.decode("utf-8", "replace").split())
        raise Refusal(f"`{command}` a échoué ({done.returncode}) : {motif}")
    try:
        return done.returncode, done.stdout.decode("utf-8")
    except UnicodeDecodeError as error:
        raise Refusal(f"`{command}` ne rend pas de l'UTF-8 : {error}") from error


def read_json(run: Run, parse: Callable[[Any], Any], *cmd: str) -> Any:
    """Ce que `parse` tire du JSON que rend `cmd`.

    Args:
        parse: tire du document les champs attendus ; un champ absent, d'un autre type ou d'une
            autre forme y lève `KeyError`, `TypeError` ou `ValueError`.

    Raises:
        Refusal: comme `launch`, ou une sortie qui n'est pas du JSON, ou pas la forme que `parse`
            attend.
    """
    command = " ".join(cmd)
    try:
        document = json.loads(launch(run, *cmd)[1])
    except json.JSONDecodeError as error:
        raise Refusal(f"`{command}` ne rend pas du JSON : {error}") from error
    try:
        return parse(document)
    except (KeyError, TypeError, ValueError) as error:
        raise Refusal(
            f"`{command}` ne rend pas la forme attendue : {type(error).__name__} {error}"
        ) from error


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


def merge_of(document: Any) -> Merge:
    """La PR que rend `gh pr view --json state,mergeCommit,baseRefName` ; `mergeCommit` n'est lu
    que sur une PR mergée — `gh` le rend nul sinon (mesuré le 2026-10-21, PR 144 et 138).

    Raises:
        KeyError, TypeError, ValueError: comme `field`, ou un commit qui n'est pas un SHA.
    """
    state = field(document, "state", str)
    target = field(document, "baseRefName", str)
    if state != "MERGED":
        return Merge(state, target, None)
    oid = field(field(document, "mergeCommit", dict), "oid", str)
    if not SHA.fullmatch(oid):
        raise ValueError(f"`mergeCommit.oid` n'est pas un SHA : {oid!r}")
    return Merge(state, target, oid)


def names(run: Run, *cmd: str) -> list[str]:
    """Les chemins que `cmd` écrit, un par ligne, dans son ordre."""
    return launch(run, *cmd)[1].splitlines()


def resolves(run: Run, ref: str) -> bool:
    """`ref` se résout en commit dans le dépôt courant — un nom absent ou un objet d'un autre type
    sort en 1, mesuré."""
    command = ("git", "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}")
    return launch(run, *command, accepted=(0, 1))[0] == 0


def contains(run: Run, base: str, oid: str) -> bool:
    """`base` contient le commit `oid` ; faux aussi quand `oid` est absent du dépôt."""
    if not resolves(run, oid):
        return False
    command = ("git", "merge-base", "--is-ancestor", oid, base)
    return launch(run, *command, accepted=(0, 1))[0] == 0


def conflicts(run: Run, base: str, branch: str) -> tuple[int, list[str]]:
    """Le code de `git merge-tree` de `branch` sur `base` et ses fichiers en conflit, vides en 0.

    Sur 1, la sortie est l'arbre, un fichier en conflit par ligne, une ligne vide, puis des
    messages — doc de `git merge-tree`, « OUTPUT », et mesuré le 2026-10-21. Le code n'est un
    prédicat que sur des références validées (voir le module).
    """
    command = ("git", "merge-tree", "--write-tree", "--name-only", base, branch)
    code, text = launch(run, *command, accepted=(0, 1))
    return code, list(takewhile(bool, text.splitlines()[1:]))


def verdict(branch: str, code: int, files: Sequence[str]) -> str:
    """La ligne de `branch` : `<branche> : merge-tree <code> — sans conflit` ou `— conflit : …`."""
    detail = f"conflit : {', '.join(files)}" if code else "sans conflit"
    return f"{branch} : merge-tree {code} — {detail}"


def table(pr: str, merged: Sequence[str], touched: Mapping[str, set[str]]) -> list[str]:
    """Une ligne `<fichier> → <branches>` par fichier de `merged` que touche au moins une branche
    de `touched`, dans l'ordre de `merged` puis de `touched` ; sans aucune, une ligne qui le dit."""
    rows: list[str] = []
    for path in merged:
        hits = [branch for branch, files in touched.items() if path in files]
        if hits:
            rows.append(f"{path} → {', '.join(hits)}")
    return rows or [f"aucun fichier mergé par #{pr} n'est touché par une branche en vol"]


def cross(run: Run, pr: str, branches: Sequence[str], base: str) -> list[str]:
    """Les lignes de la sortie standard, dans l'ordre du module.

    Raises:
        Refusal: la première condition du module non tenue, ou une lecture inutilisable.
    """
    for ref in (*branches, base):
        if not resolves(run, ref):
            raise Refusal(f"référence introuvable : `{ref}`")
    state, target, oid = read_json(run, merge_of, "gh", "pr", "view", pr, "--json", PR_FIELDS)
    if oid is None:
        raise Refusal(
            f"la PR #{pr} n'est pas mergée ({state}) : le croisement suit un merge,"
            " `pr-paralleles` §7"
        )
    if not contains(run, base, oid):
        raise Refusal(
            f"`{base}` ne contient pas le merge de #{pr} ({oid[:7]}), mergée dans `{target}` :"
            f" `git fetch origin`, ou `--base origin/{target}`"
        )
    merged = names(run, "gh", "pr", "diff", pr, "--name-only")
    touched: dict[str, set[str]] = {}
    verdicts: list[str] = []
    for branch in branches:
        touched[branch] = set(names(run, "git", "diff", "--name-only", f"{base}...{branch}"))
        verdicts.append(verdict(branch, *conflicts(run, base, branch)))
    return table(pr, merged, touched) + verdicts


def pr_number(value: str) -> str:
    """Type argparse : un numéro de PR, chiffres ASCII seulement."""
    if not NUMBER.fullmatch(value):
        raise argparse.ArgumentTypeError(f"numéro de PR attendu, pas {value!r}")
    return value


def reference(value: str) -> str:
    """Type argparse : une référence git, non vide et sans `-` de tête — elle entre en position
    d'argument dans `git merge-tree`, où elle se lirait comme une option."""
    if not value or value.startswith("-"):
        raise argparse.ArgumentTypeError(f"référence git attendue, pas {value!r}")
    return value


def build_parser() -> argparse.ArgumentParser:
    """La PR, les branches en vol, puis la base."""
    parser = argparse.ArgumentParser(
        prog="croisement-fichiers.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("pr", type=pr_number)
    parser.add_argument("branches", nargs="+", type=reference, metavar="branche")
    parser.add_argument("--base", type=reference, default="origin/main")
    return parser


def main(argv: Sequence[str], run: Run = default_run) -> int:
    """Point d'entrée ; voir le module pour les sorties."""
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as stop:
        return stop.code if isinstance(stop.code, int) else 2
    try:
        lines = cross(run, args.pr, args.branches, args.base)
    except Refusal as refusal:
        print(f"refus — {refusal}")
        return 1
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    # Sur un poste dont la page de code est cp1252, Python écrit un tube dans cet encodage : la
    # table, accentuée, arriverait illisible au lead qui la lit — l'erreur d'argparse, sur la
    # sortie d'erreur, comprise (`pipeline.config.md`, « Qualité »).
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
