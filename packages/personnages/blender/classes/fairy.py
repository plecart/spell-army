"""
La fée, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Fée ») : robe en cône, chignon, ailes translucides et baguette étoilée. Le
prototype enfonçait la tête dans la pointe de la robe : elle flotte ici au-dessus, et la robe
s'arrondit au cou.
"""

import math

from annuaire import EYES, SCALE, hand, head
from workshop import (
    LEFT,
    PAINT,
    RIGHT,
    SIDES,
    anchor,
    cylinder,
    enlarge,
    hair,
    lathe,
    material,
    octahedron,
    part,
    rounded,
    sphere,
)

# Le verre du prototype : un matériau d'opacité 0,55, exporté en `alphaMode` BLEND.
GLASS = {**PAINT, "Roughness": 0.2, "Alpha": 0.55}
SIZE = 0.82  # la fée du prototype est réduite d'autant
HEAD = 0.24  # rayon de la tête
HAIRLINE = math.pi * 0.3  # la calotte descend d'autant sous le sommet, au-dessus des sourcils
WAND_LEAN = 0.35  # la baguette penche d'autant vers l'extérieur de la main

# Les ailes de chaque côté : nom, hauteur sur l'ancre `dos`, taille et inclinaison vers l'extérieur.
WINGS = (("haute", 0.13, 0.42, 0.55), ("basse", -0.12, 0.3, 1.0))


def build(color):
    """Compose la fée dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)
    secondaire = material("secondaire", "#e6f4f1", GLASS)  # les ailes
    peau = material("peau", "#f3d2b5")
    poils = material("poils", "#2b2b2b")
    accessoire = material("accessoire", "#f2d27a")  # la baguette et son étoile
    fixe = material("fixe", EYES)

    sol = anchor("sol")
    part(lathe("robe", rounded(0.33, 0.1, 0.72, 0.035, 0.1), 48), corps, sol, (0, 0.06, 0))

    tete = head(HEAD, peau, fixe, poils, (0, 0.8, 0))
    # Les cheveux : une calotte jusqu'au-dessus des sourcils, puis, hors du visage, l'arrière et les
    # côtés jusqu'à la nuque, comme ceux du magicien ; le chignon au sommet, sur l'axe.
    center = (0, HEAD, 0)
    hair("cheveux", HEAD * 1.06, poils, tete, center, math.pi * 0.6, HAIRLINE)
    part(sphere("chignon", 0.1, 32, 24), poils, tete, (0, 2 * HEAD + 0.06, -0.05))
    anchor("chapeau", tete, (0, 0.48, 0))

    # Les ailes, plus en arrière que dans le prototype, où elles traversaient les cheveux.
    dos = anchor("dos", position=(0, 0.82, -0.3))
    for side in SIDES:
        for name, y, size, tilt in WINGS:
            wing = sphere(f"aile_{name}_{side.feminine}", 1, 20, 15)
            shape = (size * 0.55, size, 0.025)
            part(wing, secondaire, dos, (side.sign * 0.3, y, 0), (0, 0, -side.sign * tilt), shape)

    main_droite = hand(RIGHT, (0.29, 0.53, 0.1), peau)
    # La baguette penche vers l'extérieur de la main, qui la tient près du bas ; l'étoile en
    # prolonge l'axe, pointe basse sur son bout.
    lean = (0, 0, -RIGHT.sign * WAND_LEAN)
    axis = (RIGHT.sign * math.sin(WAND_LEAN), math.cos(WAND_LEAN), 0)
    middle, star = (tuple(d * a for a in axis) for d in (0.15, 0.46))
    part(cylinder("baguette", 0.014, 0.014, 0.5, 8), accessoire, main_droite, middle, lean)
    part(octahedron("etoile", 0.07), accessoire, main_droite, star, lean)
    hand(LEFT, (0.29, 0.53, 0.1), peau)

    enlarge(SCALE * SIZE)
