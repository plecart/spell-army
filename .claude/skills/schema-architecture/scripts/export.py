"""Exporte le schéma d'architecture d'un projet en image PNG carrée de 2400 × 2400 px.

Usage :
    python export.py [<description> [<png>]]

Lancé depuis la racine du dépôt du projet décrit : `<description>` vaut par défaut
`docs/schema/architecture.json`, `<png>` `docs/schema/architecture.png`.

Trois temps, chacun arrêté par un échec :

1. **valider** la description (`description.py`) contre le dossier d'icônes du skill. Des
   erreurs : elles sortent toutes, et aucun navigateur ne démarre ;
2. **assembler** une page autonome dans un dossier temporaire : le gabarit `rendu/page.html`,
   rough.js et la description en ligne, les polices en `data:` (base64), les icônes que nomme la
   description en SVG en ligne, chaque logo peint à sa couleur (`couleurs.json`), et le nom de
   l'attribut qu'elle pose une fois rendue (`PRET`). La page ne fait aucune requête, ni réseau
   ni fichier voisin ;
3. **capturer** la page par la CLI de Playwright, le paquet Python à la version `PLAYWRIGHT`,
   lancé par `uv run --no-project --with`, hors de tout projet : Chromium sans fenêtre —
   `screenshot` le lance ainsi —, fenêtre de 1200 × 1200 px (`FENETRE`) au facteur d'échelle 2
   (`FACTEUR`) du descripteur « Desktop Chrome HiDPI » (`APPAREIL`), schéma clair, capture après
   cet attribut, `DELAI` au plus par attente. Le descripteur fixe le facteur, `--viewport-size`
   remplace sa fenêtre : le dessin garde la mise en page de 1200 px et double sa finesse
   (Playwright 1.64.1, `launchContext` du pilote, `driver/package/lib/coreBundle.js` : le
   descripteur copié, puis sa fenêtre remplacée par celle de `--viewport-size` ; son facteur
   n'est remplacé que sous une fenêtre de navigateur, que `screenshot` n'ouvre pas ; le
   descripteur à `deviceScaleFactor: 2` ; lus le 2026-11-08). Mesuré le 2026-11-08 sur le
   poste : un PNG de 2400 × 2400, où un carré de 600 px CSS occupe 1200 px. Puis la taille se
   relit dans l'en-tête IHDR du PNG : le côté ne dépend ni du zoom ni de l'écran du poste.

L'image n'est écrite à `<png>` qu'à la fin, à la bonne taille.

Prérequis, une fois par poste : `uv`, puis Chromium pour cette version de Playwright,
`uv run --no-project --with playwright==<PLAYWRIGHT> playwright install chromium`.

Sortie : 0 et la ligne `<png> : 2400 × 2400` ; 1 et une ligne `<chemin> : <message>` par erreur
de la description, sur la sortie standard, ou le motif en une ligne sur la sortie d'erreur —
prérequis absent, capture en échec ou d'une autre taille ; 2 et son motif en une ligne sur la
sortie d'erreur, description ou fichier des couleurs illisible ou mal formé, nom d'icône présent
dans les deux jeux — ou appel mal formé. Python 3.11 ou plus, bibliothèque standard seule :
aucun `import playwright`.
"""

import argparse
import base64
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Mapping, Sequence
from pathlib import Path

from description import (
    ICONES,
    Abandon,
    est_liste,
    est_objet,
    lire_couleurs,
    sorties_en_utf_8,
    verifier_fichier,
)

