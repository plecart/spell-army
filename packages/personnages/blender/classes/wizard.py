"""
Le magicien, brouillon porté du prototype `modeles.html` de la direction artistique (fonction
`magicien`), sans barbe ni moustache (direction artistique § 8, « Barbe de sorcier »).
"""

import math

from workshop import (
    MATTE,
    METAL,
    anchor,
    bent_cone,
    cylinder,
    lathe,
    material,
    octahedron,
    part,
    sphere,
    torus,
)

CLASS_COLOR = "#2e4a7d"  # couleur du magicien, direction artistique § 2

ROBE = [
    (0, 0),
    (0.47, 0),
    (0.49, 0.05),
    (0.41, 0.3),
    (0.31, 0.62),
    (0.26, 0.8),
    (0.19, 0.88),
    (0, 0.91),
]


def build():
    """Compose le magicien dans la scène vide."""
    corps = material("corps", CLASS_COLOR)
    secondaire = material("secondaire", "#b8893a", METAL)
    peau = material("peau", "#e8b892")
    poils = material("poils", "#d8d2c6", MATTE)
    coiffe = material("coiffe", CLASS_COLOR)
    accessoire = material("accessoire", "#6e4b2e", MATTE)
    fixe = material("fixe", "#1c1a22")

    sol = anchor("sol")
    part(lathe("robe", ROBE, 48), corps, sol)
    belt = torus("ceinture", 0.315, 0.035, 12, 40)
    part(belt, secondaire, sol, (0, 0.6, 0), (math.pi / 2, 0, 0))
    anchor("dos", position=(0, 0.72, -0.27))

    tete = anchor("tete", position=(0, 0.99, 0))
    part(sphere("visage", 0.3, 40, 30), peau, tete, (0, 0.25, 0))
    part(sphere("nez", 0.065, 20, 16), peau, tete, (0, 0.21, 0.3))
    for side, s in (("gauche", -1), ("droit", 1)):
        eye = sphere(f"oeil_{side}", 0.035, 16, 12)
        part(eye, fixe, tete, (s * 0.1, 0.3, 0.272), scale=(1, 1.3, 0.6))
        brow = cylinder(f"sourcil_{side}", 0.02, 0.02, 0.11, 12)
        part(brow, poils, tete, (s * 0.1, 0.365, 0.275), (0, 0, math.pi / 2 + s * 0.25))
    # Calotte ouverte de 0,9 rad de part et d'autre du visage, du chapeau jusqu'au bas des oreilles.
    hair = sphere(
        "cheveux",
        0.316,
        40,
        24,
        phi_start=math.pi / 2 + 0.9,
        phi_length=math.pi * 2 - 1.8,
        theta_start=math.pi * 0.25,
        theta_length=math.pi * 0.33,
    )
    part(hair, poils, tete, (0, 0.25, 0))

    chapeau = anchor("chapeau", tete, (0, 0.42, 0))
    part(cylinder("bord", 0.46, 0.46, 0.035, 48), coiffe, chapeau)
    part(cylinder("galon", 0.31, 0.31, 0.07, 40), secondaire, chapeau, (0, 0.05, 0))
    part(bent_cone("pointe", 0.3, 0.92, 0.03, 40), coiffe, chapeau, (0, 0.02, 0))

    main_gauche = anchor("main_gauche", position=(-0.5, 0.56, 0.1))
    part(sphere("paume_gauche", 0.085, 20, 16), peau, main_gauche, scale=(1, 1.1, 0.9))

    main_droite = anchor("main_droite", position=(0.52, 0.66, 0.14))
    part(sphere("paume_droite", 0.085, 20, 16), peau, main_droite, scale=(1, 1.1, 0.9))
    part(cylinder("baton", 0.03, 0.035, 1.62, 16), accessoire, main_droite, (0, 0.1, 0))
    part(octahedron("gemme", 0.11), secondaire, main_droite, (0, 1.0, 0))
