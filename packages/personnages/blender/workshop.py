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


def rounded(radius_bottom, radius_top, height, hem, shoulder, steps=6):
    """
    Le profil, du bas vers le haut, d'un tronc de cône aux bords arrondis, à faire tourner par
    `lathe` : un ourlet de rayon `hem` au bas, une épaule de rayon `shoulder` au haut, comme la robe
    du magicien. Rend des (rayon, hauteur).
    """
    quarter = [math.pi / 2 * k / steps for k in range(steps + 1)]
    bottom = [(radius_bottom - hem * (1 - math.sin(a)), hem * (1 - math.cos(a))) for a in quarter]
    top = [
        (radius_top - shoulder * (1 - math.cos(a)), height - shoulder * (1 - math.sin(a)))
        for a in quarter
    ]
    return [(0, 0), *bottom, *top, (0, height)]


def between(profile, low, high, grow=1.0):
    """
    La part du profil `profile` comprise entre les hauteurs `low` et `high`, bouts interpolés, son
    rayon multiplié par `grow` : la pièce qui habille ce morceau du corps, plastron ou salopette.
    """

    def at(height):
        for (r0, y0), (r1, y1) in zip(profile, profile[1:]):
            if y0 <= height <= y1 and y1 > y0:
                return r0 + (r1 - r0) * (height - y0) / (y1 - y0)
        raise ValueError(f"hauteur {height} hors du profil")

    inside = [(r, y) for r, y in profile if low < y < high and r > POLE]
    return [(at(low) * grow, low), *((r * grow, y) for r, y in inside), (at(high) * grow, high)]


def rod(name, radius_bottom, radius_top, length, offset, rings=24, radial_segments=12, knots=()):
    """
    Une tige d'une pièce le long de Y, base en y = 0, son rayon passant de `radius_bottom` à
    `radius_top`, chaque anneau décalé en x de `offset(y)` : branche, sourcil arqué. Ses anneaux,
    `rings` réguliers, passent aussi par les hauteurs `knots`, où la tige peut faire un coude.
    """
    heights = sorted({length * k / rings for k in range(rings + 1)} | set(knots))
    profile = [(radius_bottom + (radius_top - radius_bottom) * y / length, y) for y in heights]
    shape = lathe(name, [(0, 0), *profile, (0, length)], radial_segments)
    for vertex in shape.data.vertices:
        vertex.co.x += offset(vertex.co.z)  # Y du glTF est Z de Blender
    shape.data.update()
    return shape


def crooked(name, radius_bottom, radius_top, height, kinks, radial_segments=12):
    """
    Un bâton d'une pièce, base en y = 0, dont l'axe passe par les coudes `kinks`, des (hauteur,
    écart en x) : entre deux coudes il file droit, comme une branche cassée.
    """
    path = [(0.0, 0.0), *kinks, (height, kinks[-1][1])]

    def offset(y):
        for (y0, x0), (y1, x1) in zip(path, path[1:]):
            if y0 <= y <= y1 and y1 > y0:
                return x0 + (x1 - x0) * (y - y0) / (y1 - y0)
        return path[-1][1]

    knots = [y for y, _ in kinks]
    return rod(name, radius_bottom, radius_top, height, offset, 24, radial_segments, knots)


def face(tete, center, radius, eyes, brows=None, nose=None):
    """
    Les yeux, les sourcils si `brows` les colore et le nez si `nose` le colore, du visage sphérique
    de rayon `radius` centré en `center` sous l'ancre `tete`, mis à l'échelle du rayon. L'œil et le
    nez sont ceux du magicien, l'œil aplati dans la peau ; le sourcil, horizontal et arqué, se pose
    haut pour ne pas froncer.
    """
    cx, cy, cz = center
    if nose:
        snout = sphere("nez", radius * 0.217, 20, 16)
        part(snout, nose, tete, (cx, cy - radius * 0.133, cz + radius))
    for side in SIDES:
        x = cx + side.sign * radius / 3
        eye = sphere(f"oeil_{side.masculine}", radius * 0.117, 16, 12)
        part(eye, eyes, tete, (x, cy + radius / 6, cz + radius * 0.907), scale=(1, 1.3, 0.6))
        if brows:
            # Un sourcil arqué de 0,07 rayon, couché par un quart de tour autour de Z : sa base part
            # vers +X, d'une demi-longueur, et la bosse de sa tige, en +X, monte.
            length = radius * 0.38

            def arch(y, length=length):
                return radius * 0.07 * (1 - (2 * y / length - 1) ** 2)

            brow = rod(f"sourcil_{side.masculine}", radius / 17, radius / 17, length, arch, 8)
            position = (x + length / 2, cy + radius * 0.43, cz + radius * 0.9)
            part(brow, brows, tete, position, (0, 0, math.pi / 2))


def hair(name, radius, surface, parent, center, below, hairline=math.pi * 0.3):
    """
    Une coiffe à la manière des cheveux du magicien, sphère de rayon `radius` centrée en `center`
    sous `parent` : une calotte de `hairline` sous le sommet, au-dessus des sourcils, puis, hors du
    visage, l'arrière et les côtés jusqu'à `below` sous le sommet (angles en radians).
    """
    part(sphere(name, radius, 40, 10, theta_length=hairline), surface, parent, center)
    back = sphere(
        f"{name}_arriere",
        radius,
        40,
        14,
        phi_start=math.pi / 2 + 0.75,
        phi_length=math.tau - 1.5,
        theta_start=hairline,
        theta_length=below - hairline,
    )
    part(back, surface, parent, center)


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
        # Y du glTF est Z de Blender : la taille s'écrit (largeur, profondeur, hauteur).
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
