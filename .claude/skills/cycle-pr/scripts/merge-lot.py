"""Merge une PR de lot dans sa branche d'intégration, sans « go » humain — jamais dans le trunk.

Usage : python merge-lot.py <PR> <SHA de tête vérifié> <base attendue>

C'est la seule voie de merge que `.claude/settings.json` autorise sans invite : `gh pr merge`
reste en `ask`, et ce script le lance lui-même, une fois chaque condition tenue (`cycle-pr`
Étape 7, « Le merge d'un lot »). Il refuse, dans cet ordre :

1. une base attendue égale au trunk — le merge dans le trunk attend toujours un go humain — ou
   qui n'est la tête d'aucune PR d'intégration ouverte vers le trunk, dans ce dépôt, au corps
   ouvert par « En vol pour #N (intégration, n lots) » : une autre branche n'est pas une branche
   d'intégration ;
2. une PR dont la base n'est pas la base attendue, qui n'est plus ouverte, ou encore en draft — le
   passage en ready suit la fermeture de la boucle du relecteur (`cycle-pr` Étapes 4 et 5) ;
3. une tête autre que le SHA vérifié ;
4. une CI qui n'est pas entièrement verte sur cette tête, ou dont aucun job n'a tourné ;
5. un body sans la ligne « Verdict d'avant-go (<SHA de tête>) : rien à corriger » ;
6. une tête qui ne contient pas la tête actuelle de la base, ou qui l'a rejointe par un commit de
   merge. Contenue par un historique linéaire, la base ne change rien à l'arbre : la CI de la tête
   a éprouvé exactement ce que le `--rebase` rejouera, quelle que soit la base que la forge a
   combinée à son dernier run — sans lire la référence de fusion, que la forge recalcule à son
   rythme. Un commit de merge, celui de `gh pr update-branch`, serait abandonné par le
   `--rebase`, et sa résolution avec lui — supposé en relecture, non
   mesuré : le script le refuse avant d'avoir à le savoir. L'argument suppose aussi que la base
   n'est jamais réécrite : « jamais de force-push » de `contraintes.md` ;
7. une conversation qui a bougé depuis le relevé inscrit aux Notes du body : une PR de lot porte
   « En vol », et reçoit donc aussi les commentaires de `repercussions`. Le prédicat
   est `porte-merge.py conversation <PR>`, à côté de ce script, lancé par le même `run`, jamais
   recopié : sorti en 1, la conversation a changé ; sorti autrement qu'en 0, il n'a pas pu
   répondre — relevé absent ou mal formé, `gh` en échec — et le merge est refusé aussi. Il passe
   en dernier, au plus près du merge.

Puis `gh pr merge <PR> --rebase --match-head-commit <SHA>`, que la forge refuse si la tête a bougé
entre-temps.

**Ce qu'il ne prouve pas.** La ligne de verdict est écrite par la session qui l'appelle : le script
exige qu'elle soit inscrite, pour ce SHA, là où `cycle-pr` Étape 7 la fait écrire ; il ne prouve pas
que le vérificateur a tourné. Et le draft levé atteste l'ordre des étapes, pas le contenu de la
relecture.

Sortie : 0 mergé ; 1 refusé, motif en une ligne sur la sortie standard ; 2 appel mal formé.
Python 3.11 ou plus, bibliothèque standard seule ; `gh` authentifié et `git`, lancé depuis le
dépôt.
"""

import io
import json
import re
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

Run = Callable[[Sequence[str]], subprocess.CompletedProcess[str]]

USAGE = "Usage : python merge-lot.py <PR> <SHA de tête vérifié> <base attendue>"
FULL_SHA = re.compile(r"[0-9a-f]{40}")
# `str.isdigit` accepte « ² » : le numéro se lit en chiffres ASCII seulement.
PR_NUMBER = re.compile(r"[0-9]+")
# La première ligne du corps d'une PR d'intégration.
INTEGRATION_MARK = re.compile(r"En vol pour #\d+ \(intégration, \d+ lots\)")
# Une ligne de `statusCheckRollup` est verte sur l'une de ces conclusions. `SKIPPED` : les jobs de
# publication et de déploiement, gardés par `if:`, le rendent sur chaque PR (relevé).
GREEN_CONCLUSIONS = {"SUCCESS", "SKIPPED", "NEUTRAL"}
PR_FIELDS = "baseRefName,headRefOid,isDraft,state,body,statusCheckRollup"
# Le prédicat de conversation du refus 7, à côté de ce script.
PORTE_MERGE = Path(__file__).with_name("porte-merge.py")


