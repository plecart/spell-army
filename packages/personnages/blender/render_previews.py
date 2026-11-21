"""
Entrée Blender : rend l'image de validation de chaque classe, puis leur planche. Lancé par
`pnpm --filter personnages rendus`, qui écrit le fichier des classes :

    blender --background --factory-startup --python render_previews.py -- <classes> <GLB> <sortie>

`<classes>`, un JSON, donne par classe à rendre, dans l'ordre des classes, son décor (`backdrop`, le
SVG de `BACKDROPS`) et son socle (`pedestal`, de `PEDESTALS`). Chaque classe se rend depuis son GLB
fabriqué, `<GLB>/<classe>.glb` — ce qu'on juge est ce qui sera déposé —, posé au-dessus de son socle
et devant son décor, en `<sortie>/<classe>.png` ; puis toutes en `<sortie>/planche.png`. Cadrage et
lumière viennent de la vignette du prototype `annuaire-bd.html` de la direction artistique ; ni
contour ni ombre portée, qui viennent de l'affichage (direction artistique § 3 et § 7, « Contour »).
"""

import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

# Blender n'ajoute pas le dossier du script au chemin des modules (mesuré sur Blender 5.3) :
# l'atelier et le décor s'importent par ce chemin, ajouté avant eux.
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import backdrop
from workshop import (
    MATTE,
    PAINT,
    cylinder,
    empty_scene,
    linear,
    material,
    part,
    srgb,
    to_blender,
)

SIZE = 1024  # côté d'une image de classe, en pixels
SURFACE = "#fffaf0"  # fond sous le décor : jeton « surface » clair, direction artistique § 2
COLUMNS = 4  # colonnes de la planche, aux images réduites de moitié ; autant de rangées qu'il faut
PEDESTAL_SEGMENTS = 48

# La vignette du prototype : caméra perspective de 28° de champ vertical, personnage tourné de
# 0,38 rad ; lumière hémisphérique, lampe principale et contre-jour, en intensités de three.js. Sa
# caméra, en (0, 1.05, 4.7) visant (0, 0.93, 0), coupe le chapeau du magicien de `modeles.html`,
# haut de 2,35 unités : même champ, caméra toujours 0,12 au-dessus de sa visée, mais reculée et
# relevée pour qu'il tienne entier, socle compris, le dessus du socle à hauteur du sol du décor.
FIELD_OF_VIEW = math.radians(28)
CAMERA = (0, 1.24, 6.4)
TARGET = (0, 1.12, 0)
TURN = 0.38
SKY, GROUND, HEMISPHERE = "#ffffff", "#8a7d66", 1.4
SUNS = [("#fff2e0", 2.2, (2, 4, 3)), ("#cfe3ff", 1.2, (-3, 2, -3))]


def aim(obj, direction):
    """Tourne `obj`, caméra ou lampe, pour que son axe -Z regarde vers `direction`."""
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_settings(scene):
    """Une image carrée de `SIZE`, au fond transparent où poser le décor."""
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = SIZE
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"  # on juge des couleurs


def place_camera(scene):
    """La caméra de la vignette, de champ vertical comme celui de three.js."""
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    camera.data.sensor_fit = "VERTICAL"
    camera.data.angle_y = FIELD_OF_VIEW
    camera.location = to_blender(*CAMERA)
    aim(camera, to_blender(*TARGET) - camera.location)
    scene.collection.objects.link(camera)
    scene.camera = camera


def place_suns(scene):
    """
    Les lampes directionnelles de la vignette, sans ombre portée. Une lampe de three.js d'intensité
    E éclaire comme un soleil de Blender de force E : l'une et l'autre rendent albédo × E / π.
    """
    for color, strength, position in SUNS:
        sun = bpy.data.lights.new("soleil", "SUN")
        sun.color, sun.energy, sun.use_shadow = linear(color), strength, False
        lamp = bpy.data.objects.new("soleil", sun)
        aim(lamp, -to_blender(*position))
        scene.collection.objects.link(lamp)


def place_sky(scene):
    """
    La lumière hémisphérique de la vignette, en ciel : un dégradé du sol au ciel selon la hauteur de
    la direction regardée, de force 1,4 / π pour rendre albédo × 1,4 / π comme three.js.
    """
    scene.world = bpy.data.worlds.new("ciel")
    nodes, links = scene.world.node_tree.nodes, scene.world.node_tree.links
    direction = nodes.new("ShaderNodeTexCoord").outputs["Generated"]
    height = nodes.new("ShaderNodeSeparateXYZ")
    blend = nodes.new("ShaderNodeMapRange")
    blend.inputs["From Min"].default_value = -1
    gradient = nodes.new("ShaderNodeValToRGB")
    gradient.color_ramp.elements[0].color = (*linear(GROUND), 1)
    gradient.color_ramp.elements[1].color = (*linear(SKY), 1)
    background = nodes["Background"]
    background.inputs["Strength"].default_value = HEMISPHERE / math.pi
    links.new(direction, height.inputs["Vector"])
    links.new(height.outputs["Z"], blend.inputs["Value"])
    links.new(blend.outputs["Result"], gradient.inputs["Fac"])
    links.new(gradient.outputs["Color"], background.inputs["Color"])


