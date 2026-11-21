"""
Le golem, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Golem ») : tout de pierre, de la mousse sur les épaules et un brin sur la
tête ; ses gros poings de pierre sont ses mains. Le prototype enfonçait tête et poings dans le tronc : ils flottent ici à côté
(direction artistique § 6, « Construction »). Ses pieds sont deux cloches flottantes, sans jambes.
"""

import math

from annuaire import SCALE
from workshop import MATTE, SIDES, anchor, enlarge, face, lathe, material, part, sphere

# Un pied en cloche, patte d'éléphant : large au sol, resserré puis bombé en haut.
FOOT = [
    (0, 0),
    (0.2, 0),
    (0.21, 0.03),
    (0.18, 0.09),
    (0.14, 0.15),
    (0.12, 0.19),
    (0.08, 0.215),
    (0, 0.225),
]
TRUNK, TRUNK_SHAPE, TRUNK_CENTER = 0.6, (1, 0.95, 0.78), (0, 0.86, 0)
SKULL, SKULL_SHAPE = 0.26, (1.1, 0.85, 1)


def moss_cap(name, theta, wave):
    """
    Une calotte de mousse, part de sphère unité ouverte de `theta` sous le pôle, dont le bord ondule
    de `wave` (0 : bord droit).
    """
    cap = sphere(name, 1, 40, 12, theta_length=theta)
    for vertex in cap.data.vertices:
        x, y, z = vertex.co
        t = math.acos(max(-1, min(1, z)))
        t *= 1 + wave * (t / theta) * math.sin(6 * math.atan2(y, x))
        s = math.sin(t)
        h = math.hypot(x, y) or 1
        vertex.co = (x / h * s, y / h * s, math.cos(t))
    cap.data.update()
    return cap


def build(color):
    """Compose le golem dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)
    poils = material("poils", "#5d7a3a", MATTE)  # la mousse
    fixe = material("fixe", "#f2c14e")  # les yeux, qui luisaient dans le prototype

    sol = anchor("sol")
    part(sphere("tronc", TRUNK, 28, 20), corps, sol, TRUNK_CENTER, scale=TRUNK_SHAPE)
    for side in SIDES:
        part(lathe(f"pied_{side.masculine}", FOOT, 28), corps, sol, (side.sign * 0.26, 0, 0.02))

    tete = anchor("tete", position=(0, 1.46, 0.05))
    center = (0, 0.22, 0)
    part(sphere("crane", SKULL, 28, 20), corps, tete, center, scale=SKULL_SHAPE)
    face(tete, center, SKULL, fixe)
    anchor("chapeau", tete, (0, 0.44, 0))

    # Une calotte festonnée sur les épaules, une plus petite sur le crâne, chacune un peu plus
    # grande que la pierre qu'elle couvre.
    shoulders = tuple(TRUNK * k * 1.02 for k in TRUNK_SHAPE)
    part(moss_cap("mousse", 0.27 * math.pi, 0.3), poils, sol, TRUNK_CENTER, scale=shoulders)
    crown = tuple(SKULL * k * 1.04 for k in SKULL_SHAPE)
    part(moss_cap("brin", 0.18 * math.pi, 0.3), poils, tete, center, scale=crown)

    for side in SIDES:
        main = anchor(f"main_{side.feminine}", position=(side.sign * 0.84, 0.76, 0.05))
        part(sphere(f"poing_{side.masculine}", 0.2, 20, 14), corps, main, scale=(1, 1.9, 1))

    enlarge(SCALE)
