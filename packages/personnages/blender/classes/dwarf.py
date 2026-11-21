"""
Le nain, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Nain ») : casque à pointe et marteau, sans la barbe du prototype. Le
prototype enfonçait la tête dans la tunique : elle flotte ici au-dessus ; la tunique s'arrondit au
cou et à l'ourlet, et sa ceinture est un anneau de bronze, comme celle du magicien.
"""

import math

from annuaire import EYES, SCALE, STEEL, hand, head, helmet, legs
from workshop import (
    LEFT,
    MATTE,
    METAL,
    RIGHT,
    anchor,
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

BRONZE = "#b8893a"  # le galon du magicien
HELMET_TILT = 0.3  # le casque bascule d'autant vers l'arrière, en radians
FORWARD = (math.pi / 2, 0, 0)  # le +Y d'un cylindre couché vers l'avant, +Z


def build(color):
    """Compose le nain dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)
    secondaire = material("secondaire", BRONZE, METAL)  # la ceinture et les cerclages du marteau
    peau = material("peau", "#e8b892")
    poils = material("poils", "#a0522d", MATTE)  # les sourcils, et le manche du même brun
    coiffe = material("coiffe", STEEL, METAL)
    accessoire = material("accessoire", STEEL, METAL)  # le fer du marteau
    fixe = material("fixe", EYES)

    sol = anchor("sol")
    legs(0.24, 0.13, fixe, sol)
    part(lathe("tunique", rounded(0.36, 0.3, 0.5, 0.04, 0.13), 48), corps, sol, (0, 0.23, 0))
    part(torus("ceinture", 0.35, 0.035, 12, 48), secondaire, sol, (0, 0.38, 0), (math.pi / 2, 0, 0))
    part(box("boucle", 0.1, 0.085, 0.03), secondaire, sol, (0, 0.38, 0.375))

    tete = head(0.26, peau, fixe, poils, (0, 0.8, 0))
    helmet(coiffe, anchor("chapeau", tete, (0, 0.33, 0)), 0.275, HELMET_TILT, 0.9, 0.16)

    main_droite = hand(RIGHT, (0.45, 0.55, 0.08), peau)
    part(cylinder("manche", 0.028, 0.028, 0.76, 12), poils, main_droite, (0, 0.2, 0))
    part(sphere("pommeau", 0.04, 12, 9), secondaire, main_droite, (0, -0.19, 0))
    top = (0, 0.6, 0)
    part(cylinder("fer", 0.085, 0.085, 0.3, 24), accessoire, main_droite, top, FORWARD)
    for i, z in enumerate((-0.12, 0.12), 1):
        ring = torus(f"cerclage_{i}", 0.088, 0.016, 8, 24)
        part(ring, secondaire, main_droite, (0, 0.6, z))
    hand(LEFT, (0.45, 0.55, 0.08), peau)

    enlarge(SCALE)
