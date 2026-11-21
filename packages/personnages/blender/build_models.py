"""
Entrée Blender : fabrique le GLB de chaque classe, au contrat du fichier 3D (direction artistique
§ 7). Lancé par `pnpm --filter personnages modeles`, qui écrit le fichier des classes et juge
ensuite chaque GLB :

    blender --background --factory-startup --python build_models.py -- <classes> <sortie>

`<classes>`, un JSON, donne par classe à fabriquer, dans l'ordre des classes, la couleur de sa
classe (`color`, de `CLASS_COLORS`). Une classe est le fichier `classes/<classe>.py`, nommé par sa
ClassKey, dont la fonction `build(color)` compose le personnage dans une scène vide, écrite ensuite
en `<sortie>/<classe>.glb`. Une classe sans fichier arrête tout, avant la première fabrication, sur
un message qui la nomme.
"""

import json
import runpy
import sys
from pathlib import Path

# Blender n'ajoute pas le dossier du script au chemin des modules (mesuré sur Blender 5.3) :
# l'atelier et les classes s'importent par ce chemin, ajouté avant eux.
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import workshop


def build_models(classes_file, out_dir):
    """Fabrique `<out_dir>/<classe>.glb` pour chaque classe de `classes_file`, en scène vide."""
    settings = json.loads(classes_file.read_text(encoding="utf-8"))
    files = {key: HERE / "classes" / f"{key}.py" for key in settings}
    missing = [key for key, file in files.items() if not file.is_file()]
    if missing:
        sys.exit(f"Classe(s) sans fichier dans {HERE / 'classes'} : {', '.join(missing)}.")
    for key, file in files.items():
        workshop.empty_scene()
        runpy.run_path(str(file))["build"](settings[key]["color"])
        workshop.export_glb(out_dir / f"{key}.glb")


build_models(*(Path(arg) for arg in sys.argv[sys.argv.index("--") + 1 :]))
