"""
Le nain, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Nain ») : casque à pointe, barbe et hache. Le prototype enfonçait la tête
dans la tunique : elle flotte ici au-dessus, et la barbe, raccourcie, s'arrête sur la tunique ; sa
ceinture, plus étroite que la tunique, n'y paraissait pas : elle la déborde ici.
"""

from annuaire import EYES, SCALE, STEEL, dome, hand, head, legs
from workshop import LEFT, MATTE, METAL, RIGHT, anchor, box, cylinder, enlarge, material, part


def build(color):
    """Compose le nain dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)
    secondaire = material("secondaire", "#4a3426", MATTE)  # la ceinture et le manche de la hache
    peau = material("peau", "#e8b892")
    poils = material("poils", "#a0522d", MATTE)
    coiffe = material("coiffe", STEEL, METAL)
    accessoire = material("accessoire", STEEL, METAL)  # le fer de la hache
    fixe = material("fixe", EYES)

    sol = anchor("sol")
    legs(0.24, 0.13, fixe, sol)
    part(cylinder("tunique", 0.3, 0.36, 0.5), corps, sol, (0, 0.48, 0))
    part(cylinder("ceinture", 0.35, 0.358, 0.07), secondaire, sol, (0, 0.38, 0))

    # La barbe part du milieu du visage et finit en pointe sur la tunique, haute de 0,73.
    tete = head(0.26, peau, fixe, (0, 0.8, 0))
    part(cylinder("barbe", 0.25, 0, 0.33), poils, tete, (0, 0.095, 0.13))
    chapeau = anchor("chapeau", tete, (0, 0.29, 0))
    part(dome("casque", 0.275), coiffe, chapeau)
    part(cylinder("pointe", 0, 0.06, 0.16), coiffe, chapeau, (0, 0.33, 0))

    main_droite = hand(RIGHT, (0.45, 0.55, 0.06), peau)
    part(cylinder("manche", 0.025, 0.025, 0.8), secondaire, main_droite, (0, -0.05, 0))
    part(box("fer", 0.24, 0.15, 0.15), accessoire, main_droite, (0, 0.35, 0))
    hand(LEFT, (0.45, 0.55, 0.06), peau)

    enlarge(SCALE)
