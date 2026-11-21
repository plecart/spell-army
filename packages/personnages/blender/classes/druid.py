"""
Le druide, brouillon d'après le prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Druide »), redessiné : bois de cerf sur des cheveux blancs, robe arrondie
au cou et à l'ourlet, et un bâton de branche cassée, sans feuillage. La tête flotte au-dessus de la
robe.
"""

import math

from annuaire import EYES, SCALE, WOOD, hand, head
from workshop import (
    LEFT,
    MATTE,
    RIGHT,
    SIDES,
    anchor,
    crooked,
    cylinder,
    enlarge,
    hair,
    lathe,
    material,
    part,
    rounded,
)

HEAD = 0.23
STAFF_KINKS = [(0.3, 0.035), (0.5, 0), (0.85, 0.05), (1.25, -0.01)]


def build(color):
    """Compose le druide dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)
    peau = material("peau", "#d9a27c")
    poils = material("poils", "#e3ddd0", MATTE)
    accessoire = material("accessoire", WOOD, MATTE)  # le bâton, et les bois de cerf
    fixe = material("fixe", EYES)

    sol = anchor("sol")
    part(lathe("robe", rounded(0.4, 0.2, 0.95, 0.04, 0.14), 48), corps, sol)

    tete = head(HEAD, peau, fixe, poils, (0, 1.0, 0.03))
    center = (0, HEAD, 0)
    chapeau = anchor("chapeau", tete, (0, 2 * HEAD + 0.02, 0))

    hair("cheveux", HEAD * 1.06, poils, tete, center, math.pi * 0.62)
    for side in SIDES:
        beam = crooked(f"bois_{side.masculine}", 0.026, 0.012, 0.34, [(0.12, 0.04), (0.34, 0.1)], 8)
        part(beam, accessoire, chapeau, (side.sign * 0.12, -0.06, 0), (0, 0, -side.sign * 0.55))
        tine = cylinder(f"andouiller_{side.masculine}", 0.004, 0.012, 0.12, 8)
        part(tine, accessoire, chapeau, (side.sign * 0.12, 0.13, 0.02), (0, 0, side.sign * 0.35))

    main_droite = hand(RIGHT, (0.47, 0.7, 0.08), peau)
    staff = crooked("baton", 0.036, 0.026, 1.62, STAFF_KINKS)
    part(staff, accessoire, main_droite, (0, -0.5, 0))
    hand(LEFT, (0.45, 0.66, 0.08), peau)

    enlarge(SCALE)
