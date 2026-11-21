"""
Entrée Blender : fabrique le GLB de chaque classe, au contrat du fichier 3D (direction artistique
§ 7). Lancé par `pnpm --filter personnages modeles`, qui écrit le fichier des classes et juge
ensuite chaque GLB :

    blender --background --factory-startup --python build_models.py -- <classes> <sortie>

`<classes>`, un JSON, donne par classe à fabriquer, dans l'ordre des classes, la couleur de sa
classe (`color`, de `CLASS_COLORS`). Une classe est le fichier `classes/<classe>.py`, nommé par sa
ClassKey, dont la fonction `build(color)` compose le personnage dans une scène vide, écrite ensuite
en `<sortie>/<classe>.glb`. Une classe sans fichier arrête tout, avant la première fabrication, sur
un message qui la nomme. Une classe dont une main est du mauvais côté n'est pas écrite : les autres
le sont, puis la commande sort en erreur en la nommant.
"""

import json
import runpy
import sys
from pathlib import Path

import bpy

# Blender n'ajoute pas le dossier du script au chemin des modules (mesuré sur Blender 5.3) :
# l'atelier et les classes s'importent par ce chemin, ajouté avant eux.
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import workshop

# Le signe du x de chaque main dans le fichier 3D : tourné vers +Z, le personnage a sa droite en -X
# (glTF 2.0, § 3.4 : « +Y as up, +Z as forward, and -X as right »), et l'export garde le x de
# Blender (`swizzle_yup_location` de l'exporteur glTF, Blender 5.3). Écrit ici, pas lu dans
# l'atelier : un côté faux de l'atelier ne se jugerait pas lui-même.
HAND_SIGNS = {"main_droite": -1, "main_gauche": 1}


def misplaced_hands():
    """
    Les mains de la scène posées du mauvais côté, chacune avec le x de sa position monde. Une main
    absente n'y est pas : le jugement du contrat, ensuite, la nomme.
    """
    bpy.context.view_layer.update()
    objects = bpy.context.scene.objects
    xs = {name: objects[name].matrix_world.translation.x for name in HAND_SIGNS if name in objects}
    return [f"{name} en x = {x:.3f}" for name, x in xs.items() if x * HAND_SIGNS[name] <= 0]


def build_models(classes_file, out_dir):
    """Fabrique `<out_dir>/<classe>.glb` pour chaque classe de `classes_file`, en scène vide."""
    settings = json.loads(classes_file.read_text(encoding="utf-8"))
    files = {key: HERE / "classes" / f"{key}.py" for key in settings}
    missing = [key for key, file in files.items() if not file.is_file()]
    if missing:
        sys.exit(f"Classe(s) sans fichier dans {HERE / 'classes'} : {', '.join(missing)}.")
    misplaced = []
    for key, file in files.items():
        workshop.empty_scene()
        runpy.run_path(str(file))["build"](settings[key]["color"])
        if hands := misplaced_hands():
            misplaced.append(f"- {key} : {', '.join(hands)}")
        else:
            workshop.export_glb(out_dir / f"{key}.glb")
    if misplaced:
        sys.exit(
            "Main(s) du mauvais côté, main_droite attendue en x < 0 et main_gauche en x > 0 "
            "(glTF 2.0, § 3.4) :\n" + "\n".join(misplaced)
        )


build_models(*(Path(arg) for arg in sys.argv[sys.argv.index("--") + 1 :]))
