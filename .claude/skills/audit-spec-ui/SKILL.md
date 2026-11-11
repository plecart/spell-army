---
name: audit-spec-ui
description: Audit mécanique d'une spécification d'interface (document normatif UX/UI) — établir le périmètre et l'autorité des livrables, épuiser les passes vérifiables (jetons déclarés vs utilisés, tables de priorité, arithmétique de mise en page, contraste en composition réelle, cohérence prose/tables) avant tout jugement de goût, puis, après le go du mainteneur sur le rapport, appliquer les corrections en trois passes (édition, propagation, résidus). À utiliser quand l'utilisateur demande de relire, auditer ou corriger une spec d'interface ou un document de design — « relis la description de l'interface », « dis-moi ce qui semble mauvais dans cette spec », « applique ces corrections à la spec ».
argument-hint: "[chemin du document à auditer — requis]"
---

# Audit de spécification d'interface

Dans un document normatif, les défauts les plus coûteux sont **vérifiables mécaniquement** —
jetons, tables de vérité, arithmétique, unités, contradictions entre deux endroits qui décrivent
la même chose. Un audit épuise ces passes **avant** d'émettre un avis de conception : elles sont
opposables, elles ne se discutent pas, et elles trouvent ce qu'une lecture attentive rate.

## Délégation

La session garde le jugement : la déclaration d'autorité et le périmètre (étapes 0.2 et 0.3), les
constats de goût et de conception, le choix de chaque correction, le rapport, l'arrêt avant les
corrections. Le reste change de main :

- **`releveur`** — l'inventaire des livrables qui décrivent l'objet audité (étape 0.1), rendu dans
  un fichier ; puis, après l'édition, la propagation — chaque valeur d'origine cherchée dans tout
  le corpus — et les résidus, en liste d'assertions, chacun rendu avec son dénombrement ;
- **`executant`** — les six passes mécaniques, sur le chemin reçu et l'inventaire : il rend chaque
  passe « constat(s) », chacun avec son § et son scénario d'échec, ou « sans objet » avec sa
  raison, et ne juge ni ne corrige ; puis l'édition des corrections que la session a choisies, en
  tranche entièrement spécifiée — §, avant, après ;
- **une PR** — une spec versionnée dans un dépôt se corrige par une PR, portée par la session qui
  a décidé, jamais par un commit direct sur le trunk : dans une session PR, la
  correction entre dans sa PR ; hors PR, la session l'ouvre, la relit et la merge au go du
  mainteneur, au déroulé de `triage/hors-scope.md` (« Quand écrire », étapes 5 et 6). Une spec
  hors dépôt se corrige sur place, sans commit.

## Étape 0 — Périmètre et autorité, avant toute lecture

Quand plusieurs artefacts décrivent le même objet (spec textuelle, maquette HTML, fichier de
trace), un audit sans hiérarchie d'autorité explicite produit des findings dont le lecteur ne
peut pas évaluer la portée.

L'objet audité est le document dont le chemin est passé en argument. **Sans chemin, la session
s'arrête et demande le chemin au mainteneur** — jamais une spec reprise des échanges de la
session.

1. **Inventorier** — le `releveur` (« Délégation ») rend dans un fichier tous les livrables qui
   décrivent l'objet audité, à partir du document reçu.
2. **Chercher la déclaration d'autorité** — souvent dans un fichier de trace, un en-tête
   « Source normative », ou le README. Si aucune n'existe, c'est la **première** question à poser,
   pas la dernière.
3. **Annoncer le périmètre en une ligne avant de livrer** : « audité : X ; écarté : Y, parce
   que Z ».

## Les passes mécaniques — dans l'ordre, avant tout avis de conception

L'`executant` (« Délégation ») les déroule.

1. **Jetons déclarés vs utilisés**, dans les deux sens : un jeton utilisé mais jamais déclaré, un
   jeton déclaré que rien n'utilise.
