"""Tire une icône de la version épinglée de son jeu et la copie dans le dossier d'icônes du skill.

Usage :
    python icones.py <nom> (--simple-icons | --lucide)

`<nom>` est le nom du SVG chez l'amont, sans extension : le slug Simple Icons d'un logo
(`--simple-icons`), le nom Lucide d'une icône neutre (`--lucide`), chacun dans la forme de son jeu
(`FORMES_DES_NOMS`). Le SVG se tire de la version épinglée par son URL versionnée sur jsDelivr, et
s'écrit tel quel dans `icones/<jeu>/<nom>.svg`. Un logo y ajoute sa couleur, lue dans les données
de la même version, à `icones/simple-icons/couleurs.json`, clés triées. Rien ne s'écrit avant que
tout soit lu.

Sortie : 0 et ce qui a été écrit, ou que l'icône est déjà là ; 1 et son motif en une ligne sur la
sortie d'erreur — nom inconnu chez l'amont (404), réseau en échec, données de l'amont illisibles,
le champ fautif nommé, logo absent des données, nom déjà pris par l'autre jeu — ; 2 et son motif,
appel mal formé — nom hors de la forme de son jeu compris —, nom présent dans les deux jeux ou
fichier des couleurs illisible. Python 3.11 ou plus, bibliothèque standard seule.
"""

import argparse
import json
import re
import sys
import unicodedata
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import cast
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from description import (
    COULEURS_DES_LOGOS,
    ICONES,
    LOGOS,
    NEUTRES,
    Abandon,
    est_couleur,
    est_liste,
    est_objet,
    est_texte,
    icones_disponibles,
    lire_couleurs,
    sorties_en_utf_8,
)

SIMPLE_ICONS = "15.0.0"
LUCIDE = "0.460.0"
CDN = "https://cdn.jsdelivr.net/npm"
# L'URL du SVG d'une icône, par jeu.
SOURCES = {
    LOGOS: f"{CDN}/simple-icons@{SIMPLE_ICONS}/icons/{{}}.svg",
    NEUTRES: f"{CDN}/lucide-static@{LUCIDE}/icons/{{}}.svg",
}
# La forme d'un nom d'icône, par jeu ; aucune ne sort du dossier du jeu ni ne change l'URL. Un slug
# Simple Icons : motif `slug` de son `.jsonschema.json`, un modificateur après `_` départageant
# deux marques homonymes. Un nom Lucide : minuscules, chiffres et tirets. Couvrent les 3 291 slugs
# de la 15.0.0 et les 1 539 noms de lucide-static 0.460.0 (mesuré le 2026-11-05).
FORMES_DES_NOMS = {LOGOS: "[a-z0-9]+(_[a-z0-9]+)?", NEUTRES: "[a-z0-9-]+"}
# Le titre et la couleur de chaque logo ; le `data.json` du matériel de départ n'est pas celui de
# cette version (mesuré).
DONNEES = f"{CDN}/simple-icons@{SIMPLE_ICONS}/data/simple-icons.json"
DELAI = 30  # secondes par requête
# `titleToSlug` de Simple Icons (`sdk.mjs` de la 15.0.0) : ces caractères remplacés, puis la
# décomposition NFD, puis tout ce qui n'est ni minuscule ASCII ni chiffre retiré. Rend les
# 3 291 noms de `icons/` de la 15.0.0 pour ses 3 291 logos (mesuré le 2026-11-05).
REMPLACEMENTS = {
    "+": "plus",
    ".": "dot",
    "&": "and",
    "đ": "d",
    "ħ": "h",
    "ı": "i",
    "ĸ": "k",
    "ŀ": "l",
    "ł": "l",
    "ß": "ss",
    "ŧ": "t",
    "ø": "o",
}


def slug(titre: str) -> str:
    """Le slug d'un logo de titre `titre`, comme le calcule Simple Icons."""
    remplace = "".join(REMPLACEMENTS.get(caractere, caractere) for caractere in titre.lower())
    return re.sub("[^a-z0-9]", "", unicodedata.normalize("NFD", remplace))


def tirer(url: str) -> bytes:
    """Le contenu de `url`.

    Raises:
        URLError: le réseau a échoué ; `HTTPError`, sa sous-classe, si l'amont a répondu une
            erreur, 404 pour un nom inconnu.
    """
    with urlopen(url, timeout=DELAI) as reponse:
        return cast(bytes, reponse.read())


def slug_de(fiche: Mapping[str, object], rang: int) -> str:
    """Le slug de `fiche`, la fiche de rang `rang` des données : son `slug`, sinon celui de son
    `title`.

    Raises:
        ValueError: le champ lu n'est pas une chaîne non vide.
    """
    cle = "slug" if "slug" in fiche else "title"
    valeur = fiche.get(cle)
    if not est_texte(valeur):
        raise ValueError(f"[{rang}].{cle} : attendu une chaîne non vide")
    return valeur if cle == "slug" else slug(valeur)


