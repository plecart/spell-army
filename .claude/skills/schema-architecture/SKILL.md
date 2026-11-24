---
name: schema-architecture
description: "Produit le schéma d'architecture d'un projet en image PNG carrée de 2400 × 2400 px — une fenêtre de 1200 au facteur d'échelle 2 —, pour la galerie de sa fiche — lire le projet (Compose, infra, CI, configuration), faire valider par le mainteneur la liste des sections, cartes et liens, l'écrire en `docs/schema/architecture.json`, la dessiner avec le rendu du skill, puis exporter l'image et la montrer. À utiliser dans le dépôt du projet quand l'utilisateur demande son schéma d'architecture ou l'image de ce schéma — « fais le schéma d'architecture », « dessine l'architecture du projet », « image du schéma pour la fiche », « régénère le schéma d'architecture »."
---

# Schéma d'architecture

Le skill se lance dans le dépôt du projet à dessiner, depuis sa racine. Il ne suppose **aucune
architecture** : un projet peut n'avoir ni front ni back, aucune section n'est imposée, et le
nombre de colonnes vient du projet. Il **s'arrête à l'étape 2** : rien ne s'écrit dans le dépôt —
ni la description, ni l'image — avant que le mainteneur ait validé la liste.

La session fait tout elle-même ; trois scripts du dossier du skill, en bibliothèque standard,
valident, exportent et tirent une icône. Ils se lancent par `python`, sans `-I` : `export.py` et
`icones.py` importent leur voisin `description.py`, que `python -I` ne trouve plus (mesuré le
2026-11-05 sous Python 3.12).

## Les cinq étapes

### 1. Lire le projet

Les fichiers Compose, l'infra (images, proxy, scripts de déploiement), la CI (`.github/workflows/`)
et la configuration (`.env.example`, réglages). En tirer la liste :

- les **sections** — les lieux où tournent les choses : hébergeur, conteneurs, service tiers,
  poste ; une section peut en contenir d'autres, ou se poser à côté d'une voisine ;
- les **cartes** — un outil chacune, dans sa section, et pour chacune le jeton ou la clé qu'elle
  détient, s'il y en a un ;
- les **liens** — qui appelle qui, qui écrit où ;
- le **gestionnaire de secrets** qui garde ces jetons et ces clés, si le projet en nomme un.

Chaque élément porte le fichier qui l'établit ; ce qu'aucun fichier n'établit est marqué
**non établi**, jamais deviné. Une description déjà écrite, `docs/schema/architecture.json`, est
le point de départ : la liste dit alors ce qui change. Rien ne s'écrit à cette étape.

### 2. Faire valider la liste — arrêt

Montrer la liste au mainteneur, les éléments non établis en tête, et **s'arrêter**. Rien ne
s'écrit avant son accord. Ses corrections reviennent dans la liste, qui se remontre jusqu'à
l'accord.

### 3. Écrire la description

Écrire `docs/schema/architecture.json` dans le dépôt du projet. C'est la documentation du dépôt,
pas un contenu du site, et la seule source versionnée du schéma. Puis la valider :

```
python <répertoire de ce skill>/scripts/description.py docs/schema/architecture.json
```

Sortie 0 et `valide` ; sinon une ligne `<chemin> : <message>` par erreur, toutes en une passe —
les corriger toutes, puis relancer. Une icône absente du dossier se tire par `scripts/icones.py`
(« Icônes »), jamais en la remplaçant par une icône présente. La forme est résumée plus bas,
« La description ».

### 4. Dessiner

Le rendu du skill, `rendu/page.html`, dessine la description telle quelle : aucun code par
projet. Le dessin se règle donc dans la description, sous les règles de style ci-dessous — la
colonne de chaque carte (une demi-colonne centre une rangée), le `span` des sections posées côte
à côte, la `route` d'un lien qui doit faire un détour. Chaque retouche se valide de nouveau
(étape 3).

### 5. Exporter et montrer

L'image s'écrit dans `docs/schema/architecture.png`, qui n'est pas versionnée : si le
`.gitignore` du projet ne l'ignore pas encore, y ajouter la ligne `docs/schema/architecture.png`.
Puis, depuis la racine du projet :

```
python <répertoire de ce skill>/scripts/export.py
```

Le script valide, assemble la page hors ligne, la capture et écrit l'image, 2400 × 2400 px — la
mise en page d'une fenêtre de 1200 × 1200 px au facteur d'échelle 2 —, quel que soit le zoom du
poste ; ses sorties sont dans sa docstring. Montrer l'image au mainteneur, et la relire contre
les règles de style : un écart se corrige dans la description (étapes 3 et 4), puis s'exporte
de nouveau. L'auteur dépose ensuite l'image dans la galerie de la fiche, depuis l'admin.

## Les règles de style

Validées sur un premier schéma le 2026-11-03 (version 13), l'étiquette décidée le
2026-11-07 ; elles valent pour tout projet.

- **Le nom de l'outil** sur chaque carte, sans description.
- **Le logo officiel** quand l'outil en a un ; une icône neutre (Lucide) sinon.
- **Le logo du gestionnaire de secrets** que nomme la description (`secretManager`) se pose
  seulement sur ce qui détient un jeton ou une clé, jamais sur un compte à second facteur.
- **Un service tiers qu'appellent des cartes** s'y scotche en étiquette (`sticker`), sans
  section ni flèche, quand ses flèches traverseraient le dessin.
