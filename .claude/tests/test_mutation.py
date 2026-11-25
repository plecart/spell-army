"""Contrat de `project_command` (`cycle-pr/scripts/mutation.py`) sur les deux formes de config.

Lancement : `python -m pytest .claude/tests/test_mutation.py` (ligne `test-pipeline`, job `pipeline` de la CI).
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "skills" / "cycle-pr" / "scripts"))
from mutation import project_command  # noqa: E402

# Forme de la graine : plusieurs piles, chacune sous un titre en gras, commandes nues.
PILES_EN_GRAS = """## Commandes du projet
**Back (`back/`)** — vérifiées le 2026-10-01
- test ciblé   : uv run pytest <chemin|motif>     # une cible
- lint         : n/a
**Front (`front/`)** — vérifiées le 2026-10-01
- test ciblé   : npx vitest run <chemin>
## Qualité
- test ciblé   : ailleurs
"""

# Forme de ce dépôt : une seule pile, sans titre, commandes entre backticks, annotation après.
PILE_UNIQUE = """## Stack
- test ciblé   : ailleurs
## Commandes du projet
- test         : `pnpm -r test` (Vitest)                  # suite complète ; Docker pour `packages/donnees`
- test ciblé   : `pnpm vitest run <chemin>`   # une seule cible
- format:check : `pnpm biome format .`                  # vérifie sans écrire
- test brut    : n/a                    # pas de résumeur
## Qualité
- test ciblé   : ailleurs
"""

# Forme mixte : une ligne du projet entier avant les piles, qu'une ligne de pile doit emporter.
MIXTE = """## Commandes du projet
- test ciblé   : make test-cible
- lint         : `ruff check --select E,W  #tag`   # le # entre backticks reste
**Back (`back/`)** — vérifiées le 2026-10-01
- test ciblé   : uv run pytest <chemin>
"""


@pytest.mark.parametrize(
    ("config", "label", "stack", "attendu"),
    [
        (PILES_EN_GRAS, "test ciblé", "Back", "uv run pytest"),
        (PILES_EN_GRAS, "test ciblé", "Front", "npx vitest run"),
        (PILE_UNIQUE, "test ciblé", "Back", "pnpm vitest run"),
        (PILE_UNIQUE, "test", "Back", "pnpm -r test"),
        (PILE_UNIQUE, "format:check", "Back", "pnpm biome format ."),
        (MIXTE, "test ciblé", "Back", "uv run pytest"),
        (MIXTE, "test ciblé", "Front", "make test-cible"),
        (MIXTE, "lint", "Back", "ruff check --select E,W  #tag"),
    ],
    ids=[
        "gras-back",
        "gras-front",
        "unique-gabarit",
        "unique-annotation",
        "unique-deux-points",
        "mixte-la-pile-l-emporte",
        "mixte-repli-sur-le-projet",
        "mixte-diese-entre-backticks",
    ],
)
def test_une_ligne_de_commande_se_lit_dans_les_deux_formes(tmp_path, config, label, stack, attendu):
    fichier = tmp_path / "pipeline.config.md"
    fichier.write_text(config, encoding="utf-8")
    assert project_command(fichier, label, stack) == attendu


def test_la_config_de_ce_depot_donne_son_test_cible():
    config = Path(__file__).parents[1] / "pipeline.config.md"
    assert project_command(config, "test ciblé") == "pnpm vitest run"


@pytest.mark.parametrize(
    ("config", "label", "stack"),
    [
        (PILES_EN_GRAS, "lint", "Back"),
        (PILES_EN_GRAS, "test ciblé", "Infra"),
        (PILE_UNIQUE, "test brut", "Back"),
        (PILE_UNIQUE, "build", "Back"),
    ],
    ids=["gras-n-a", "gras-pile-absente", "unique-n-a", "unique-libelle-absent"],
)
def test_une_ligne_absente_ou_n_a_leve(tmp_path, config, label, stack):
    fichier = tmp_path / "pipeline.config.md"
    fichier.write_text(config, encoding="utf-8")
    with pytest.raises(LookupError):
        project_command(fichier, label, stack)