class Refusal(Exception):
    """Une condition du merge n'est pas tenue ; le message est le motif, en une ligne."""


def default_run(cmd: Sequence[str]) -> subprocess.CompletedProcess[str]:
    """Lance une commande en capturant ses sorties, décodées en UTF-8 — jamais l'encodage de la
    console, qui lit un body accentué de travers sous Windows."""
    return subprocess.run(list(cmd), capture_output=True, text=True, encoding="utf-8", check=False)


def output(run: Run, *cmd: str) -> str:
    """La sortie standard de la commande, ou un refus si elle échoue ou ne se lance pas : une
    sortie vide d'une commande en échec ne se lit jamais comme une réponse."""
    try:
        done = run(cmd)
    except OSError as error:
        raise Refusal(f"`{cmd[0]}` ne se lance pas : {error}") from error
    if done.returncode != 0:
        raise Refusal(f"`{' '.join(cmd[:3])}` a échoué ({done.returncode}) : {done.stderr.strip()}")
    return done.stdout.strip()


def json_output(run: Run, *cmd: str) -> Any:
    """La sortie JSON de la commande, ou un refus si elle n'en est pas."""
    text = output(run, *cmd)
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        raise Refusal(f"`{' '.join(cmd[:3])}` ne rend pas du JSON : {error}") from error


def integration_refusal(prs: list[dict[str, Any]], base: str, trunk: str) -> str | None:
    """Le motif qui interdit de tenir `base` pour une branche d'intégration, ou `None`.

    Args:
        prs: les PR ouvertes de `base` vers `trunk`, telles que `gh pr list --json` les rend
            (`body`, `isCrossRepository`). `gh pr list --head` n'accepte pas `<owner>:<branche>`
            (`gh pr list --help`, gh 2.94.0) : une PR venue d'un fork, branche homonyme, y figure
            aussi, et ne compte pas.
        base: la base attendue, déjà distincte du trunk.
        trunk: la branche par défaut du dépôt.
    """
    first_lines = [
        (pr["body"].splitlines() or [""])[0].strip() for pr in prs if not pr["isCrossRepository"]
    ]
    if not any(INTEGRATION_MARK.fullmatch(line) for line in first_lines):
        return f"`{base}` n'est la tête d'aucune PR d'intégration ouverte vers `{trunk}`"
    return None


def is_green(check: dict[str, Any]) -> bool:
    """Une ligne de `statusCheckRollup` verte : un `CheckRun` porte sa `conclusion`, vide tant
    qu'il tourne. Un `StatusContext` n'en a pas, donc ne passe jamais — refus du côté sûr ; ce dépôt
    n'en émet aucun (relevé)."""
    return check.get("conclusion") in GREEN_CONCLUSIONS


def pr_refusal(pr: dict[str, Any], sha: str, base: str) -> str | None:
    """Le motif qui interdit de merger cette PR, ou `None` — conditions 2 à 5 du module.

    Args:
        pr: la PR telle que `gh pr view --json` la rend (`PR_FIELDS`).
        sha: le SHA complet de tête que la vérification d'avant-go a vu.
        base: la branche d'intégration attendue.
    """
    if pr["baseRefName"] != base:
        return f"la base de la PR est `{pr['baseRefName']}`, pas `{base}`"
    if pr["state"] != "OPEN":
        return f"la PR n'est pas ouverte ({pr['state']})"
    if pr["isDraft"]:
        return "la PR est encore en draft : la boucle du relecteur n'est pas fermée"
    if pr["headRefOid"] != sha:
        return f"la tête de la PR est {pr['headRefOid']}, pas le SHA vérifié {sha}"
    # ponytail: toutes les lignes du rollup, runs anciens compris — un rouge déjà rejoué par un
    # autre événement refuse encore ; ne garder que la dernière par nom si ce cas se présente.
    # Au moins un `SUCCESS` : un rollup tout `SKIPPED` — l'amorce vide d'une draft, dont la garde
    # `if:` saute chaque job — n'a rien vérifié.
    checks = pr["statusCheckRollup"]
    ran = any(check.get("conclusion") == "SUCCESS" for check in checks)
    if not ran or not all(is_green(check) for check in checks):
        return "la CI n'est pas entièrement verte sur cette tête"
    if f"Verdict d'avant-go ({sha}) : rien à corriger" not in pr["body"]:
        return f"le body ne porte pas le verdict d'avant-go « rien à corriger » pour {sha}"
    return None


