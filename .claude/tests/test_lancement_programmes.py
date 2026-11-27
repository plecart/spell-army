"""Chaque script maison qui lance un programme le trouve comme le shell le trouve (#74).

Sous Windows, `CreateProcess` ne lit pas `PATHEXT` : un `.cmd` appelé par son nom nu lève
`[WinError 2]`. Chaque appel `subprocess` qui lance un programme prend donc une forme de `ADMISES`,
lue par `ast` sur la commande passée, ou sur `executable=` qui la remplace — et, quand la fonction
la reçoit en paramètre, là où ses appelants la construisent et dans ce qu'elle lui réaffecte ; un
lanceur injecté se reçoit sous le nom `run` (`run: Run = default_run` dans `main`), et ses
appelants sont les appels `run(...)`. Une commande qui ne se suit pas jusqu'à son programme — lue
de la ligne de commande, d'une boucle, d'un attribut — rougit. Hors
garde : un lancement qui ne s'écrit pas `subprocess.<lanceur>(...)` (`from subprocess import run`,
`os.system`).

Population : `.claude/skills/*/scripts/*.py`, hors `mcp-builder` (skill public). Une forme nouvelle
et légitime s'ajoute à `ADMISES`, avec son motif.

Lancement : `python -m pytest .claude/tests/test_lancement_programmes.py` (ligne `test-pipeline`,
job `pipeline` de la CI).
"""

import ast
from collections.abc import Iterable
from pathlib import Path

import pytest

SKILLS = Path(__file__).parents[1] / "skills"
POPULATION = [
    "cycle-pr/attente-ci.py",
    "cycle-pr/ecriture-relue.py",
    "cycle-pr/erreurs-ci.py",
    "cycle-pr/merge-lot.py",
    "cycle-pr/mutation.py",
    "cycle-pr/porte-merge.py",
    "cycle-pr/restrictions-du-delta.py",
    "cycle-pr/sonde-outillage.py",
    "init-projet/amorcage.py",
    "pr-paralleles/croisement-fichiers.py",
    "schema-architecture/export.py",
]
LANCEURS = {"run", "Popen", "call", "check_call", "check_output"}
EN_DUR = {"git", "gh", "taskkill"}
# Au-delà, une commande passée de fonction en fonction ne se suit plus, et rougit.
PROFONDEUR = 10
ADMISES = {
    "shell=True": "l'interpréteur de commandes résout le programme, `PATHEXT` compris",
    "en dur": f"{sorted(EN_DUR)} sont des `.exe`, que `CreateProcess` trouve sous leur nom nu",
    "shutil.which": "lit `PATHEXT` et rend le chemin du programme, `.cmd` compris",
    "sys.executable": "le chemin absolu de l'interpréteur courant",
}


def argument(appel: ast.Call, nom: str, rang: int) -> ast.AST | None:
    """L'argument `nom`, de rang `rang`, passé par `appel` ; `None` s'il est omis ou suit un
    argument étoilé."""
    for mot in appel.keywords:
        if mot.arg == nom:
            return mot.value
    avant = appel.args[: rang + 1]
    if len(avant) > rang and not any(isinstance(a, ast.Starred) for a in avant):
        return appel.args[rang]
    return None


def affectations(portee: Iterable[ast.AST], nom: str) -> list[tuple[ast.AST, ast.AST]]:
    """Les valeurs affectées à `nom` dans `portee`, chacune avec son affectation, hors celles qui
    ne font que le reprendre (`cmd = list(cmd)`) : elles ne changent pas son programme."""
    reprises = {nom, f"list({nom})", f"tuple({nom})"}
    return [
        (n.value, n) for n in portee
        if isinstance(n, ast.Assign)
        and any(isinstance(c, ast.Name) and c.id == nom for c in n.targets)
        and ast.unparse(n.value) not in reprises
    ]