def pose_figure(model, lift):
    """Importe le GLB `model` dans la scène vide et le pose, tourné, à `lift` au-dessus du sol."""
    bpy.ops.import_scene.gltf(filepath=str(model))
    roots = [obj for obj in bpy.context.scene.objects if obj.parent is None]
    pivot = bpy.data.objects.new("figurine", None)
    bpy.context.scene.collection.objects.link(pivot)
    for root in roots:
        root.parent = pivot
    pivot.location = to_blender(0, lift, 0)
    pivot.rotation_euler.z = TURN  # Y du glTF est Z de Blender, même sens de rotation


def build_pedestal(pedestal):
    """Le socle de `PEDESTALS` : base tronconique, son dessus en y = 0, et disque du dessus."""
    base, top = pedestal["base"], pedestal["top"]
    trunk = cylinder(
        "socle", base["topRadius"], base["bottomRadius"], base["height"], PEDESTAL_SEGMENTS
    )
    part(trunk, material("socle", base["color"], PAINT), position=(0, -base["height"] / 2, 0))
    disc = cylinder("dessus", top["radius"], top["radius"], top["thickness"], PEDESTAL_SEGMENTS)
    part(disc, material("dessus", top["color"], MATTE), position=(0, top["centerY"], 0))


def render_figure(path):
    """Rend la scène en PNG à `path` et la relit : RGBA de 0 à 1, encodé sRGB, de haut en bas."""
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(str(path))
    pixels = np.empty(SIZE * SIZE * 4, np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(SIZE, SIZE, 4)[::-1]  # Blender range ses pixels de bas en haut


def over(under, color, alpha):
    """`color` posé sur `under` à l'opacité `alpha`, en valeurs encodées sRGB."""
    return under * (1 - alpha) + color * alpha


def backdrop_pixels(document):
    """Le décor `document` sur le fond `SURFACE` : RGB de 0 à 1, encodé sRGB, de haut en bas."""
    pixels = np.full((SIZE, SIZE, 3), srgb(SURFACE))
    for fill, opacity, coverage in backdrop.layers(document, SIZE):
        pixels = over(pixels, np.array(srgb(fill)), opacity * coverage[..., None])
    return pixels


def save_png(pixels, path):
    """Écrit `pixels`, RGB de 0 à 1 encodé sRGB, de haut en bas, en PNG à `path`."""
    height, width, _ = pixels.shape
    image = bpy.data.images.new(path.stem, width, height)
    rgba = np.dstack((pixels, np.ones((height, width))))[::-1]
    image.pixels.foreach_set(rgba.astype(np.float32).ravel())
    image.filepath_raw, image.file_format = str(path), "PNG"
    image.save()
    bpy.data.images.remove(image)


def render_class(model, setting, path):
    """Rend une classe, figurine sur décor, en PNG à `path`, et rend ses pixels."""
    empty_scene()
    pose_figure(model, setting["pedestal"]["lift"])
    build_pedestal(setting["pedestal"])
    scene = bpy.context.scene
    render_settings(scene)
    place_camera(scene)
    place_suns(scene)
    place_sky(scene)
    figure = render_figure(path)
    pixels = over(backdrop_pixels(setting["backdrop"]), figure[..., :3], figure[..., 3:])
    save_png(pixels, path)
    return pixels


def sheet(images):
    """La planche : `images` réduites de moitié, sur `COLUMNS` colonnes, dans leur ordre."""
    rows = math.ceil(len(images) / COLUMNS)
    cell = SIZE // 2
    board = np.full((rows * cell, COLUMNS * cell, 3), srgb(SURFACE))
    for index, image in enumerate(images):
        row, column = divmod(index, COLUMNS)
        half = image.reshape(cell, 2, cell, 2, 3).mean(axis=(1, 3))
        board[row * cell : (row + 1) * cell, column * cell : (column + 1) * cell] = half
    return board


def render_previews(classes_file, models_dir, out_dir):
    """
    Vérifie le tramage du décor (`backdrop.self_check`), puis rend chaque classe de `classes_file`
    depuis `models_dir`, et la planche, dans `out_dir`.
    """
    backdrop.self_check()
    settings = json.loads(classes_file.read_text(encoding="utf-8"))
    missing = [key for key in settings if not (models_dir / f"{key}.glb").is_file()]
    if missing:
        sys.exit(
            f"GLB absent(s) dans {models_dir} : {', '.join(missing)}. "
            f"Fabrique-les d'abord : pnpm --filter personnages modeles {' '.join(missing)}"
        )
    images = [
        render_class(models_dir / f"{key}.glb", setting, out_dir / f"{key}.png")
        for key, setting in settings.items()
    ]
    save_png(sheet(images), out_dir / "planche.png")


render_previews(*(Path(arg) for arg in sys.argv[sys.argv.index("--") + 1 :]))
