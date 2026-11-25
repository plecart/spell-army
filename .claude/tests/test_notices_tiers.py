"""Chaque skill public versionné a sa ligne dans `THIRD_PARTY_NOTICES.md`.

Le dépôt est public : un skill copié de tiers sans sa notice de licence enfreint cette licence, et
seul ce test le voit. Population : les entrées de `skills-lock.json` dont le dossier
`.claude/skills/<nom>/` est suivi par git (`design-taste-frontend`, exclu par `.gitignore`, n'en
est pas). Les skills copiés à la main, hors du lockfile, se relisent à leur copie.

Lancement : `python -m pytest .claude/tests/test_notices_tiers.py` (ligne `test-pipeline`, job `pipeline` de la CI).
"""

import json
import subprocess
from pathlib import Path

import pytest

RACINE = Path(__file__).parents[2]
NOTICES = (RACINE / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")


def skills_publics_versionnes() -> list[str]:
    """Noms des skills du lockfile dont le dossier est suivi par git."""
    verrou = json.loads((RACINE / "skills-lock.json").read_text(encoding="utf-8"))
    suivis = subprocess.run(
        ["git", "ls-files", ".claude/skills"],
        cwd=RACINE, capture_output=True, text=True,
    ).stdout.splitlines()
    return [nom for nom in verrou["skills"] if any(f.startswith(f".claude/skills/{nom}/") for f in suivis)]


def test_la_population_n_est_pas_vide():
    assert skills_publics_versionnes(), "aucun skill public versionné : le lockfile ou git ont changé de forme"


@pytest.mark.parametrize("nom", skills_publics_versionnes())
def test_un_skill_public_versionne_a_sa_notice(nom):
    assert f"`.claude/skills/{nom}/`" in NOTICES, f"{nom} n'a pas de ligne dans THIRD_PARTY_NOTICES.md"