2. **Valeurs partagées entre familles disjointes** : la valeur d'un jeton réutilisée depuis une
   autre famille censée être indépendante.
3. **Tables de priorité** : aucune condition ne doit être un sous-ensemble d'une condition plus
   prioritaire — sinon la ligne est logiquement inatteignable.
4. **Arithmétique** : refaire chaque budget d'espace annoncé, pour **tous** les composants
   concernés — pas seulement ceux que le document calcule lui-même.
5. **Contraste en composition réelle** : quand un composant est spécifié translucide, composer le
   fond réel avant de mesurer — un contraste calculé sur fond opaque ne prouve rien.
6. **Cohérence prose ↔ tables d'états ↔ récapitulatifs** : confronter systématiquement les trois,
   y compris à l'intérieur d'un même paragraphe.

Chaque finding **cite le §** (jamais un numéro de ligne, qui périme à la première édition) et
porte un **scénario d'échec concret** : ce qu'un implémenteur construirait de faux en suivant le
texte tel quel.

## Diagnostic de mise en page

Un vide de mise en page a deux causes possibles : une mauvaise répartition, ou **un conteneur
trop grand**. Tant qu'on suppose la première, chaque correction déplace le vide sans le résoudre
(ancré aux bords → trou central ; à gauche → marge de fin ; centré → deux demi-trous).

- Question préalable : **« ce conteneur a-t-il assez de contenu pour justifier sa taille ? »** Si
  le contenu occupe moins de ~80 % de la largeur disponible et que rien ne peut légitimement s'y
  ajouter, proposer d'emblée de retirer le conteneur ou de le faire épouser son contenu.
- Avant d'accepter une disposition centrée : **la largeur des blocs est-elle stable ?** Un bloc
  centré dont le contenu change de largeur dérive à chaque mise à jour ; centré *entre deux
  ancres*, il dérive une seconde fois quand les ancres bougent.

## Appliquer les corrections — trois passes, jamais une seule

**Arrêt avant les corrections**, dans la même session : le rapport — périmètre, passes, constats,
jugements — est présenté au mainteneur, et **aucune correction ne part avant son go sur le
rapport** ; le go peut n'en retenir qu'une partie.

Presque chaque correction a des occurrences ailleurs que là où le finding l'a trouvée. « Une
édition par finding » produit une correction locale et un document incohérent autrement.

1. **Édition** — l'`executant` applique chaque correction retenue là où le finding l'a trouvée.
2. **Propagation** — pour chaque valeur, jeton, seuil ou règle touché, le `releveur` cherche la
   valeur **d'origine** dans tout le corpus et rend chaque occurrence ; celles que la session
   retient repartent à l'`executant`. La recherche porte sur l'ancienne valeur, pas la nouvelle :
   c'est la seule qui révèle ce qu'on a oublié.
3. **Résidus** — le `releveur` re-cherche les valeurs supprimées et rend celles qui restent ; la
   session vérifie qu'il n'en reste aucune, ou que celles qui restent sont délibérément citées.
   L'exécuter comme une liste d'assertions, pas comme une relecture.

Le rapport de correction énonce le **dénombrement** : « N occurrences repassées, k corrigées,
N−k vérifiées indemnes » — jamais « les findings sont corrigés ».

## Avant de livrer — vérification obligatoire

Relire cette liste et confronter le livrable à chaque point :

- [ ] Périmètre et autorité annoncés en tête (étape 0.3).
- [ ] Les six passes mécaniques exécutées — ou marquées « sans objet » avec la raison, une ligne
      chacune.
- [ ] Chaque finding : § cité + scénario d'échec.
- [ ] Les jugements de conception (goût, lisibilité, choix) présentés **après** les findings
      mécaniques, et clairement séparés d'eux.
- [ ] Le rapport présenté au mainteneur, aucune correction partie avant son go sur le rapport.
- [ ] Si des corrections ont été appliquées : les trois passes déroulées, dénombrement donné.
