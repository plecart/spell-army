"""
Le guerrier, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Guerrier ») : casque à nasal, épée et bouclier rond. Le prototype enfonçait
la tête dans le plastron et le bouclier dans le corps : la tête flotte ici au-dessus, et le bouclier
se tient par son bord, à côté.
"""

import math

from annuaire import EYES, SCALE, STEEL, dome, hand, head, legs
from workshop import METAL, anchor, box, cylinder, enlarge, material, part, sphere, torus

SHIELD = 0.29  # rayon du bouclier
TILT = 0.25  # le bouclier se tourne d'autant vers l'extérieur, autour de l'axe vertical


def build(color):
    """Compose le guerrier dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)
    secondaire = material("secondaire", STEEL, METAL)
    peau = material("peau", "#d9a27c")
    coiffe = material("coiffe", STEEL, METAL)
    accessoire = material("accessoire", STEEL, METAL)
    fixe = material("fixe", EYES)

    sol = anchor("sol")
    legs(0.42, 0.12, fixe, sol)
    part(cylinder("tunique", 0.23, 0.27, 0.55), corps, sol, (0, 0.7, 0))
    breastplate = sphere("plastron", 0.26, 32, 24)
    part(breastplate, secondaire, sol, (0, 0.82, 0.05), scale=(1, 0.85, 0.75))

    tete = head(0.23, peau, fixe, (0, 1.06, 0))
    chapeau = anchor("chapeau", tete, (0, 0.26, 0))
    part(dome("casque", 0.25), coiffe, chapeau)
    part(box("nasal", 0.06, 0.22, 0.03), coiffe, chapeau, (0, -0.1, 0.24))

    main_droite = hand("droite", (0.4, 0.52, 0.08), peau)
    part(box("lame", 0.05, 0.72, 0.02), accessoire, main_droite, (0, 0.43, 0))
    part(box("garde", 0.22, 0.04, 0.07), accessoire, main_droite, (0, 0.06, 0))

    # La main tient le bord intérieur du bouclier : son centre est à un rayon, dans son plan, et son
    # cerclage à 0,03 devant, le long de sa normale.
    main_gauche = hand("gauche", (-0.32, 0.66, 0.13), peau)
    center = (-SHIELD * math.cos(TILT), 0, -SHIELD * math.sin(TILT))
    disc = cylinder("bouclier", SHIELD, SHIELD, 0.05)
    part(disc, corps, main_gauche, center, (math.pi / 2, 0, TILT))
    rim = (center[0] - 0.03 * math.sin(TILT), 0, center[2] + 0.03 * math.cos(TILT))
    part(torus("cerclage", SHIELD, 0.025, 8, 32), secondaire, main_gauche, rim, (0, -TILT, 0))

    enlarge(SCALE)
