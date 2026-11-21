"""
La fée, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Fée ») : robe en cône, chignon, ailes translucides et baguette étoilée. Le
prototype enfonçait la tête dans la pointe de la robe : elle flotte ici au-dessus.
"""

from annuaire import EYES, SCALE, hand, head
from workshop import (
    LEFT,
    PAINT,
    RIGHT,
    SIDES,
    anchor,
    cylinder,
    enlarge,
    material,
    octahedron,
    part,
    sphere,
)

# Le verre du prototype : un matériau d'opacité 0,55, exporté en `alphaMode` BLEND.
GLASS = {**PAINT, "Roughness": 0.2, "Alpha": 0.55}
SIZE = 0.82  # la fée du prototype est réduite d'autant

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
    part(cylinder("robe", 0, 0.33, 0.72), corps, sol, (0, 0.42, 0))

    tete = head(0.24, peau, fixe, (0, 0.8, 0))
    hair = sphere("cheveux", 0.26, 32, 24)
    part(hair, poils, tete, (0, 0.29, -0.05), scale=(1, 0.92, 0.9))
    part(sphere("chignon", 0.1, 32, 24), poils, tete, (0, 0.52, -0.1))
    anchor("chapeau", tete, (0, 0.48, 0))

    # Les ailes, plus en arrière que dans le prototype, où elles traversaient les cheveux.
    dos = anchor("dos", position=(0, 0.82, -0.3))
    for side in SIDES:
        for name, y, size, tilt in WINGS:
            wing = sphere(f"aile_{name}_{side.feminine}", 1, 20, 15)
            shape = (size * 0.55, size, 0.025)
            part(wing, secondaire, dos, (side.sign * 0.3, y, 0), (0, 0, -side.sign * tilt), shape)

    main_droite = hand(RIGHT, (0.29, 0.53, 0.1), peau)
    outward = RIGHT.sign  # la baguette penche vers l'extérieur de la main
    wand = cylinder("baguette", 0.014, 0.014, 0.5, 8)
    part(wand, accessoire, main_droite, (outward * 0.03, 0.09, 0), (0, 0, -outward * 0.35))
    part(octahedron("etoile", 0.07), accessoire, main_droite, (outward * 0.12, 0.33, 0))
    hand(LEFT, (0.29, 0.53, 0.1), peau)

    enlarge(SCALE * SIZE)