PLAYWRIGHT = "1.64.1"
# La fenêtre de la capture, en px CSS : la mise en page du dessin.
FENETRE = 1200
# Le descripteur de la capture, et le facteur d'échelle qu'il fixe (docstring, temps 3).
APPAREIL = "Desktop Chrome HiDPI"
FACTEUR = 2
# Le côté de l'image, en pixels, que l'en-tête du PNG doit porter.
COTE = FENETRE * FACTEUR
PREREQUIS = f"uv run --no-project --with playwright=={PLAYWRIGHT} playwright install chromium"
RENDU = Path(__file__).resolve().parent.parent / "rendu"
# L'attribut que la page pose sur `<body>` une fois rendue, polices chargées : l'export l'injecte
# dans le gabarit (`/*PRET*/`) et attend `MARQUEUR` avant de capturer — une seule source.
PRET = "data-rendu-pret"
MARQUEUR = f"body[{PRET}]"
# Le délai de chaque attente de la capture, en millisecondes : la CLI n'en a aucun par défaut
# (`--timeout`), et une page qui ne poserait pas son marqueur l'attendrait sans fin.
DELAI = 30_000
# Le début de la sortie d'erreur de la CLI quand Chromium manque (mesuré le 2026-11-05 sous
# `PLAYWRIGHT_BROWSERS_PATH` vide : sortie 1).
CHROMIUM_ABSENT = "Executable doesn't exist"
# Les huit premiers octets de tout PNG (PNG, 3e édition, § 5.2).
SIGNATURE_PNG = bytes((0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))


def icones_utilisees(noeud: object) -> set[str]:
    """Les icônes que nomme la description, à tout niveau : chaque valeur d'une clé `icon`."""
    if est_objet(noeud):
        icone = noeud.get("icon")
        propres = {icone} if isinstance(icone, str) else set[str]()
        return propres.union(*map(icones_utilisees, noeud.values()))
    if est_liste(noeud):
        return set[str]().union(*map(icones_utilisees, noeud))
    return set()


def en_js(valeur: object) -> str:
    """`valeur` en littéral JavaScript, à poser dans un `<script>` : du JSON dont chaque `<` est
    échappé — aucune séquence `</script` ni `<!--` ne peut y naître."""
    return json.dumps(valeur, ensure_ascii=False).replace("<", "\\u003c")


def svg_en_ligne(chemin: Path, couleur: str | None) -> str:
    """Le SVG du fichier `chemin`, peint à `couleur` si c'est un logo ; une icône neutre garde
    son trait `currentColor`, l'encre du texte."""
    svg = chemin.read_text(encoding="utf-8")
    return svg.replace("<svg", f'<svg fill="{couleur}"', 1) if couleur else svg


def en_data(chemin: Path, type_mime: str) -> str:
    """Le fichier `chemin` en URL `data:`, encodé en base64."""
    return f"data:{type_mime};base64,{base64.b64encode(chemin.read_bytes()).decode('ascii')}"


def assembler(description: object, icones: Mapping[str, Path]) -> str:
    """La page autonome qui dessine `description` : le gabarit, chaque marqueur `/*NOM*/`
    remplacé par sa ressource.

    Args:
        description: la description validée.
        icones: le fichier de chaque icône disponible — `icones_disponibles()`.

    Raises:
        Abandon: le fichier des couleurs des logos est illisible (`lire_couleurs`).
    """
    couleurs = lire_couleurs(ICONES)
    polices = RENDU / "polices"
    ressources = {
        "MANROPE": en_data(polices / "manrope-latin.woff2", "font/woff2"),
        "SHANTELL_SANS": en_data(polices / "shantell-sans-latin-wght-normal.woff2", "font/woff2"),
        "ROUGH": (RENDU / "rough.js").read_text(encoding="utf-8"),
        "DESCRIPTION": en_js(description),
        "PRET": en_js(PRET),
        "ICONES": en_js(
            {
                nom: svg_en_ligne(icones[nom], couleurs.get(nom))
                for nom in sorted(icones_utilisees(description))
            }
        ),
    }
    gabarit = (RENDU / "page.html").read_text(encoding="utf-8")
    # Une seule passe : une ressource qui porterait un `/*NOM*/` n'est pas relue.
    return re.sub("/[*]([A-Z_]+)[*]/", lambda marqueur: ressources[marqueur[1]], gabarit)