def conversation_refusal(run: Run, number: str) -> str | None:
    """Le motif du refus 7, ou `None` : `porte-merge.py conversation <PR>` sorti en 0.

    Sa première ligne fait le motif : sur 1, l'élément le plus ancien postérieur au relevé, ou le
    bilan quand seul le compte a changé ; sinon son refus.
    """
    try:
        done = run([sys.executable, str(PORTE_MERGE), "conversation", number])
    except OSError as error:
        return f"`porte-merge.py` ne se lance pas : {error}"
    if done.returncode == 0:
        return None
    first = (done.stdout.strip() or done.stderr.strip()).split("\n")[0].removeprefix("refus — ")
    if done.returncode == 1:
        return f"conversation changée depuis le relevé : {first}"
    return f"porte de conversation sans réponse ({done.returncode}) : {first}"


def merge(number: str, sha: str, base: str, run: Run) -> None:
    """Vérifie chaque condition du module, dans l'ordre, puis merge.

    Raises:
        Refusal: la première condition non tenue, ou une commande `gh` / `git` en échec.
    """
    trunk = output(
        run, "gh", "repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"
    )
    if base == trunk:
        raise Refusal(
            f"`{base}` est le trunk : son merge attend le go humain de `cycle-pr` Étape 7"
        )
    integration_fields = "body,isCrossRepository"
    prs = json_output(
        run,
        "gh",
        "pr",
        "list",
        "--base",
        trunk,
        "--head",
        base,
        "--state",
        "open",
        "--json",
        integration_fields,
    )
    if motif := integration_refusal(prs, base, trunk):
        raise Refusal(motif)
    pr = json_output(run, "gh", "pr", "view", number, "--json", PR_FIELDS)
    if motif := pr_refusal(pr, sha, base):
        raise Refusal(motif)

    # La tête de la PR se récupère avec la base : `--is-ancestor` ne répond que sur deux objets
    # locaux, et sort sur un code non nul autre que 1 quand il ne peut pas répondre (doc de git ;
    # la valeur exacte n'est pas mesurée). La réf de suivi est nommée en toutes lettres : un refspec
    # configuré qui ne couvre pas la base pourrait la laisser périmée (relecture,
    # non mesuré).
    output(
        run,
        "git",
        "fetch",
        "origin",
        f"+refs/heads/{base}:refs/remotes/origin/{base}",
        f"pull/{number}/head",
    )
    gate = run(["git", "merge-base", "--is-ancestor", f"origin/{base}", sha])
    if gate.returncode == 1:
        raise Refusal(
            f"la tête {sha} ne contient pas la tête actuelle de `{base}` : rebase à demander au "
            "mainteneur (`cycle-pr` Étape 7, « Le merge d'un lot »)"
        )
    if gate.returncode != 0:
        raise Refusal(
            f"porte de fraîcheur sans réponse ({gate.returncode}) : {gate.stderr.strip()}"
        )
    if output(run, "git", "rev-list", "--merges", f"origin/{base}..{sha}"):
        raise Refusal(
            f"la tête {sha} rejoint `{base}` par un commit de merge, que `--rebase` abandonnerait"
        )
    if motif := conversation_refusal(run, number):
        raise Refusal(motif)

    output(run, "gh", "pr", "merge", number, "--rebase", "--match-head-commit", sha)


def main(argv: Sequence[str], run: Run = default_run) -> int:
    """Point d'entrée : `<PR> <SHA de tête vérifié> <base attendue>` ; voir le module."""
    if len(argv) != 3 or not PR_NUMBER.fullmatch(argv[0]) or not FULL_SHA.fullmatch(argv[1]):
        print(USAGE)
        return 2
    number, sha, base = argv
    try:
        merge(number, sha, base, run)
    except Refusal as refusal:
        print(f"refus — {refusal}")
        return 1
    print(f"mergé — PR #{number} dans `{base}`, tête {sha}")
    return 0


if __name__ == "__main__":
    # Sur un poste dont la page de code est cp1252, Python écrit un tube dans cet encodage : le
    # motif, accentué, arriverait illisible à la session qui le lit (mesuré le 2026-10-17 ;
    # commande dans `pipeline.config.md`, « Qualité »).
    if isinstance(stdout := sys.stdout, io.TextIOWrapper):
        stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
