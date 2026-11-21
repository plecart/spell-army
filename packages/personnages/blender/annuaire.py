"""
Ce que partagent les classes portées du prototype `annuaire-bd.html` de la direction artistique
(fonction `buildCharacter`) : ses couleurs communes, sa tête à deux yeux, ses jambes, les mains
flottantes que le contrat ajoute (direction artistique § 6), et son échelle. Une classe s'y écrit
dans les unités du prototype, puis s'agrandit de `SCALE` (`workshop.enlarge`).
"""

import math

from workshop import anchor, cylinder, part, sphere

# Les têtes du prototype ont de 0,23 à 0,26 de rayon : agrandies de 1,25, elles approchent celle du
# magicien, de 0,3, et les personnages les 2 unités du contrat (direction artistique § 7,
# « Repère »).
SCALE = 1.25

EYES = "#1b1a20"
WOOD = "#7a5434"
STEEL = "#b9bcc1"

PALM = 0.068  # rayon d'une main, 0,085 une fois agrandie : celui des mains du magicien


def head(radius, skin, eyes, base):
    """
    La tête : l'ancre `tete` en `base`, au bas du crâne, la sphère de peau `skin` de rayon `radius`
    posée dessus, et ses deux yeux `eyes` — `head` du prototype. Rend l'ancre.
    """
    tete = anchor("tete", position=base)
    part(sphere("visage", radius, 32, 24), skin, tete, (0, radius, 0))
    for side, s in (("gauche", -1), ("droit", 1)):
        eye = sphere(f"oeil_{side}", radius * 0.13, 12, 9)
        part(eye, eyes, tete, (s * radius * 0.36, radius * 1.1, radius * 0.92))
    return tete


def dome(name, radius):
    """Une demi-sphère ouverte en bas, casque ou calotte — `dome` du prototype."""
    return sphere(name, radius, 32, 16, theta_length=math.pi / 2)


def legs(height, spread, surface, sol):
    """Les deux jambes sous `sol`, hautes de `height`, à `spread` de l'axe — `legs` du prototype."""
    for side, s in (("gauche", -1), ("droite", 1)):
        leg = cylinder(f"jambe_{side}", 0.085, 0.095, height)
        part(leg, surface, sol, (s * spread, height / 2, 0))


def hand(side, position, skin):
    """
    L'ancre `main_<side>` en `position`, portant sa paume flottante de peau `skin`, comme celles du
    magicien ; l'objet tenu s'accroche ensuite à l'ancre rendue.
    """
    main = anchor(f"main_{side}", position=position)
    part(sphere(f"paume_{side}", PALM, 20, 16), skin, main, scale=(1, 1.1, 0.9))
    return main
