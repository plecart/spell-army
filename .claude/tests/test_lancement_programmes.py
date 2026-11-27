"""Chaque script maison qui lance un programme le trouve comme le shell le trouve (#74).

Sous Windows, `CreateProcess` ne lit pas `PATHEXT` : un `.cmd` appelé par son nom nu lève
`[WinError 2]`. Chaque appel `subprocess` qui lance un programme prend donc une forme de `ADMISES`,
lue par `ast` sur la commande passée, ou sur `executable=` qui la remplace hors `shell=True` — et,
quand la fonction la reçoit en paramètre, là où ses appelants la construisent et dans ce qu'elle
lui réaffecte ; un lanceur injecté se reçoit sous le nom `run` (`run: Run = default_run` dans
`main`), et ses appelants sont les appels `run(...)`. Une commande qui ne se suit pas jusqu'à son
programme — lue de la ligne de commande, d'une boucle, d'un attribut, ou réécrite autrement que
par une affectation simple (`Script.reecrit`) — rougit. Hors garde : un lancement qui ne s'écrit
pas `subprocess.<lanceur>(...)` (`from subprocess import run`, `os.system`).

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
    reprises = {nom, f"list({nom})", f"tuple({nom})", f"[*{nom}]"}
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

    def reecrit(self, fonction: ast.AST, nom: str) -> bool:
        """`fonction` écrit `nom` autrement que par une affectation simple — cible annotée,
        augmentée, déstructurée, de boucle ou de `:=`, indice écrit, méthode appelée : une
        réécriture que la garde ne suit pas, et qui la fait rougir."""
        for n in ast.walk(fonction):
            if isinstance(n, ast.Name) and n.id == nom and isinstance(n.ctx, ast.Store):
                if n not in getattr(self.parents[n], "targets", ()):
                    return True
            elif isinstance(n, ast.Subscript) and not isinstance(n.ctx, ast.Load):
                if ast.unparse(n.value) == nom:
                    return True
            elif isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute):
                if ast.unparse(n.func.value) == nom:
                    return True
        return False

    def valeurs(self, nom: str, ici: ast.AST) -> list[tuple[ast.AST | None, ast.AST]]:
        """Ce que `nom` peut valoir en `ici`, chacun avec un nœud de sa portée : pour un
        paramètre, les arguments des appelants, ce que la fonction lui réaffecte, et `None` si
        elle le réécrit autrement ; la valeur affectée sinon ; rien si rien ne se suit."""
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
                    reecrit = [(None, noeud)] if self.reecrit(noeud, nom) else []
                    return recus + affectations(ast.walk(noeud), nom) + reecrit
            if isinstance(noeud, (ast.FunctionDef, ast.Module)):
                portee = noeud.body if isinstance(noeud, ast.Module) else ast.walk(noeud)
                if trouvees := affectations(portee, nom):
                    return trouvees
        return []

    def formes_du_lancement(self, appel: ast.Call) -> list[str | None]:
        """La forme de chaque programme que `appel` peut lancer, `None` pour qui n'en prend
        aucune ; hors `shell=True`, un `executable=` autre que `None` est le programme lancé."""
        if any(ast.unparse(mot) == "shell=True" for mot in appel.keywords):
            return ["shell=True"]
        for mot in appel.keywords:
            if mot.arg == "executable" and ast.unparse(mot.value) != "None":
                return self.formes(mot.value, appel, programme=True)
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


def lancement(arguments: str) -> str:
    """Un script qui lance `subprocess.run(<arguments>)`."""
    return f"import subprocess\nsubprocess.run({arguments})\n"


def lanceur(*corps: str, lance: str = "list(cmd)") -> str:
    """Un `default_run(cmd)` qui exécute `corps`, puis lance `lance` ; injecté sous `run`, il
    reçoit une commande `git` en dur : seule la forme que `corps` écrit décide."""
    return "\n".join([
        "import shutil, subprocess",
        "def default_run(cmd):",
        *(f"    {ligne}" for ligne in corps),
        f"    return subprocess.run({lance})",
        "def main(argv, run=default_run):",
        '    run(("git", "status"))',
    ])


@pytest.mark.parametrize(
    ("source", "admise"),
    [
        pytest.param(lanceur('cmd = ["pnpm", *cmd]'), False, id="paramètre réaffecté"),
        pytest.param(lanceur('cmd: list[str] = ["pnpm", *cmd]'), False, id="affectation annotée"),
        pytest.param(lanceur("cmd = list(cmd)", 'cmd[0] = "pnpm"'), False, id="indice écrit"),
        pytest.param(
            lanceur("cmd = list(cmd)", 'cmd.insert(0, "pnpm")'), False, id="méthode appelée"
        ),
        pytest.param(lanceur('if (cmd := ["pnpm", *cmd]):', "    pass"), False, id="walrus"),
        pytest.param(lanceur('for cmd in (["pnpm"],):', "    pass"), False, id="cible de boucle"),
        pytest.param(lanceur('cmd, _ = ["pnpm", *cmd], None'), False, id="déstructuration"),
        pytest.param(
            lanceur("program = cmd[0] if shutil.which(cmd[0]) else cmd[0]", lance="[program]"),
            False,
            id="shutil.which appelé mais non retenu",
        ),
        pytest.param(lancement('["git"], executable="pnpm"'), False, id="executable= en dur"),
        pytest.param(lanceur("cmd = list(cmd)"), True, id="reprise list(cmd)"),
        pytest.param(lanceur("cmd = [*cmd]"), True, id="reprise [*cmd]"),
        pytest.param(lancement('["git"], executable=None'), True, id="executable=None"),
        pytest.param(
            lancement('"git", shell=True, executable="/bin/sh"'),
            True,
            id="shell=True et executable=",
        ),
    ],
)
def test_une_forme_de_lancement_ecrite_a_la_main_est_admise_ou_rougit(source, admise):
    lu = Script(source)
    lancements = lu.lancements()
    assert lancements
    formes = {forme for appel in lancements for forme in lu.formes_du_lancement(appel)}
    assert (formes <= ADMISES.keys()) is admise, formes


