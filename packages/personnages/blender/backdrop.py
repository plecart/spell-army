"""
Le tramage du décor d'une classe : le document SVG de `BACKDROPS` (`src/scenery.ts`), lu par
xml.etree et tramé par numpy, calque par calque.

Un calque est un `<g fill opacity>` dont les formes s'unissent en une silhouette : sa couverture
se pose ensuite d'un seul tenant, à l'opacité du groupe (SVG 1.1, « Group opacity »), sans que deux
formes qui se chevauchent ne foncent. L'importeur SVG de Blender ignore l'opacité (`io_curve_svg`,
Blender 5.3), d'où ce tramage. Le sous-ensemble lu est celui qu'écrit `scenery.ts` : des `<g>` sous
la racine, des `<rect>` (coins `rx`), `<circle>` et `<path>` aux commandes absolues M L H V Q C A Z,
remplis selon la règle « nonzero » ; tout autre élément ou commande lève ValueError.

Sans Blender, avec le Python qu'il embarque (numpy compris), ce fichier se vérifie lui-même :

    "<dossier de Blender>/5.3/python/bin/python.exe" packages/personnages/blender/backdrop.py
"""

import math
import re
import xml.etree.ElementTree as ElementTree

import numpy as np

SVG = "{http://www.w3.org/2000/svg}"
SUPERSAMPLING = 4  # échantillons par côté de pixel, pour lisser les bords
CURVE_STEPS = 16  # segments d'une courbe de Bézier
ARC_STEP = math.pi / 32  # angle d'un segment d'arc : 64 au cercle
ARITY = {"M": 2, "L": 2, "H": 1, "V": 1, "Q": 4, "C": 6, "A": 7, "Z": 0}
TOKEN = re.compile(r"[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


def _bezier(points):
    """Les points d'une courbe de Bézier quadratique ou cubique, sans son point de départ."""
    p = np.array(points)
    t = np.linspace(0, 1, CURVE_STEPS + 1)[1:, None]
    if len(p) == 3:
        return (1 - t) ** 2 * p[0] + 2 * (1 - t) * t * p[1] + t**2 * p[2]
    return (
        (1 - t) ** 3 * p[0] + 3 * (1 - t) ** 2 * t * p[1] + 3 * (1 - t) * t**2 * p[2] + t**3 * p[3]
    )


def _ellipse(cx, cy, rx, ry, rotation, start, sweep):
    """L'arc d'ellipse de l'angle `start` à `start + sweep`, extrémités comprises."""
    t = start + sweep * np.linspace(0, 1, max(1, math.ceil(abs(sweep) / ARC_STEP)) + 1)
    cos, sin = math.cos(rotation), math.sin(rotation)
    x, y = rx * np.cos(t), ry * np.sin(t)
    return np.column_stack((cx + cos * x - sin * y, cy + sin * x + cos * y))


def _arc(start, rx, ry, angle, large, sweep, end):
    """L'arc de chemin SVG de `start` à `end`, sans `start` (SVG 1.1, annexe F, F.6.5 et F.6.6)."""
    (x1, y1), (x2, y2) = start, end
    if (x1, y1) == (x2, y2):
        return np.empty((0, 2))
    rx, ry, phi = abs(rx), abs(ry), math.radians(angle)
    if rx == 0 or ry == 0:
        return np.array([end])
    cos, sin = math.cos(phi), math.sin(phi)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x, y = cos * dx + sin * dy, -sin * dx + cos * dy
    grow = math.hypot(x / rx, y / ry)  # des rayons trop courts pour joindre les extrémités
    if grow > 1:
        rx, ry = rx * grow, ry * grow
    num = (rx * ry) ** 2 - (rx * y) ** 2 - (ry * x) ** 2
    k = math.sqrt(max(0.0, num / ((rx * y) ** 2 + (ry * x) ** 2)))
    if large == sweep:
        k = -k
    ccx, ccy = k * rx * y / ry, -k * ry * x / rx
    cx = cos * ccx - sin * ccy + (x1 + x2) / 2
    cy = sin * ccx + cos * ccy + (y1 + y2) / 2
    theta = math.atan2((y - ccy) / ry, (x - ccx) / rx)
    delta = math.atan2((-y - ccy) / ry, (-x - ccx) / rx) - theta
    if sweep and delta < 0:
        delta += math.tau
    elif not sweep and delta > 0:
        delta -= math.tau
    return _ellipse(cx, cy, rx, ry, phi, theta, delta)[1:]


def _path(d):
    """Les sous-chemins de l'attribut `d` d'un `<path>`, en polygones."""
    tokens = TOKEN.findall(d)
    subpaths, points, command, i = [], [], None, 0
    while i < len(tokens):
        if tokens[i].isalpha():
            command, i = tokens[i], i + 1
            if command not in ARITY:
                raise ValueError(f"Commande de chemin SVG non prise en charge : {command}")
        args = [float(token) for token in tokens[i : i + ARITY[command]]]
        i += ARITY[command]
        here = points[-1] if points else (0.0, 0.0)
        if command == "M":
            subpaths.append(points)
            points, command = [tuple(args)], "L"  # les paires qui suivent M sont des L
        elif command == "L":
            points.append(tuple(args))
        elif command == "H":
            points.append((args[0], here[1]))
        elif command == "V":
            points.append((here[0], args[0]))
        elif command in "QC":
            points.extend(map(tuple, _bezier([here, *zip(args[::2], args[1::2])])))
        elif command == "A":
            points.extend(map(tuple, _arc(here, *args[:5], args[5:])))
        else:  # Z : le sous-chemin se ferme, la suite repart de son premier point
            subpaths.append(points)
            points = points[:1]
    subpaths.append(points)
    return [np.array(subpath) for subpath in subpaths if len(subpath) > 2]


def _rect(x, y, width, height, rx):
    """Le rectangle à coins arrondis de rayon `rx`, en un polygone."""
    r = min(rx, width / 2, height / 2)
    if r == 0:
        return np.array([(x, y), (x + width, y), (x + width, y + height), (x, y + height)])
    right, bottom = x + width - r, y + height - r
    corners = [(right, y + r), (right, bottom), (x + r, bottom), (x + r, y + r)]
    return np.concatenate(
        [
            _ellipse(cx, cy, r, r, 0, (k - 1) * math.pi / 2, math.pi / 2)
            for k, (cx, cy) in enumerate(corners)
        ]
    )


def _shape(element):
    """Les polygones d'une forme du décor, dans le repère du `viewBox`."""
    tag = element.tag.removeprefix(SVG)

    def number(name, default=None):
        return float(element.get(name, default))

    if tag == "rect":
        x, y, rx = number("x", 0), number("y", 0), number("rx", 0)
        return [_rect(x, y, number("width"), number("height"), rx)]
    if tag == "circle":
        r = number("r")
        return [_ellipse(number("cx"), number("cy"), r, r, 0, 0, math.tau)]
    if tag == "path":
        return _path(element.get("d"))
    raise ValueError(f"Élément SVG non pris en charge dans un décor : <{tag}>")


def _fill(polygons, size):
    """
    Les échantillons d'une grille de `size` × `size` dont le centre tombe dans `polygons`, selon la
    règle « nonzero » : la zone de la grille que couvrent les polygones, et ses échantillons pleins.
    L'enroulement de chaque rangée s'accumule de gauche à droite, arête croisée après arête croisée.
    """
    points = np.concatenate(polygons)
    left, top = np.clip(np.floor(points.min(axis=0)), 0, size).astype(int)
    right, bottom = np.clip(np.ceil(points.max(axis=0)) + 1, 0, size).astype(int)
    height, width = bottom - top, right - left
    winding = np.zeros((height, width + 1), np.int32)
    for polygon in polygons:
        local = polygon - (left, top)
        for (x0, y0), (x1, y1) in zip(local, np.roll(local, -1, axis=0)):
            if y0 == y1:
                continue
            rows = np.arange(math.ceil(min(y0, y1) - 0.5), math.ceil(max(y0, y1) - 0.5))
            rows = rows[(rows >= 0) & (rows < height)]
            xs = x0 + (rows + 0.5 - y0) * (x1 - x0) / (y1 - y0)
            columns = np.clip(np.ceil(xs - 0.5), 0, width).astype(int)
            np.add.at(winding, (rows, columns), 1 if y1 > y0 else -1)
    return np.s_[top:bottom, left:right], np.cumsum(winding, axis=1)[:, :width] != 0


def layers(document, size):
    """
    Les calques du décor `document`, du fond vers l'avant, tramés en `size` × `size` pixels, de
    haut en bas : pour chacun, sa couleur (`fill`), son opacité et sa couverture de 0 à 1 par pixel.
    Le `viewBox` couvre le carré et s'aligne en bas, comme `preserveAspectRatio="xMidYMax slice"`.
    """
    root = ElementTree.fromstring(document)
    left, top, width, height = map(float, root.get("viewBox").split())
    grid = size * SUPERSAMPLING
    scale = grid / min(width, height)
    offset = ((grid - width * scale) / 2 - left * scale, grid - (top + height) * scale)
    for layer in root:
        if layer.tag != SVG + "g":
            tag = layer.tag.removeprefix(SVG)
            raise ValueError(f"Un décor ne porte que des calques <g>, pas <{tag}>")
        silhouette = np.zeros((grid, grid), bool)
        for element in layer:
            area, filled = _fill([polygon * scale + offset for polygon in _shape(element)], grid)
            silhouette[area] |= filled
        coverage = silhouette.reshape(size, SUPERSAMPLING, size, SUPERSAMPLING).mean(axis=(1, 3))
        yield layer.get("fill"), float(layer.get("opacity", 1)), coverage


if __name__ == "__main__":
    # Chaque calque, seul de sa forme, couvre l'aire de la forme, à 1 % près (polygones inscrits).
    AREAS = {
        # Deux carrés qui se chevauchent, tracés en sens contraires : leur union, sans trou.
        '<rect x="10" y="10" width="40" height="40"/><path d="M30 30 V70 H70 V30Z"/>': 2800,
        # Les mêmes, deux sous-chemins d'un seul chemin dans le même sens : « nonzero », sans trou.
        '<path d="M10 10 H50 V50 H10Z M30 30 H70 V70 H30Z"/>': 2800,
        # Une porte en plein cintre, comme `arch` de scenery.ts.
        '<path d="M75 95 V85 A10 10 0 0 1 95 85 V95Z"/>': 200 + 50 * math.pi,
        '<circle cx="15" cy="85" r="10"/>': 100 * math.pi,
        '<rect x="55" y="5" width="40" height="20" rx="10"/>': 800 - (4 - math.pi) * 100,
        # Deux bosses de Bézier sur un rectangle de contrôle de 20 × 20 : la cubique en couvre 3/5,
        # la quadratique 1/3.
        '<path d="M0 100 C0 80 20 80 20 100Z"/>': 400 * 3 / 5,
        '<path d="M30 100 Q40 80 50 100Z"/>': 400 / 3,
    }
    groups = "".join(f'<g fill="#000" opacity="0.5">{shapes}</g>' for shapes in AREAS)
    document = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{groups}</svg>'
    for (fill, opacity, coverage), (shapes, area) in zip(layers(document, 100), AREAS.items()):
        assert (fill, opacity) == ("#000", 0.5)
        covered = coverage.sum()
        assert abs(covered - area) < area / 100, f"{shapes} : {covered} au lieu de {area}"
    print("backdrop.py : tramage vérifié.")
