"""
Entrée Blender : fabrique le GLB de chaque classe nommée, au contrat du fichier 3D (direction
artistique § 7). Lancé par `pnpm --filter personnages modeles`, qui juge ensuite chaque fichier :

    blender --background --factory-startup --python build_models.py -- <sortie> <classe>…

Une classe est le fichier `classes/<classe>.py`, nommé par sa ClassKey, dont la fonction `build()`
compose le personnage dans une scène vide, écrite ensuite en `<sortie>/<classe>.glb`. Une classe
sans fichier arrête tout, avant la première fabrication, sur un message qui la nomme.
"""

import runpy
import sys
from pathlib import Path

# Blender n'ajoute pas le dossier du script au chemin des modules (mesuré sur Blender 5.3) :
# l'atelier et les classes s'importent par ce chemin, ajouté avant eux.
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import workshop


def build_models(out_dir, class_keys):
    """Fabrique `<out_dir>/<classe>.glb` pour chaque classe de `class_keys`, dans une scène vide."""
    files = {key: HERE / "classes" / f"{key}.py" for key in class_keys}
    missing = [key for key, file in files.items() if not file.is_file()]
    if missing:
        sys.exit(f"Classe(s) sans fichier dans {HERE / 'classes'} : {', '.join(missing)}.")
    for key, file in files.items():
        workshop.empty_scene()
        runpy.run_path(str(file))["build"]()
        workshop.export_glb(out_dir / f"{key}.glb")


out_dir, *class_keys = sys.argv[sys.argv.index("--") + 1 :]
build_models(Path(out_dir), class_keys)
