"""
Le paysan, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Paysan ») : chapeau de paille et fourche. Le prototype enfonçait la tête
dans la chemise : elle flotte ici au-dessus, le chapeau enfoncé dessus ; le tronc est une seule
révolution arrondie, la chemise, que la salopette habille du bas jusqu'à la bavette et aux
bretelles. La fourche passe à côté de son bord et au-dessus ; dents, traverse et manche sont d'une
même section ronde, chaque dent posée sur la traverse.
"""

import math

from annuaire import SCALE, WOOD, hand, head, legs
from workshop import (
    LEFT,
    MATTE,
    RIGHT,
    anchor,
    between,
    cylinder,
    enlarge,
    lathe,
    material,
    part,
    rounded,
    sphere,
)

TORSO = rounded(0.27, 0.24, 0.62, 0.04, 0.14)  # la chemise, du bas aux épaules
TORSO_BASE = 0.33
WAIST = 0.36  # hauteur, sur le tronc, du haut de la culotte de la salopette
BIB = 0.52  # hauteur du haut de la bavette
STRAP = 0.16  # demi-angle, en radians, d'une bretelle autour de son axe
TINE = 0.016  # rayon des dents, de la traverse et du haut du manche
SPREAD = 0.1  # écart des dents à l'axe du manche


def build(color):
    """Compose le paysan dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)  # la salopette
    secondaire = material("secondaire", "#e9e1cf", MATTE)  # la chemise
    peau = material("peau", "#f3d2b5")
    poils = material("poils", "#6b4a2b", MATTE)
    coiffe = material("coiffe", "#d9b45a", MATTE)  # la paille
    accessoire = material("accessoire", WOOD, MATTE)  # la fourche, toute de bois
    fixe = material("fixe", "#4a3a2c", MATTE)  # les yeux, les boutons et le galon du chapeau

    sol = anchor("sol")
    legs(0.35, 0.11, corps, sol)
    torso = (0, TORSO_BASE, 0)
    part(lathe("chemise", TORSO, 48), secondaire, sol, torso)
    pants = [(0, 0), *between(TORSO, 0, WAIST, 1.03), (0, WAIST)]
    part(lathe("culotte", pants, 48), corps, sol, torso)
    bib = between(TORSO, WAIST - 0.02, BIB, 1.03)
    part(lathe("bavette", bib, 16, -0.55, 1.1), corps, sol, torso)
    top = TORSO[-1][1]
    for side, angle in (("gauche", 0.36), ("droite", -0.36)):
        strap = between(TORSO, BIB - 0.02, top - 0.005, 1.035)
        part(lathe(f"bretelle_{side}", strap, 4, angle - STRAP, 2 * STRAP), corps, sol, torso)
        button = sphere(f"bouton_{side}", 0.018, 10, 8)
        radius = 0.255 * 1.03
        position = (radius * math.sin(angle), TORSO_BASE + BIB - 0.04, radius * math.cos(angle))
        part(button, fixe, sol, position)

    tete = head(0.24, peau, fixe, poils, (0, 1.02, 0))
    chapeau = anchor("chapeau", tete, (0, 0.39, 0))
    part(cylinder("bord", 0.42, 0.42, 0.03), coiffe, chapeau)
    part(cylinder("calotte", 0.2, 0.24, 0.17), coiffe, chapeau, (0, 0.09, 0))
    part(cylinder("galon", 0.245, 0.245, 0.045), fixe, chapeau, (0, 0.04, 0))

    main_droite = hand(RIGHT, (0.47, 0.72, 0.06), peau)
    part(cylinder("manche", TINE * 1.5, TINE * 1.5, 1.65), accessoire, main_droite, (0, 0.105, 0))
    head_y = 0.93  # le haut du manche, où passe la traverse
    crossbar = cylinder("traverse", TINE, TINE, 2 * SPREAD, 8)
    part(crossbar, accessoire, main_droite, (0, head_y, 0), (0, 0, math.pi / 2))
    for i, dx in enumerate((-SPREAD, 0, SPREAD), 1):
        tine = cylinder(f"dent_{i}", TINE * 0.3, TINE, 0.26, 8)
        part(tine, accessoire, main_droite, (dx, head_y + 0.13, 0))
        part(sphere(f"noeud_{i}", TINE, 8, 6), accessoire, main_droite, (dx, head_y, 0))
    hand(LEFT, (0.42, 0.62, 0.08), peau)

    enlarge(SCALE)
