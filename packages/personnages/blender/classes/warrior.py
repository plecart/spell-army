"""
Le guerrier, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Guerrier ») : casque, épée et bouclier rond. Son tronc est une seule
révolution arrondie, cotte de sa couleur ; la cuirasse d'acier en épouse le haut. Le casque coiffe
le crâne, basculé vers l'arrière au-dessus des sourcils ; le bouclier se tient par son centre, la
main derrière, et l'épée monte droit de la main, garde et lame sur un même axe.
"""

import math

from annuaire import EYES, SCALE, STEEL, dome, hand, head, helmet, legs
from workshop import (
    LEFT,
    METAL,
    RIGHT,
    anchor,
    between,
    box,
    cylinder,
    enlarge,
    lathe,
    material,
    part,
    rounded,
    sphere,
    torus,
)

TORSO = rounded(0.27, 0.22, 0.62, 0.04, 0.12)  # du bas de la cotte aux épaules
HELMET_TILT = 0.35  # le casque bascule d'autant vers l'arrière, en radians
WAIST = 0.42  # hauteur, sur le tronc, du bas de la cuirasse
SHIELD = 0.27  # rayon du bouclier
TURN = 0.5  # le bouclier se tourne d'autant vers l'extérieur, autour de l'axe vertical
BLADE = [(0, 0), (0.045, 0), (0.045, 0.5), (0.03, 0.56), (0, 0.66)]  # demi-largeur, hauteur


def build(color):
    """Compose le guerrier dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)
    secondaire = material("secondaire", STEEL, METAL)  # la cuirasse et le bord du bouclier
    peau = material("peau", "#d9a27c")
    poils = material("poils", "#4a3426")
    coiffe = material("coiffe", STEEL, METAL)
    accessoire = material("accessoire", STEEL, METAL)  # l'épée
    fixe = material("fixe", EYES)

    sol = anchor("sol")
    legs(0.4, 0.12, fixe, sol)
    part(lathe("tunique", TORSO, 48), corps, sol, (0, 0.4, 0))
    top = TORSO[-1][1]
    cuirass = [*between(TORSO, WAIST, top, 1.04), (0, top + 0.015)]
    part(lathe("plastron", cuirass, 48), secondaire, sol, (0, 0.4, 0))

    tete = head(0.23, peau, fixe, poils, (0, 1.08, 0))
    helmet(coiffe, anchor("chapeau", tete, (0, 0.28, -0.01)), 0.25, HELMET_TILT)

    # L'épée : poignée dans la main, garde au-dessus, lame tranchante, pommeau en dessous.
    main_droite = hand(RIGHT, (0.42, 0.72, 0.14), peau)
    part(cylinder("poignee", 0.02, 0.02, 0.16, 12), fixe, main_droite)
    part(sphere("pommeau", 0.035, 12, 9), accessoire, main_droite, (0, -0.1, 0))
    part(box("garde", 0.2, 0.035, 0.05), accessoire, main_droite, (0, 0.1, 0))
    blade = lathe("lame", BLADE, 4, math.pi / 2)  # quatre côtés : l'arête vers ±X, à plat de face
    part(blade, accessoire, main_droite, (0, 0.115, 0), scale=(1, 1, 0.28))

    # Le bouclier, de face et tourné vers l'extérieur, centré devant la main qui le tient.
    main_gauche = hand(LEFT, (0.46, 0.66, 0.16), peau)
    outward = LEFT.sign
    normal = (outward * math.sin(TURN), 0, math.cos(TURN))
    center = tuple(0.1 * n for n in normal)
    facing = (0, outward * TURN, 0)  # le +Z d'un tore vers `normal`
    upright = (math.pi / 2, 0, -outward * TURN)  # le +Y d'un disque ou d'un dôme vers `normal`
    part(cylinder("bouclier", SHIELD, SHIELD, 0.04), corps, main_gauche, center, upright)
    rim = tuple(c + 0.015 * n for c, n in zip(center, normal))
    part(torus("cerclage", SHIELD, 0.022, 8, 40), secondaire, main_gauche, rim, facing)
    boss = tuple(c + 0.02 * n for c, n in zip(center, normal))
    part(dome("umbo", 0.07), secondaire, main_gauche, boss, upright)

    enlarge(SCALE)
