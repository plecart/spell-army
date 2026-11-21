"""
Le paysan, brouillon porté du prototype `annuaire-bd.html` de la direction artistique (fonction
`buildCharacter`, cas « Paysan ») : chapeau de paille et fourche. Le prototype enfonçait la tête
dans la chemise : elle flotte ici au-dessus, avec le chapeau ; la fourche, allongée et écartée,
passe à côté de son bord et au-dessus, quand celle du prototype le traverserait.
"""

from annuaire import SCALE, WOOD, hand, head, legs
from workshop import MATTE, anchor, box, cylinder, enlarge, material, part, sphere


def build(color):
    """Compose le paysan dans la scène vide, `color` la couleur de sa classe."""
    corps = material("corps", color)
    secondaire = material("secondaire", "#e9e1cf", MATTE)  # la chemise
    peau = material("peau", "#f3d2b5")
    coiffe = material("coiffe", "#d9b45a", MATTE)  # la paille
    accessoire = material("accessoire", WOOD, MATTE)  # la fourche, toute de bois
    fixe = material("fixe", "#4a3a2c", MATTE)  # les yeux, les jambes et le galon du chapeau

    sol = anchor("sol")
    legs(0.35, 0.11, fixe, sol)
    part(cylinder("tunique", 0.24, 0.27, 0.55), corps, sol, (0, 0.6, 0))
    part(sphere("chemise", 0.25, 32, 24), secondaire, sol, (0, 0.88, 0), scale=(1, 0.7, 0.85))

    tete = head(0.24, peau, fixe, (0, 1.08, 0))
    chapeau = anchor("chapeau", tete, (0, 0.4, 0))
    part(cylinder("bord", 0.42, 0.42, 0.03), coiffe, chapeau)
    part(cylinder("calotte", 0.2, 0.24, 0.17), coiffe, chapeau, (0, 0.09, 0))
    part(cylinder("galon", 0.245, 0.245, 0.045), fixe, chapeau, (0, 0.03, 0))

    main_droite = hand("droite", (0.47, 0.72, 0.06), peau)
    part(cylinder("manche", 0.024, 0.024, 1.65), accessoire, main_droite, (0, 0.105, 0))
    part(box("traverse", 0.22, 0.03, 0.03), accessoire, main_droite, (0, 0.93, 0))
    for i, dx in enumerate((-0.1, 0, 0.1), 1):
        tine = cylinder(f"dent_{i}", 0.012, 0.012, 0.24, 8)
        part(tine, accessoire, main_droite, (dx, 1.06, 0))
    hand("gauche", (-0.42, 0.62, 0.08), peau)

    enlarge(SCALE)
