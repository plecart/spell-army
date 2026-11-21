"""
L'atelier commun des classes : matériaux, primitives, côtés, ancres, pièces et mains,
agrandissement, scène vide, export GLB.

Une classe s'écrit dans le repère du fichier 3D (direction artistique § 7, « Repère ») : Y vers le
haut, personnage tourné vers +Z. Les primitives reprennent les géométries de three.js, paramètres
et conventions d'angle compris, pour qu'un modèle des prototypes se porte tel quel ; l'atelier les
passe dans le repère de Blender, Z vers le haut, où (x, y, z) glTF devient (x, -z, y).
"""

import math
from collections import namedtuple

import bmesh
import bpy
from mathutils import Color, Euler, Matrix, Vector

# glTF vers Blender : un quart de tour autour de X, écrit en entiers pour que la conversion d'un
# point n'ajoute aucun reste de calcul flottant. L'export glTF fait le chemin inverse.
GLTF_TO_BLENDER = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))

# Les deux côtés du personnage, vus par lui, et le signe de leur x dans le repère du fichier 3D :
# tourné vers +Z, il a sa droite en -X (glTF 2.0, § 3.4 : « +Y as up, +Z as forward, and -X as
# right »). Le nom d'un côté s'accorde à celui de sa pièce : `oeil_droit`, `main_droite`.
Side = namedtuple("Side", "sign masculine feminine")
LEFT = Side(1, "gauche", "gauche")
RIGHT = Side(-1, "droit", "droite")
SIDES = (LEFT, RIGHT)

# Les finitions du prototype `modeles.html` de la direction artistique (fonction `material`), en
# entrées du Principled BSDF : le vernis (Coat) s'exporte en KHR_materials_clearcoat.
PAINT = {"Roughness": 0.45, "Coat Weight": 0.55, "Coat Roughness": 0.35}
METAL = {**PAINT, "Roughness": 0.35, "Metallic": 0.6, "Coat Weight": 0.2}
MATTE = {**PAINT, "Roughness": 0.8, "Coat Weight": 0.0}

# Au-delà de cet angle entre deux faces, l'arête reste vive : bords des disques et des cylindres
# (90°), faces de l'octaèdre (70,5°) ; en deçà, l'ombrage est lissé, comme les sphères et les
# révolutions de three.js.
SHARP_ANGLE = math.radians(60)

# Un point de profil plus proche de l'axe que ce rayon est un pôle : un seul sommet.
POLE = 1e-9


def to_blender(x, y, z):
    """Le point glTF (x, y, z) dans le repère de Blender."""
    return GLTF_TO_BLENDER @ Vector((x, y, z))


def srgb(color):
    """Les composantes de `color`, `#rgb` ou `#rrggbb`, de 0 à 1, encodées sRGB."""
    digits = color.removeprefix("#")
    if len(digits) == 3:
        digits = "".join(digit * 2 for digit in digits)
    return tuple(channel / 255 for channel in bytes.fromhex(digits))


def linear(color):
    """`color` en couleur linéaire de la scène, celle qu'attendent shaders et lampes."""
    return Color(srgb(color)).from_srgb_to_scene_linear()


def shade(color, factor):
    """
    `color` assombrie, ou éclaircie, de `factor`, en `#rrggbb` : `shade` du prototype
    `annuaire-bd.html`, qui multiplie la couleur linéaire (three.js r160).
    """
    channels = (linear(color) * factor).from_scene_linear_to_srgb()
    return "#" + "".join(f"{round(min(max(c, 0), 1) * 255):02x}" for c in channels)


def material(name, color, finish=PAINT):
    """Le matériau `name`, couleur unie `color` en `#rrggbb` et finition `finish`."""
    result = bpy.data.materials.new(name)
    shader = result.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*linear(color), 1.0)
    for entry, value in finish.items():
        shader.inputs[entry].default_value = value
    return result


