"""
Le vampire, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Vampire ») : teint pâle, cape à haut col, mains nues. Cape et col, ouverts
dans le dos comme dans le prototype, pendent de l'ancre `dos` ; la cape s'arrondit à l'ourlet. Les
cheveux du prototype laissaient percer le haut du crâne : ils le couvrent ici.
"""

import math

from annuaire import SCALE, dome, hand, head, legs
from workshop import LEFT, MATTE, RIGHT, anchor, cylinder, enlarge, lathe, material, part

CAPE = [(0.42, -1.09), (0.49, -1.1), (0.525, -1.065), (0.515, -0.98), (0.22, 0)]


def build(color):
    """Compose le vampire dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)  # la cape
    secondaire = material("secondaire", "#1d1b22", MATTE)  # le pourpoint et les jambes
    peau = material("peau", "#e6dfe0")
    poils = material("poils", "#1d1b22")
    fixe = material("fixe", "#a32638")  # les yeux et le col

    sol = anchor("sol")
    legs(0.5, 0.09, secondaire, sol)
    part(cylinder("pourpoint", 0.17, 0.22, 0.6), secondaire, sol, (0, 0.78, 0))

    tete = head(0.23, peau, fixe, poils, (0, 1.1, 0), nose=False)  # le col le cacherait
    part(dome("cheveux", 0.245), poils, tete, (0, 0.27, -0.02), scale=(1, 0.85, 1))
    anchor("chapeau", tete, (0, 0.46, 0))

    # Deux troncs de cône ouverts, `CylinderGeometry` ouverte du prototype, tournés d'un demi-tour ;
    # la cape s'évase en bas en un ourlet arrondi, comme la robe du magicien, roulé en dedans.
    dos = anchor("dos", position=(0, 1.15, -0.02))
    cape = lathe("cape", CAPE, 32, math.pi * 1.2, math.pi * 1.6)
    part(cape, corps, dos)
    collar = lathe("col", [(0.2, -0.14), (0.3, 0.14)], 32, math.pi * 1.25, math.pi * 1.5)
    part(collar, fixe, dos, (0, 0.03, 0.02))

    hand(RIGHT, (0.45, 0.62, 0.12), peau)
    hand(LEFT, (0.45, 0.62, 0.12), peau)

    enlarge(SCALE)