class Script:
    """Un script lu par `ast`, et ce qu'une commande y peut valoir."""

    def __init__(self, source: str) -> None:
        self.arbre = ast.parse(source)
        self.parents = {e: n for n in ast.walk(self.arbre) for e in ast.iter_child_nodes(n)}
        self.appels = [n for n in ast.walk(self.arbre) if isinstance(n, ast.Call)]

    def lancements(self) -> list[ast.Call]:
        """Les appels `subprocess.<lanceur>(...)`."""
        return [
            a for a in self.appels
            if isinstance(a.func, ast.Attribute) and a.func.attr in LANCEURS
            and isinstance(a.func.value, ast.Name) and a.func.value.id == "subprocess"
        ]

    def appelants(self, fonction: ast.AST) -> list[ast.Call]:
        """Les appels de `fonction` par son nom, et ceux de `run` si elle est injectée."""
        if not isinstance(fonction, ast.FunctionDef):
            return []
        injectee = any(
            isinstance(n, ast.Name) and n.id == fonction.name
            and getattr(self.parents.get(n), "func", None) is not n
            for n in ast.walk(self.arbre)
        )
        noms = {fonction.name, "run"} if injectee else {fonction.name}
        return [a for a in self.appels if isinstance(a.func, ast.Name) and a.func.id in noms]

    def valeurs(self, nom: str, ici: ast.AST) -> list[tuple[ast.AST, ast.AST]]:
        """Ce que `nom` peut valoir en `ici`, chacun avec un nœud de sa portée : pour un
        paramètre, les arguments des appelants et ce que la fonction lui réaffecte ; la valeur
        affectée sinon ; rien si rien ne se suit."""
        noeud = ici
        while noeud in self.parents:
            noeud = self.parents[noeud]
            if isinstance(noeud, (ast.FunctionDef, ast.Lambda)):
                params = [a.arg for a in noeud.args.posonlyargs + noeud.args.args]
                recus = None
                if nom in params:
                    rang = params.index(nom)
                    recus = [(argument(a, nom, rang), a) for a in self.appelants(noeud)]
                elif noeud.args.vararg and noeud.args.vararg.arg == nom:
                    recus = [(ast.Tuple(a.args[len(params):]), a) for a in self.appelants(noeud)]
                if recus is not None:
                    return recus + affectations(ast.walk(noeud), nom)
            if isinstance(noeud, (ast.FunctionDef, ast.Module)):
                portee = noeud.body if isinstance(noeud, ast.Module) else ast.walk(noeud)
                if trouvees := affectations(portee, nom):
                    return trouvees
        return []

    def formes_du_lancement(self, appel: ast.Call) -> list[str | None]:
        """La forme de chaque programme que `appel` peut lancer, `None` pour qui n'en prend
        aucune ; `executable=`, quand il est passé, est le programme lancé."""
        executable = next((mot.value for mot in appel.keywords if mot.arg == "executable"), None)
        if executable is not None:
            return self.formes(executable, appel, programme=True)
        if any(ast.unparse(mot) == "shell=True" for mot in appel.keywords):
            return ["shell=True"]
        return self.formes(argument(appel, "args", 0), appel, programme=False)

    def formes(
        self, valeur: ast.AST | None, ici: ast.AST, programme: bool, profondeur: int = 0
    ) -> list[str | None]:
        """La forme de chaque valeur possible d'une commande — de son programme si `programme` —,
        `None` pour une valeur qui n'en prend aucune."""
        if valeur is None or profondeur > PROFONDEUR:
            return [None]
        suite = profondeur + 1
        if isinstance(valeur, ast.Name):
            return [
                forme
                for v, a in self.valeurs(valeur.id, ici)
                for forme in self.formes(v, a, programme, suite)
            ] or [None]
        if programme:
            if isinstance(valeur, ast.Constant):
                return ["en dur" if valeur.value in EN_DUR else None]
            if ast.unparse(valeur) == "sys.executable":
                return ["sys.executable"]
            # `shutil.which(...)`, ou `shutil.which(...) or <repli>` : l'appel rend le programme.
            if isinstance(valeur, ast.BoolOp) and isinstance(valeur.op, ast.Or):
                valeur = valeur.values[0]
            resolu = isinstance(valeur, ast.Call) and ast.unparse(valeur.func) == "shutil.which"
            return ["shutil.which" if resolu else None]
        if isinstance(valeur, ast.Call) and getattr(valeur.func, "id", None) in ("list", "tuple"):
            return self.formes(valeur.args[0], ici, False, suite)
        if isinstance(valeur, (ast.Tuple, ast.List)) and valeur.elts:
            tete = valeur.elts[0]
            if isinstance(tete, ast.Starred):
                return self.formes(tete.value, ici, False, suite)
            return self.formes(tete, ici, True, suite)
        return [None]


def test_la_population_est_celle_du_recensement():
    trouves = [
        f"{p.parents[1].name}/{p.name}"
        for p in sorted(SKILLS.glob("*/scripts/*.py"))
        if p.parents[1].name != "mcp-builder" and Script(p.read_text(encoding="utf-8")).lancements()
    ]
    assert trouves == POPULATION


@pytest.mark.parametrize("script", POPULATION)
def test_chaque_lancement_trouve_son_programme_comme_le_shell(script):
    skill, nom = script.split("/")
    lu = Script((SKILLS / skill / "scripts" / nom).read_text(encoding="utf-8"))
    hors_forme = [
        appel.lineno for appel in lu.lancements()
        if not set(lu.formes_du_lancement(appel)) <= ADMISES.keys()
    ]
    assert not hors_forme, f"{script}, lignes {hors_forme} : programme hors des formes {ADMISES}"


# Formes de lancement écrites à la main, chacune autour d'une commande `git` en dur : seule la
# forme nommée par le cas décide.
PARAMETRE_REAFFECTE = """
import subprocess
def default_run(cmd):
    cmd = ["pnpm", *cmd]
    return subprocess.run(list(cmd))
def main(argv, run=default_run):
    run(("git", "status"))
"""
EXECUTABLE = """
import subprocess
def lancer():
    return subprocess.run(["git", "status"], executable="pnpm")
"""
WHICH_INUTILISE = """
import shutil, subprocess
def default_run(cmd):
    program = cmd[0] if shutil.which(cmd[0]) else cmd[0]
    return subprocess.run([program, *cmd[1:]])
def main(argv, run=default_run):
    run(("git", "status"))
"""
AUTO_REAFFECTATION = """
import subprocess
def default_run(cmd):
    cmd = list(cmd)
    return subprocess.run(cmd)
def main(argv, run=default_run):
    run(("git", "status"))
"""


@pytest.mark.parametrize(
    ("source", "admise"),
    [
        pytest.param(PARAMETRE_REAFFECTE, False, id="paramètre réaffecté avant le lancement"),
        pytest.param(EXECUTABLE, False, id="programme passé par executable="),
        pytest.param(WHICH_INUTILISE, False, id="shutil.which appelé mais non retenu"),
        pytest.param(AUTO_REAFFECTATION, True, id="paramètre réaffecté à lui-même"),
    ],
)
def test_une_forme_de_lancement_ecrite_a_la_main_est_admise_ou_rougit(source, admise):
    lu = Script(source)
    lancements = lu.lancements()
    assert lancements
    formes = {forme for appel in lancements for forme in lu.formes_du_lancement(appel)}
    assert (formes <= ADMISES.keys()) is admise, formes