def mesh_object(name, build):
    """Un objet maillé `name`, hors scène, dont `build(bm)` remplit le BMesh."""
    bm = bmesh.new()
    build(bm)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return bpy.data.objects.new(name, mesh)


def lathe(name, points, segments=12, phi_start=0.0, phi_length=math.tau):
    """
    La révolution du profil `points`, des (rayon, hauteur), autour de l'axe vertical, comme
    LatheGeometry de three.js : `phi` part de +Z vers +X. Un profil décrit du bas vers le haut
    tourne ses faces vers l'extérieur ; un point sur l'axe ferme la surface en pointe.
    """
    # Un point répété, comme le pôle d'un cône, ne fait qu'un anneau : deux laisseraient un sommet
    # isolé.
    points = [point for point, before in zip(points, [None, *points]) if point != before]
    closed = phi_length >= math.tau
    columns = segments if closed else segments + 1
    angles = [phi_start + phi_length * i / segments for i in range(columns)]

    def build(bm):
        def ring(radius, height):
            if radius < POLE:
                return [bm.verts.new(to_blender(0, height, 0))] * columns
            return [
                bm.verts.new(to_blender(radius * math.sin(a), height, radius * math.cos(a)))
                for a in angles
            ]

        rings = [ring(radius, height) for radius, height in points]
        for low, high in zip(rings, rings[1:]):
            for i in range(segments):
                j = (i + 1) % columns
                # Sur un pôle, le quadrilatère perd ses sommets confondus et devient un triangle.
                face = list(dict.fromkeys((low[i], low[j], high[j], high[i])))
                if len(face) >= 3:
                    bm.faces.new(face)

    return mesh_object(name, build)


def sphere(
    name,
    radius,
    width_segments=32,
    height_segments=16,
    phi_start=0.0,
    phi_length=math.tau,
    theta_start=0.0,
    theta_length=math.pi,
):
    """
    Une sphère, ou une part de sphère, comme SphereGeometry de three.js : `phi` part de -X vers +Z
    autour de l'axe vertical, `theta` du pôle du haut vers celui du bas.
    """
    thetas = [
        theta_start + theta_length * k / height_segments
        for k in range(height_segments, -1, -1)
    ]
    profile = [(radius * math.sin(t), radius * math.cos(t)) for t in thetas]
    return lathe(name, profile, width_segments, phi_start - math.pi / 2, phi_length)


def cylinder(name, radius_top, radius_bottom, height, radial_segments=32):
    """
    Un cylindre fermé et centré, ou un cône si un rayon est nul, comme CylinderGeometry de
    three.js.
    """
    half = height / 2
    profile = [(0, -half), (radius_bottom, -half), (radius_top, half), (0, half)]
    return lathe(name, profile, radial_segments)


def bent_cone(name, radius, height, bend, radial_segments=32, height_segments=24):
    """
    Un cône d'une pièce, base au sol en y = 0, dont la pointe s'incline vers +X d'une courbure
    continue : `bentCone` du prototype `modeles.html`.
    """
    profile = [(0, 0)] + [
        (radius * (1 - k / height_segments), height * k / height_segments)
        for k in range(height_segments + 1)
    ]
    cone = lathe(name, profile, radial_segments)
    for vertex in cone.data.vertices:
        t = vertex.co.z / height
        vertex.co.x += bend * height * t * t
        vertex.co.z -= abs(bend) * height * 0.18 * t**3  # la pointe s'affaisse en s'inclinant
    cone.data.update()
    return cone


def torus(name, radius, tube, radial_segments=12, tubular_segments=48):
    """Un tore dans le plan XY, face à +Z, comme TorusGeometry de three.js."""

    def build(bm):
        rings = [
            [
                bm.verts.new(
                    to_blender(
                        (radius + tube * math.cos(v)) * math.cos(u),
                        (radius + tube * math.cos(v)) * math.sin(u),
                        tube * math.sin(v),
                    )
                )
                for v in (math.tau * j / radial_segments for j in range(radial_segments))
            ]
            for u in (math.tau * i / tubular_segments for i in range(tubular_segments))
        ]
        for i in range(tubular_segments):
            for j in range(radial_segments):
                k, m = (i + 1) % tubular_segments, (j + 1) % radial_segments
                bm.faces.new((rings[i][j], rings[k][j], rings[k][m], rings[i][m]))

    return mesh_object(name, build)


