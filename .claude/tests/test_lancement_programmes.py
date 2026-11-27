"""Chaque script maison qui lance un programme le trouve comme le shell le trouve (#74).

Sous Windows, `CreateProcess` ne lit pas `PATHEXT` : un `.cmd` appelé par son nom nu lève
`[WinError 2]`. Chaque appel `subprocess` qui lance un programme prend donc une forme de `ADMISES`,
lue par `ast` sur la commande passée — et, quand la fonction la reçoit en paramètre, là où ses
appelants la construisent ; un lanceur injecté se reçoit sous le nom `run` (`run: Run =
default_run` dans `main`), et ses appelants sont les appels `run(...)`. Une commande qui ne se suit pas
jusqu'à son programme — lue de la ligne de commande, d'une boucle, d'un attribut — rougit. Hors
garde : un lancement qui ne s'écrit pas `subprocess.<lanceur>(...)` (`from subprocess import run`,
`os.system`).

Population : `.claude/skills/*/scripts/*.py`, hors `mcp-builder` (skill public). Une forme nouvelle
et légitime s'ajoute à `ADMISES`, avec son motif.

Lancement : `python -m pytest .claude/tests/test_lancement_programmes.py` (ligne `test-pipeline`,
job `pipeline` de la CI).
"""

import ast
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


class Script:
    """Un script lu par `ast`, et ce qu'une commande y peut valoir."""

    def __init__(self, chemin: Path) -> None:
        self.arbre = ast.parse(chemin.read_text(encoding="utf-8"))
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
        """Ce que `nom` peut valoir en `ici`, chacun avec un nœud de sa portée : les arguments des
        appelants pour un paramètre, la valeur affectée sinon ; rien si rien ne se suit."""
        noeud = ici
        while noeud in self.parents:
            noeud = self.parents[noeud]
            if isinstance(noeud, (ast.FunctionDef, ast.Lambda)):
                params = [a.arg for a in noeud.args.posonlyargs + noeud.args.args]
                if nom in params:
                    rang = params.index(nom)
                    return [(argument(a, nom, rang), a) for a in self.appelants(noeud)]
                if noeud.args.vararg and noeud.args.vararg.arg == nom:
                    return [(ast.Tuple(a.args[len(params):]), a) for a in self.appelants(noeud)]
            if isinstance(noeud, (ast.FunctionDef, ast.Module)):
                portee = noeud.body if isinstance(noeud, ast.Module) else ast.walk(noeud)
                affectations = [
                    (n.value, n) for n in portee
                    if isinstance(n, ast.Assign)
                    and any(isinstance(c, ast.Name) and c.id == nom for c in n.targets)
                ]
                if affectations:
                    return affectations
        return []

    def formes_du_lancement(self, appel: ast.Call) -> list:
        """La forme de chaque programme que `appel` peut lancer, `None` pour qui n'en prend
        aucune."""
        if any(ast.unparse(mot) == "shell=True" for mot in appel.keywords):
            return ["shell=True"]
        return self.formes(argument(appel, "args", 0), appel, programme=False)

    def formes(
        self, valeur: ast.AST | None, ici: ast.AST, programme: bool, profondeur: int = 0
    ) -> list:
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
            resolu = any(
                isinstance(n, ast.Call) and ast.unparse(n.func) == "shutil.which"
                for n in ast.walk(valeur)
            )
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
        if p.parents[1].name != "mcp-builder" and Script(p).lancements()
    ]
    assert trouves == POPULATION


@pytest.mark.parametrize("script", POPULATION)
def test_chaque_lancement_trouve_son_programme_comme_le_shell(script):
    skill, nom = script.split("/")
    lu = Script(SKILLS / skill / "scripts" / nom)
    hors_forme = [
        appel.lineno for appel in lu.lancements()
        if not set(lu.formes_du_lancement(appel)) <= ADMISES.keys()
    ]
    assert not hors_forme, f"{script}, lignes {hors_forme} : programme hors des formes {ADMISES}"
