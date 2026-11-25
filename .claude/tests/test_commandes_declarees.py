"""Chaque commande que la prose de la pipeline cite comme une ligne de « Commandes du projet » a sa
ligne dans `.claude/pipeline.config.md` et dans le gabarit de config d'`init-projet`.

Un rôle qui suit la prose à la lettre lit la commande dans cette section : sans la ligne, il la
devine ou saute l'étape sans le dire (#66). Population : les fichiers `.md` et `.py` suivis par git
sous `.claude/agents/`, `.claude/skills/` — hors `init-projet/`, qui porte le gabarit —,
`CLAUDE.md` et `CONTRIBUTING.md` ; un skill présent mais non suivi (`design-taste-frontend`) n'en
est pas.

Une citation est un libellé possible — une lettre, puis lettres, chiffres, `_`, `:` et `-`, mots
séparés d'une espace — entre guillemets, en gras ou entre backticks. Deux formes la portent :

1. derrière `ligne` ou `commande`, au singulier ou au pluriel : la ligne « validation » ;
2. à la suite d'une forme 1, en énumération par `,`, ` / `, `et` ou `ou` : les commandes `test`,
   `test-pipeline` et `build`.

Chaque citation trouvée est un nom de `NOMS_CITES` ou une entrée d'`EXCLUSIONS`, et chaque entrée des
deux tables est encore citée : une citation nouvelle rougit, une entrée périmée aussi. Hors des
formes, et donc hors de la garde : la citation nue d'un nom (« test-pipeline » si le delta la
concerne) et le défaut d'un script (`label` de `mutation.py`).

Lancement : `python -m pytest .claude/tests/test_commandes_declarees.py` (ligne `test-pipeline`).
"""

import re
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "skills" / "cycle-pr" / "scripts"))
from mutation import COMMAND_LINE, COMMANDS_SECTION  # noqa: E402

RACINE = Path(__file__).parents[2]
PROSE = (".claude/agents", ".claude/skills", "CLAUDE.md", "CONTRIBUTING.md")
INIT_PROJET = ".claude/skills/init-projet/"

NOM = r"[^\W\d_][\w:-]*(?: [\w:-]+)*"
CITATION = rf"(?:«\s({NOM})\s»|\*\*({NOM})\*\*|`({NOM})`)"
ENUMERATION = r"(?:,\s*|\s+/\s+|\s+(?:et|ou)\s+)"
FORME = re.compile(rf"\b(?i:ligne|commande)s?\s+{CITATION}(?:{ENUMERATION}{CITATION})*")

# Noms en littéraux : lus dans la prose, ils ne pourraient rougir sur rien
# (`cycle-pr/references/tests.md`, « Le rouge se constate, il ne se suppose pas »).
NOMS_CITES = (
    "install", "test", "test ciblé", "test brut", "test-pipeline", "lint", "format", "typecheck",
    "build", "run local", "validation", "relecture", "restrictions", "sécurité", "e2e ciblé",
    "hooks",
)

# Ce que les formes trouvent et qui n'est pas une ligne de « Commandes du projet ».
EXCLUSIONS = {
    "Base": "ligne du verdict d'avant-go",
    "Fichiers croisés": "ligne du verdict d'avant-go",
    "Non vérifié": "ligne du verdict d'avant-go",
    "En vol": "ligne du body d'une PR de lot",
    "Relecture indépendante": "ligne du body d'une PR",
    "échappements": "ligne du bilan de cycle",
    "contradiction soldée": "ligne de la reprise de `repercussions`",
    "commande de fond bornée": "ligne du mandat d'un rôle",
    "valide": "ligne de sortie de `description.py`",
    "knowledge_upload_rejected": "ligne de journal d'un exemple de `plan-qa`",
    "number": "paramètre de `restrictions-du-delta.py`",
    "gh": "programme",
    "git": "programme",
    "en lecture": "qualifie une commande",
    "ne part pas": "verbe dont une commande est le sujet",
    "tapée": "qualifie une commande",
}


def libelles(config: str) -> set[str]:
    """Les libellés des lignes de la section « Commandes du projet » d'une config."""
    section = config.split(f"{COMMANDS_SECTION}\n", 1)[1].split("\n## ", 1)[0]
    return {ligne.group("label") for ligne in map(COMMAND_LINE.match, section.splitlines()) if ligne}


def gabarit(skill: str) -> str:
    """Le gabarit de config qu'`init-projet` écrit (étape « Écrire `.claude/pipeline.config.md` »)."""
    return skill.split("<gabarit-config>", 1)[1].split("</gabarit-config>", 1)[0]


def noms_cites(texte: str) -> set[str]:
    """Les citations que portent les deux formes du docstring."""
    return {
        next(nom for nom in citation.groups() if nom)
        for forme in FORME.finditer(texte)
        for citation in re.finditer(CITATION, forme.group())
    }


def prose() -> list[str]:
    """Les fichiers de la population, suivis par git (`-z` : chemins sans guillemets)."""
    suivis = subprocess.run(
        ["git", "ls-files", "-z", "--", *PROSE],
        cwd=RACINE, capture_output=True, text=True, encoding="utf-8", check=True,
    ).stdout.split("\0")
    return [f for f in suivis if f.endswith((".md", ".py")) and not f.startswith(INIT_PROJET)]


def lire(chemin: str) -> str:
    return (RACINE / chemin).read_text(encoding="utf-8")


LIBELLES = {
    "config": libelles(lire(".claude/pipeline.config.md")),
    "gabarit": libelles(gabarit(lire(f"{INIT_PROJET}SKILL.md"))),
}


@pytest.mark.parametrize("source", LIBELLES)
@pytest.mark.parametrize("nom", NOMS_CITES)
def test_un_nom_cite_a_sa_ligne(nom, source):
    assert nom in LIBELLES[source], (
        f"« {nom} » est cité comme ligne de « Commandes du projet », sans ligne ({source})"
    )


def test_les_citations_sont_les_noms_et_les_exclusions():
    cites = set().union(*(noms_cites(lire(chemin)) for chemin in prose()))
    assert cites == set(NOMS_CITES) | EXCLUSIONS.keys(), (
        "une citation hors des tables reçoit sa ligne (config et gabarit) et entre dans NOMS_CITES, "
        "ou entre dans EXCLUSIONS avec son motif ; une entrée qui n'est plus citée se retire"
    )