def capturer(page: Path, png: Path) -> str | None:
    """Capture `page` dans `png` ; le motif de l'échec en une ligne, `None` si elle aboutit."""
    uv = shutil.which("uv")
    if uv is None:
        return f"uv introuvable — prérequis : installer uv, puis {PREREQUIS}"
    fait = subprocess.run(
        [
            uv,
            "run",
            "--no-project",
            "--with",
            f"playwright=={PLAYWRIGHT}",
            "playwright",
            "screenshot",
            "--browser",
            "chromium",
            "--device",
            APPAREIL,
            "--viewport-size",
            f"{FENETRE},{FENETRE}",
            "--color-scheme",
            "light",
            "--wait-for-selector",
            MARQUEUR,
            "--timeout",
            str(DELAI),
            page.as_uri(),
            str(png),
        ],
        capture_output=True,
        check=False,
    )
    if fait.returncode == 0:
        return None
    sortie = fait.stderr.decode("utf-8", errors="replace").strip()
    if CHROMIUM_ABSENT in sortie:
        return f"Chromium absent pour Playwright {PLAYWRIGHT} — prérequis : {PREREQUIS}"
    return f"capture en échec, sortie {fait.returncode} — {(sortie.splitlines() or [''])[0]}"


def taille_png(chemin: Path) -> tuple[int, int] | None:
    """La largeur et la hauteur que porte l'en-tête du PNG `chemin` — son premier bloc, IHDR
    (PNG, 3e édition, § 5.3 et § 11.2.1) ; `None` pour un fichier absent, ou qui ne commence pas
    par la signature PNG suivie de ce bloc."""
    try:
        with chemin.open("rb") as fichier:
            tete = fichier.read(24)
    except OSError:
        return None
    if tete[:8] != SIGNATURE_PNG or tete[12:16] != b"IHDR":
        return None
    return int.from_bytes(tete[16:20], "big"), int.from_bytes(tete[20:24], "big")


def exporter(description: object, icones: Mapping[str, Path], png: Path) -> str | None:
    """Dessine `description` et l'écrit à `png`, à la bonne taille ; le motif de l'échec en une
    ligne, `None` si l'export aboutit.

    Raises:
        Abandon: la page ne s'assemble pas (`assembler`) ; rien n'est capturé ni écrit.
    """
    with tempfile.TemporaryDirectory() as dossier:
        page, capture = Path(dossier) / "schema.html", Path(dossier) / "schema.png"
        page.write_text(assembler(description, icones), encoding="utf-8")
        motif = capturer(page, capture)
        if motif:
            return motif
        taille = taille_png(capture)
        if taille is None:
            return f"capture illisible : {capture.name} n'est pas un PNG"
        if taille != (COTE, COTE):
            return f"capture de {taille[0]} × {taille[1]} px, attendu {COTE} × {COTE}"
        png.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(capture, png)
    return None


def main(argv: Sequence[str]) -> int:
    """Point d'entrée ; voir le module pour les sorties."""
    parser = argparse.ArgumentParser(
        prog="export.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "description",
        type=Path,
        nargs="?",
        default=Path("docs/schema/architecture.json"),
        help="le fichier JSON de la description (défaut : %(default)s)",
    )
    parser.add_argument(
        "png",
        type=Path,
        nargs="?",
        default=Path("docs/schema/architecture.png"),
        help="l'image à écrire (défaut : %(default)s)",
    )
    arguments = parser.parse_args(argv)
    code, description, icones = verifier_fichier(arguments.description)
    if code:
        return code
    try:
        motif = exporter(description, icones, arguments.png)
    except Abandon as abandon:
        print(abandon, file=sys.stderr)
        return 2
    if motif:
        print(motif, file=sys.stderr)
        return 1
    print(f"{arguments.png} : {COTE} × {COTE}")
    return 0


if __name__ == "__main__":
    sorties_en_utf_8()
    sys.exit(main(sys.argv[1:]))
