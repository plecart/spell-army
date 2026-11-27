"""La sonde d'outillage (`cycle-pr/scripts/sonde-outillage.py`) trouve le programme d'une commande
comme le shell le trouve (#74).

Sous Windows, `CreateProcess` ne lit pas `PATHEXT` : un `.cmd` appelé par son nom nu, comme le
`pnpm` de la ligne `format`, ne s'y lançait pas. `git` et `gh` sont remplacés par une réponse
fixe — l'état du dépôt et du compte n'est pas le sujet — ; la commande `--test`, elle, est
réellement lancée par le lanceur de la sonde.

Lancement : `python -m pytest .claude/tests/test_sonde_outillage.py` (ligne `test-pipeline`, job
`pipeline` de la CI).
"""

import importlib.util
import os
import subprocess
from pathlib import Path

SONDE = Path(__file__).parents[1] / "skills" / "cycle-pr" / "scripts" / "sonde-outillage.py"
_spec = importlib.util.spec_from_file_location("sonde_outillage", SONDE)
sonde = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sonde)

TEMOIN = "sonde-temoin"


def run_sans_depot(cmd):
    """`git` et `gh` répondent OK, `gh api` rend `true` ; tout autre programme est lancé."""
    if cmd[0] in ("git", "gh"):
        stdout = "true\n" if tuple(cmd) == sonde.PUSH else ""
        return subprocess.CompletedProcess(cmd, 0, stdout=stdout, stderr="")
    return sonde.default_run(cmd)


def poser_temoin(dossier: Path) -> None:
    """Un programme qui sort en 0, sous la forme que le poste lance par son nom nu."""
    if os.name == "nt":
        (dossier / f"{TEMOIN}.cmd").write_text("@exit /b 0\r\n", encoding="ascii")
    else:
        script = dossier / TEMOIN
        script.write_text("#!/bin/sh\nexit 0\n", encoding="ascii")
        script.chmod(0o755)


def test_la_sonde_lance_un_programme_du_path_appele_par_son_nom_nu(tmp_path, monkeypatch, capsys):
    poser_temoin(tmp_path)
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}{os.environ['PATH']}")

    code = sonde.main(["--test", TEMOIN], run=run_sans_depot)

    assert capsys.readouterr().out.splitlines()[-1] == "OK   test"
    assert code == 0


def test_un_programme_absent_du_path_ne_se_lance_pas(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}{os.environ['PATH']}")

    code = sonde.main(["--test", TEMOIN], run=run_sans_depot)

    sortie = capsys.readouterr().out.splitlines()
    assert sortie[-2] == "KO   test"
    assert sortie[-1].startswith(f"{sonde.INDENT}`{TEMOIN}` ne se lance pas : ")
    assert code == 1
