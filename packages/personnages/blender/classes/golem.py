"""
Le golem, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Golem ») : tout de pierre, de la mousse sur la tête ; ses gros poings de
pierre sont ses mains. Le prototype enfonçait tête et poings dans le tronc : ils flottent ici à côté
(direction artistique § 6, « Construction »).
"""

from annuaire import SCALE
from workshop import MATTE, anchor, cylinder, enlarge, material, part, sphere


def build(color):
    """Compose le golem dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)
    poils = material("poils", "#5d7a3a", MATTE)  # la mousse
    fixe = material("fixe", "#f2c14e")  # les yeux, qui luisaient dans le prototype

    sol = anchor("sol")
    part(sphere("tronc", 0.6, 10, 8), corps, sol, (0, 0.82, 0), scale=(1, 0.95, 0.78))
    for side, s in (("gauche", -1), ("droit", 1)):
        part(cylinder(f"pied_{side}", 0.15, 0.17, 0.24, 9), corps, sol, (s * 0.24, 0.12, 0))

    tete = anchor("tete", position=(0, 1.42, 0.05))
    part(sphere("crane", 0.26, 9, 7), corps, tete, (0, 0.22, 0), scale=(1.1, 0.85, 1))
    for side, s in (("gauche", -1), ("droit", 1)):
        part(sphere(f"oeil_{side}", 0.05, 10, 8), fixe, tete, (s * 0.1, 0.24, 0.22))
    part(sphere("mousse", 0.16, 10, 8), poils, tete, (0, 0.43, -0.05), scale=(1.3, 0.35, 1))
    anchor("chapeau", tete, (0, 0.44, 0))

    for side, s in (("gauche", -1), ("droite", 1)):
        main = anchor(f"main_{side}", position=(s * 0.84, 0.72, 0.05))
        part(sphere(f"poing_{side}", 0.2, 9, 7), corps, main, scale=(1, 1.9, 1))

    enlarge(SCALE)
