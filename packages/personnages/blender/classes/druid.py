"""
Le druide, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Druide ») : capuche, couronne de feuilles et bâton feuillu. Le prototype
enfonçait tête et capuche dans la robe : elles flottent ici au-dessus.
"""

import math

from annuaire import EYES, SCALE, WOOD, hand, head
from workshop import MATTE, anchor, cylinder, enlarge, material, part, shade, sphere

STAFF_LEAVES = ((-0.04, 0.88, 0), (0.06, 0.86, 0.03), (0.01, 0.94, -0.05))


def build(color):
    """Compose le druide dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)
    secondaire = material("secondaire", "#7fae4f")  # les feuilles
    peau = material("peau", "#d9a27c")
    coiffe = material("coiffe", shade(color, 0.85))  # la capuche
    accessoire = material("accessoire", WOOD, MATTE)
    fixe = material("fixe", EYES)

    sol = anchor("sol")
    part(cylinder("robe", 0.18, 0.4, 0.95), corps, sol, (0, 0.475, 0))

    tete = head(0.23, peau, fixe, (0, 1.01, 0.09))
    part(sphere("capuche", 0.31, 32, 24), coiffe, tete, (0, 0.27, -0.15))
    chapeau = anchor("chapeau", tete, (0, 0.49, -0.09))
    for i in range(5):
        a = math.pi * (0.175 * i - 0.35)
        leaf = sphere(f"couronne_{i + 1}", 0.07, 10, 8)
        position = (math.sin(a) * 0.28, math.cos(a) * 0.05, math.cos(a) * 0.12)
        part(leaf, secondaire, chapeau, position, scale=(1, 0.45, 1.6))

    main_droite = hand("droite", (0.47, 0.72, 0.05), peau)
    staff = cylinder("baton", 0.03, 0.035, 1.55)
    part(staff, accessoire, main_droite, (0, 0.06, 0), (0, 0, -0.04))
    for i, position in enumerate(STAFF_LEAVES, 1):
        leaf = sphere(f"feuillage_{i}", 0.07, 10, 8)
        part(leaf, secondaire, main_droite, position, scale=(1, 0.5, 1))
    hand("gauche", (-0.45, 0.68, 0.08), peau)

    enlarge(SCALE)