def teinte_de(fiche: Mapping[str, object], rang: int) -> str:
    """La couleur de `fiche`, la fiche de rang `rang` des données, en `#RRGGBB` : son `hex`.

    Raises:
        ValueError: son `hex` n'est pas une chaîne de six chiffres hexadécimaux.
    """
    hexa = fiche.get("hex")
    teinte = f"#{hexa}" if isinstance(hexa, str) else None
    if not est_couleur(teinte):
        raise ValueError(f"[{rang}].hex : attendu six chiffres hexadécimaux")
    return teinte


def couleur(nom: str) -> str | None:
    """La couleur du logo de slug `nom`, en `#RRGGBB`, lue dans les données de la version
    épinglée ; `None` s'il n'y figure pas.

    Raises:
        URLError: le réseau a échoué (`tirer`).
        ValueError: les données ne sont pas du JSON ou pas une liste, une fiche lue n'est pas un
            objet ou n'a pas de slug lisible (`slug_de`), ou celle du logo pas de `hex` lisible
            (`teinte_de`) — le motif nomme le champ fautif.
    """
    fiches = json.loads(tirer(DONNEES))
    if not est_liste(fiches):
        raise ValueError("(racine) : attendu une liste")
    for rang, fiche in enumerate(fiches):
        if not est_objet(fiche):
            raise ValueError(f"[{rang}] : attendu un objet")
        if slug_de(fiche, rang) == nom:
            return teinte_de(fiche, rang)
    return None


def ecrire_couleurs(dossier: Path, couleurs: Mapping[str, str]) -> None:
    """Écrit `couleurs` dans le fichier des couleurs du jeu de logos `dossier`, clés triées."""
    texte = json.dumps(couleurs, ensure_ascii=False, indent=2, sort_keys=True)
    (dossier / COULEURS_DES_LOGOS).write_text(f"{texte}\n", encoding="utf-8", newline="")


def ajouter(nom: str, jeu: str) -> tuple[int, str]:
    """Copie l'icône `nom` du jeu `jeu` dans le dossier d'icônes du skill : tout se lit — le
    dossier, le fichier des couleurs pour un logo, l'amont —, puis tout s'écrit.

    Returns:
        Le code de sortie et ce qu'il faut en dire, en une ligne.

    Raises:
        Abandon: un nom est présent dans les deux jeux, ou le fichier des couleurs est illisible.
    """
    presente = icones_disponibles(ICONES).get(nom)
    if presente is not None:
        if presente.parent.name == jeu:
            return 0, f"{nom} : déjà présente, {presente}"
        return 1, f"{nom} : nom déjà pris par le jeu {presente.parent.name}"
    logo = jeu == LOGOS
    couleurs = lire_couleurs(ICONES) if logo else {}
    try:
        svg = tirer(SOURCES[jeu].format(nom))
        teinte = couleur(nom) if logo else None
    except HTTPError as erreur:
        return 1, f"{nom} : HTTP {erreur.code} sur {erreur.url}"
    except URLError as erreur:
        return 1, f"{nom} : réseau en échec — {erreur.reason}"
    except ValueError as erreur:
        return 1, f"{nom} : données illisibles sur {DONNEES} — {erreur}"
    if logo and teinte is None:
        return 1, f"{nom} : aucun logo de ce slug dans {DONNEES}"
    dossier = ICONES / jeu
    (dossier / f"{nom}.svg").write_bytes(svg)
    if teinte is None:
        return 0, f"{nom} : écrite dans {dossier}"
    ecrire_couleurs(dossier, {**couleurs, nom: teinte})
    return 0, f"{nom} : écrite dans {dossier}, couleur {teinte}"


def main(argv: Sequence[str]) -> int:
    """Point d'entrée ; voir le module pour les sorties."""
    parser = argparse.ArgumentParser(
        prog="icones.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("nom", help="le nom du SVG chez l'amont, sans extension")
    jeux = parser.add_mutually_exclusive_group(required=True)
    for jeu in SOURCES:
        jeux.add_argument(f"--{jeu}", dest="jeu", action="store_const", const=jeu)
    arguments = parser.parse_args(argv)
    if not re.fullmatch(FORMES_DES_NOMS[arguments.jeu], arguments.nom):
        parser.error(f"nom d'icône invalide pour {arguments.jeu} : {arguments.nom!r}")
    try:
        code, compte_rendu = ajouter(arguments.nom, arguments.jeu)
    except Abandon as motif:
        print(motif, file=sys.stderr)
        return 2
    print(compte_rendu, file=sys.stderr if code else sys.stdout)
    return code


if __name__ == "__main__":
    sorties_en_utf_8()
    sys.exit(main(sys.argv[1:]))