def box(name, width, height, depth):
    """Un pavé centré, `width` en X, `height` en Y, `depth` en Z, comme BoxGeometry de three.js."""

    def build(bm):
        # Y du glTF est Z de Blender ; pas `to_blender`, dont le signe retournerait les faces.
        size = Matrix.Diagonal((width, depth, height, 1))
        bmesh.ops.create_cube(bm, size=1, matrix=size)

    return mesh_object(name, build)


def octahedron(name, radius):
    """Un octaèdre, sommets sur les axes, comme OctahedronGeometry de three.js."""

    def build(bm):
        top, bottom = bm.verts.new((0, 0, radius)), bm.verts.new((0, 0, -radius))
        # Les quatre sommets horizontaux, dans le sens direct vu d'en haut : faces vers l'extérieur.
        ring = [
            bm.verts.new((radius * x, radius * y, 0))
            for x, y in ((1, 0), (0, 1), (-1, 0), (0, -1))
        ]
        for a, b in zip(ring, ring[1:] + ring[:1]):
            bm.faces.new((a, b, top))
            bm.faces.new((b, a, bottom))

    return mesh_object(name, build)


def anchor(name, parent=None, position=(0, 0, 0)):
    """L'ancre `name` du contrat, un vide posé en `position` dans le repère de `parent`."""
    empty = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(empty)
    empty.parent = parent
    empty.location = to_blender(*position)
    return empty


def part(
    piece, surface, parent=None, position=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)
):
    """
    Pose la pièce `piece` dans la scène, matériau `surface`, enfant de `parent` : `position`,
    `rotation` (angles d'Euler de three.js, ordre XYZ) et `scale` s'écrivent dans le repère glTF.
    """
    bpy.context.scene.collection.objects.link(piece)
    piece.data.materials.append(surface)
    piece.data.shade_smooth()
    piece.data.set_sharp_from_angle(angle=SHARP_ANGLE)
    piece.parent = parent
    # L'ordre « XYZ » de three.js, Rx·Ry·Rz, est l'ordre « ZYX » de Blender.
    local = Matrix.LocRotScale(position, Euler(rotation, "ZYX"), scale)
    basis = GLTF_TO_BLENDER.to_4x4()
    piece.matrix_basis = basis @ local @ basis.transposed()
    return piece


def hand(side, position, skin, radius):
    """
    L'ancre `main_<côté>` du côté `side`, en `position` mais son x compté vers l'extérieur, portant
    sa paume flottante de peau `skin` et de rayon `radius` ; l'objet tenu s'accroche ensuite à
    l'ancre rendue.
    """
    outward, height, depth = position
    main = anchor(f"main_{side.feminine}", position=(side.sign * outward, height, depth))
    part(sphere(f"paume_{side.feminine}", radius, 20, 16), skin, main, scale=(1, 1.1, 0.9))
    return main


def enlarge(factor):
    """
    Agrandit de `factor`, autour de l'origine, ce que compose la scène : la position de chaque pièce
    et de chaque ancre dans son parent, et les sommets de chaque maillage. L'échelle des nœuds n'est
    pas touchée : une ancre reste à l'échelle 1, et ce qu'on y accrochera plus tard garde la sienne.
    """
    for obj in bpy.context.scene.objects:
        obj.location *= factor
        if obj.type == "MESH":
            obj.data.transform(Matrix.Scale(factor, 4))


def empty_scene():
    """Remet Blender à une scène d'usine vide : ni objet, ni matériau, ni réglage hérité."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export_glb(path):
    """Écrit la scène en GLB à `path` : maillages et ancres, Y vers le haut, sans image."""
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_yup=True,
        export_image_format="NONE",
    )
