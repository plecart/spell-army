"""
Ce que partagent les classes portées du prototype `annuaire-bd.html` de la direction artistique
(fonction `buildCharacter`) : ses couleurs communes, sa tête à deux yeux, ses jambes, les mains
flottantes que le contrat ajoute (direction artistique § 6), et son échelle. Une classe s'y écrit
dans les unités du prototype, puis s'agrandit de `SCALE` (`workshop.enlarge`).
"""

import math
from functools import partial

import workshop
from mathutils import Matrix, Vector
from workshop import SIDES, anchor, cylinder, face, part, sphere, torus

# Les têtes du prototype ont de 0,23 à 0,26 de rayon : agrandies de 1,25, elles approchent celle du
# magicien, de 0,3, et les personnages les 2 unités du contrat (direction artistique § 7,
# « Repère ») ; la fée, réduite (`fairy.SIZE`), reste en deçà.
SCALE = 1.25

EYES = "#1b1a20"
WOOD = "#7a5434"
STEEL = "#b9bcc1"

PALM = 0.068  # rayon d'une main, 0,085 une fois agrandie : celui des mains du magicien

# La main de l'atelier, `hand(side, position, skin)`, de paume `PALM`.
hand = partial(workshop.hand, radius=PALM)


def head(radius, skin, eyes, brows, base, nose=1.0):
    """
    La tête : l'ancre `tete` en `base`, au bas du crâne, la sphère de peau `skin` de rayon `radius`
    posée dessus, ses yeux `eyes`, ses sourcils `brows` et son nez de peau, `nose` fois celui du
    magicien, aucun à 0 (`workshop.face`). Rend l'ancre.
    """
    tete = anchor("tete", position=base)
    part(sphere("visage", radius, 32, 24), skin, tete, (0, radius, 0))
    face(tete, (0, radius, 0), radius, eyes, brows, skin if nose else None, nose)
    return tete


def dome(name, radius):
    """Une demi-sphère ouverte en bas, casque ou calotte — `dome` du prototype."""
    return sphere(name, radius, 32, 16, theta_length=math.pi / 2)


def helmet(surface, chapeau, radius, tilt, squash=1.0, spike=0.0):
    """
    Le casque sous l'ancre `chapeau` : un dôme de rayon `radius`, aplati de `squash`, cerclé d'une
    bordure, basculé vers l'arrière de `tilt` (radians) pour que son bord avant passe au-dessus
    des sourcils et l'arrière descende sur la nuque ; une pointe haute de `spike` le coiffe, sur
    son axe basculé.
    """
    back = (-tilt, 0, 0)
    part(dome("casque", radius), surface, chapeau, rotation=back, scale=(1, squash, 1))
    rim = torus("bordure", radius - 0.005, radius * 0.08, 10, 40)
    part(rim, surface, chapeau, rotation=(math.pi / 2 - tilt, 0, 0))
    if spike:
        top = Matrix.Rotation(-tilt, 3, "X") @ Vector((0, radius * squash + spike * 0.25, 0))
        part(cylinder("pointe", 0, spike * 0.375, spike), surface, chapeau, tuple(top), back)


def legs(height, spread, surface, sol):
    """Les deux jambes sous `sol`, hautes de `height`, à `spread` de l'axe — `legs` du prototype."""
    for side in SIDES:
        leg = cylinder(f"jambe_{side.feminine}", 0.085, 0.095, height)
        part(leg, surface, sol, (side.sign * spread, height / 2, 0))