- **Aucun texte sur les flèches**, et **jamais de valeur de secret** : le champ `secret` d'une
  carte dit *quel* secret le gestionnaire garde, jamais sa valeur.
- **Les rangées centrées** : une carte se pose à une demi-colonne pour centrer sa rangée.
- **Les noms de section en haut à gauche** de leur section.
- **Des flèches courbes qui évitent les scotchs** : le rendu les trace ainsi ; `route` (`left`,
  `right`, `under`) fait faire un détour à un lien qui traverserait une carte.

## La description

Un objet JSON : un texte d'introduction (`intro`), le nombre de colonnes de la grille
(`columns`), le gestionnaire de secrets s'il y en a un (`secretManager`), les sections de haut en
bas (`zones`) — une section porte des rangées de cartes, des sous-sections, ou les deux —, et les
liens entre cartes (`links`). Une carte a un `id`, le nom de l'outil, une icône et sa colonne.

La forme complète — chaque champ, son type, ce qui est requis, les contraintes qui lient les
champs — vit dans la docstring de `scripts/description.py`, **seule source** : elle ne se recopie
pas ici.

## Icônes

Une icône est un SVG du dossier `icones/` du skill : un logo dans `icones/simple-icons/`, une
icône neutre dans `icones/lucide/`. Une icône qui manque se tire de la version épinglée et se
copie dans le dossier, la couleur d'un logo comprise :

```
python <répertoire de ce skill>/scripts/icones.py <slug> --simple-icons
python <répertoire de ce skill>/scripts/icones.py <nom> --lucide
```

`<slug>` est le nom du logo chez Simple Icons, `<nom>` celui de l'icône chez Lucide, sans
extension. Sorties : la docstring du script.

## Prérequis, une fois par poste

Python 3.11 ou plus, `uv`, puis Chromium pour la version de Playwright de l'export :

```
uv run --no-project --with playwright==1.64.1 playwright install chromium
```

L'export rappelle cette commande si `uv` ou Chromium manque. Ni le projet ni ses dépendances
n'ont Playwright : `uv` le tire dans son cache, hors de tout projet.

## Versions épinglées à la main

Dependabot ne lit ni le `--with` de `uv run` ni les fichiers copiés : chaque version se monte à la
main. Mesuré le
2026-11-05 : `rendu/rough.js` et la police Shantell Sans sont identiques aux fichiers des adresses
ci-dessous à leur version, la police Manrope à
`https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggexSg.woff2`.

| Dépendance | Version | Où elle vit | Pour la monter |
|---|---|---|---|
| rough.js | 4.6.6 | ce tableau : `rendu/rough.js` n'en porte pas | `npm view roughjs version`, puis `https://cdn.jsdelivr.net/npm/roughjs@<version>/bundled/rough.js` remplace `rendu/rough.js` |
| Manrope | Google Fonts v20 | `rendu/polices/NOTICE` | la feuille `https://fonts.googleapis.com/css2?family=Manrope:wght@200..800`, lue avec l'agent d'un navigateur récent, donne l'URL du sous-ensemble latin (bloc `unicode-range: U+0000-00FF, …`), version comprise (`/v<n>/`) : ce fichier remplace `rendu/polices/manrope-latin.woff2` |
| Shantell Sans | `@fontsource-variable/shantell-sans` 5.3.0 | `rendu/polices/NOTICE` | `npm view @fontsource-variable/shantell-sans version`, puis `https://cdn.jsdelivr.net/npm/@fontsource-variable/shantell-sans@<version>/files/shantell-sans-latin-wght-normal.woff2` remplace le fichier du même nom |
| Simple Icons | 15.0.0 | `SIMPLE_ICONS`, `scripts/icones.py` | `npm view simple-icons version`, puis la constante ; relire `titleToSlug` du `sdk.mjs` de la version contre `REMPLACEMENTS`, et le motif `slug` de son `.jsonschema.json` contre `FORMES_DES_NOMS` ; enfin retirer chaque logo du dossier et le tirer de nouveau par `icones.py`, qui réécrit sa couleur |
| Lucide | 0.460.0 | `LUCIDE`, `scripts/icones.py` ; l'en-tête de chaque SVG | `npm view lucide-static version`, puis la constante ; vérifier que les noms de `icons/` de la version tiennent dans `FORMES_DES_NOMS` ; retirer chaque icône neutre du dossier et la tirer de nouveau par `icones.py` |
| Playwright | 1.64.1 | `PLAYWRIGHT`, `scripts/export.py` | `python -m pip index versions playwright`, puis la constante et le prérequis ci-dessus, de nouveau |

Une montée se reporte partout où la version vit, et dans les tests du skill, qui écrivent en
littéraux celles de Simple Icons, de Lucide et de Playwright. Puis exporter le schéma et le
regarder.

## Licences

Chaque dépendance copiée porte la sienne, dans le dossier où elle vit :

- rough.js — MIT, `rendu/LICENSE-roughjs` ;
- Manrope et Shantell Sans — SIL Open Font License 1.1 : le texte dans `rendu/polices/OFL.txt`,
  la notice (auteurs, origine, version) dans `rendu/polices/NOTICE` ;
- Simple Icons — CC0 1.0, `icones/simple-icons/LICENSE`, qui s'ouvre sur la note « Les logos
  restent des marques de leurs propriétaires. » ;
- Lucide — ISC, `icones/lucide/LICENSE`, et la mention de licence que garde l'en-tête de chaque
  SVG.

Playwright n'est pas copié : `uv` le tire dans son cache.
