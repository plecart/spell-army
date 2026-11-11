---
name: contradiction
description: Réconcilie une décision arrêtée avec le mainteneur et les sources de vérité qu'elle contredit — amende le § du document concerné par une PR, archive le raisonnement, puis propage aux rangs inférieurs et aux issues ouvertes. À utiliser quand la règle decisions-vs-doc a levé un arrêt, ou « cette décision contredit la doc », « répercute cette décision dans la doc ».
argument-hint: "[le bloc d'arrêt de decisions-vs-doc : fichier §, rang, Avant, Après] [origine : #<N>]"
---

# Contradiction

Mouvement **amont** de la pipeline, symétrique de `repercussions`.

| | `contradiction` | `repercussions` |
|---|---|---|
| Déclencheur | une décision arrêtée avec le mainteneur (l'arrêt `decisions-vs-doc`), ou un § falsifié par un merge que `repercussions` lui remonte | un **merge** |
| Ce qui falsifie | la décision qui vient d'être prise | le diff mergé |
| Ce qui devient faux | un **§ de document**, puis les issues | des **corps d'issues** |

Les deux partagent la même discipline : **deux citations ou rien**, un diff avant/après, et aucune
écriture sans « go ». Ce skill ne la réimplémente pas côté issues — il **délègue à
`repercussions`** une fois sa PR mergée, et, démarré par une passe `repercussions`, la fait
reprendre quelle que soit la sortie (étape 5).

## Le livrable est un § amendé

- **Le document est la spec.** S'il est devenu faux, on le **réécrit**. On n'ajoute pas une note en
  bas qui contredit le corps : le lecteur suivant lirait les deux et ne saurait pas laquelle vaut.
- **Le raisonnement ne va pas dans le document normatif.** Les documents des rangs supérieurs ne
  portent que l'**état courant**. Le pourquoi, les options écartées et la date vont dans
  l'emplacement **Non normatif** déclaré par la table « Sources de vérité » de
  `.claude/pipeline.config.md` — s'il n'en déclare aucun, le raisonnement va dans le body de la PR
  qui porte l'amendement.
- **Pas d'amendement formulable = pas de contradiction.** On se tait ; avec `origine : #<N>`, se
  taire ne dispense pas de la relance de l'étape 5.

**Règle d'or** : ce skill **propose**, il n'écrit jamais en silence. Aucune édition sans « go »
explicite, et toute écriture de dépôt de ce skill part par une PR (étape 4).

## Délégation

La session garde le jugement : vérifier la contradiction et son rang, mener la recherche « par
affirmation », présenter les amendements et la reco, demander le go. Le reste change de main :

- **`releveur`** — les lectures bornées (« Lectures bornées ») : la table « Sources de vérité »,
  les passages des documents autour des ancres données, la carte des miroirs et des renvois ; les
  collectes de la cascade (« Collectes ») : par ancre lexicale et par dénombrement, sur les termes
  que donne la session (étape 2) ; la vérification `context7` d'une reco (« Questions de
  documentation », étape 3). Reconnaître une même affirmation sous d'autres mots — la recherche
  « par affirmation » — reste à la session, sur les passages rendus ;
- **`executant`** — l'amendement de l'étape 4 : la table des édits (§§, journal, archive,
  répercussions hors documents), appliquée exactement et commitée ;
- **session distincte** — `repercussions` (étape 5) ; protocole commun :
  `.claude/skills/cycle-pr/references/sessions-liees.md`.

## Process

### 1. Établir la contradiction et son rang

L'entrée est l'arrêt écrit : le bloc `## ⚠️ Contradiction` de `.claude/rules/decisions-vs-doc.md`
(fichier §, rang, Avant, Après), passé en argument — par la session qui l'a levé, qui le recopie en
invoquant le skill, ou par le prompt de la session que `repercussions` démarre, qui y ajoute
`origine : #<N>`. Sans argument, la session s'arrête et demande les deux citations. Une décision ou
un § passé sans arrêt qui l'ait établi : dérouler d'abord `decisions-vs-doc` — deux citations,
sinon on se tait.

**Démarrée par une autre**, cette session vit dans son propre worktree, coupé sans fetch sur sa
source (`.claude/skills/cycle-pr/references/sessions-liees.md`, « Premier geste ») : son premier
geste lit les documents sur le trunk à jour,
`git fetch origin && git switch --detach origin/<trunk>` (`<trunk>` :
`.claude/pipeline.config.md`). Aucune branche à créer : l'amendement part du worktree isolé de
l'`executant` (étape 4).

Reprendre les deux citations de l'arrêt et les **vérifier dans le fichier** — pas de mémoire, on
relit la ligne. Cette relecture reste à la session : c'est une lecture, un geste isolé
(`CLAUDE.md`, « Orchestration »). Une citation qui ne s'y retrouve pas : pas de contradiction
(« Le livrable »), et, avec `origine : #<N>`, la session passe aux étapes 5 et 6. Puis situer le
**rang** touché dans la table « Sources de vérité » de `.claude/pipeline.config.md`, qu'un
`releveur` rend.

Si la contradiction porte sur plusieurs documents, **le rang le plus haut commande** : on amende
là, et les rangs inférieurs suivent en cascade. Amender la spec UX sans toucher le cadrage qu'elle
spécifie produit deux documents divergents — soit une contradiction de plus.

### 2. Mesurer la cascade

Chercher les §§ qui **dépendent** de celui qu'on amende, par **trois recherches distinctes** — la
première et la troisième partent au `releveur`, avec les termes que donne la session ; la deuxième
reste à la session, sur les passages qu'il rend :

1. **Par ancre lexicale** — noms de symboles, routes, champs, valeurs : `grep` dans tous les
   fichiers de rang égal ou inférieur, plus les renvois explicites (« voir §x », « cadrage §x »).
   Fonctionne parce que ces chaînes sont stables.
2. **Par affirmation** — pour toute phrase de **prose** amendée : énoncer *ce qu'elle affirme* en
   une proposition vérifiable, puis chercher les §§ qui portent la **même affirmation sous
   d'autres mots**, en partant de la carte des documents (miroirs déclarés, renvois) plutôt que du
   texte. Un `grep` sur les mots du passage édité ne trouve que les copies, jamais les
   paraphrases — c'est structurel.
3. **Par dénombrement** — quand l'amendement ajoute ou retire une entrée numérotée ou comptée
   (décision, ADR, section, surface, page) : chercher la **plage** ou le **total** qui en dérive
   (`D1-D`, « N ADR », « les N … », « trois pages ») dans les fichiers de rang égal ou inférieur
   et dans `.claude/pipeline.config.md`. Un compteur dérivé n'a aucun mot en commun avec ce qu'il
   compte, et aucune des deux recherches précédentes ne le vise — une plage « D1-Dn » devient
   fausse à l'entrée de Dn+1 sans qu'aucun mot du § amendé ne la désigne.

Établir la liste **avant** de proposer quoi que ce soit — une cascade découverte à mi-parcours
transforme un amendement validé en chantier non validé. **Une cascade mesurée à zéro sur un
amendement de prose doit nommer les documents parcourus**, pas seulement les termes cherchés : une
cascade nulle non justifiée est le mode d'échec le plus coûteux de ce skill, parce qu'il est
silencieux.

Cas particulier : si la table « Sources de vérité » déclare qu'un document a des §§ **miroirs**
dans un autre (colonne « Où s'inscrit un amendement »), les deux bougent ensemble, ou aucun ne
bouge.

Signaler aussi ce qui **retombe hors des documents** : une décision peut périmer une commande, un
domaine, une zone sensible ou une surface de `.claude/pipeline.config.md`, ou une règle
d'arbitrage de `CLAUDE.md`.

### 3. Présenter en diff, et demander

Sous `## ⚖️ Amendements proposés`, un bloc par § touché, dans l'ordre des rangs :

```
01-cadrage.md §9.3                                        [rang 1] [origine]
  Avant : « trois autorisations distinctes à obtenir dans l'onboarding »
  Après : « quatre autorisations, la quatrième non bloquante »

02-specification-ux.md §12.1                              [rang 2] [cascade]
  Avant : « le bandeau couvre trois états de permission »
  Après : « le bandeau couvre quatre états de permission »
```

Montrer les **lignes** avant/après, pas une prose qui décrit le changement : un diff se juge en
deux secondes. Terminer par la liste des issues candidates à la propagation (étape 5) — sans les
traiter encore.

**Rappeler l'alternative**, sous ses deux formes (`decisions-vs-doc.md`, « Deux sorties ») :
abandonner l'effet de la décision, ou le **conserver en le déplaçant** hors de ce que le document
affirme — deux lignes là où l'amendement coûte parfois un ADR. Quand une seule des deux sorties
(le document gagne, la décision gagne) est présentable, c'est le signe que la branche adverse a
été résumée, pas explorée. Abandonner reste une sortie valide, et souvent la bonne quand la
cascade est large. Une section close ne se rouvre pas parce que c'était plus rapide.

**Une reco qui oppose deux mécanismes techniques se vérifie avant d'être présentée.** Quand
l'argument est « l'outil fait X » — un rendu qui insère de l'HTML, un client qui rejoue, une
fusion par défaut —, un `releveur` pose la question à la documentation à jour de la bibliothèque
(`context7`) et rend le passage cité mot pour mot ; la conclusion reste à la session, qui cite dans
la ligne de reco ce qui a été vérifié (« vérifié : X n'insère pas d'HTML »). Une doc absente de
l'index, ou plusieurs candidates, remonte à la session, qui la lit à la source. Une reco fondée
sur la sécurité n'y échappe pas : c'est celle qu'on conteste le moins, donc celle qui trompe le
plus longtemps.

### 4. Appliquer — sur « go » explicite, par une PR

Quand le mainteneur retient à l'étape 3 que la décision gagne mais que l'amendement est trop gros
pour maintenant, aucune PR ne part : l'échappatoire de `.claude/rules/decisions-vs-doc.md`
(« Deux sorties ») ouvre sur-le-champ un critère ou une issue `#<k>` portant les deux citations,
par « Création d'issues en cours de cycle » (`.claude/rules/contraintes.md`), barreau 2 ou 4, le
brouillon en session distincte — ce skill n'ouvre rien lui-même.

Sur « go », l'amendement part par une PR, jamais par un commit direct sur le trunk :

- **dans une session PR**, il entre dans sa PR, par un commit de son `developpeur` (`cycle-pr`
  3.1) ou de son `executant` (`.claude/agents/executant.md`, « Ton commit ») ;
- **hors PR** — une session de tri, d'interrogatoire ou de `vers-issues`, le lead d'une vague, la
  coordinatrice d'une issue en lots coordonnés, ou celle que `repercussions` démarre —, une PR
  d'amendement, au déroulé de `.claude/skills/triage/hors-scope.md` (« Quand écrire », étapes 5 et 6) : un
  `executant` en isolation `worktree`, jamais dans le dossier partagé, applique la table des édits
  et commite sur une branche partie de `origin/<trunk>` ; la session pousse la branche, ouvre la
  PR, la relit et la merge au go du mainteneur.

Quand le mainteneur retient à l'étape 3 l'effet déplacé dans le dépôt (sortie 1b de
`decisions-vs-doc`), la table des édits porte ce déplacement, et non un amendement, par le même
déroulé de PR ; les quatre gestes ci-dessous sont ceux d'un amendement.

La table des édits porte, dans le même commit, ces quatre gestes, dans l'ordre, sans en sauter :

1. **Amender chaque §** exactement comme présenté. Ne jamais profiter de l'édition pour reformuler
   autre chose. Dans les §§ alignés, **écrire la même formulation partout** : deux énoncés
   identiques se retrouvent au grep suivant, deux paraphrases divergent à nouveau en silence.
2. **Journaliser** selon la colonne « Où s'inscrit un amendement » de la table, pour le rang touché
   — le § seul, ou le § plus une ligne au journal des changements du document, au format du
   tableau déjà en place là-bas.
3. **Archiver le raisonnement** dans l'emplacement non normatif déclaré par la table, s'il existe,
   au format déjà en place là-bas : la contradiction, les options, ce qui a été retenu, la date
   **absolue**, et la liste des §§ répercutés.
4. **Répercuter hors documents** ce que l'étape 2 a listé (`pipeline.config.md`, `CLAUDE.md`),
   **dans le même commit** que l'amendement — `.claude/rules/contraintes.md` l'exige.

### 5. Propager aux issues — la session `repercussions`

Le mode qui confronte aux issues une PR mergée par ce skill vit dans `repercussions`, étape 1
(« PR d'amendement ») : ce skill ne le recopie pas.

- **Dans une session PR**, l'amendement ou le déplacement fait partie du delta de sa PR : la passe
  `repercussions` de `cycle-pr` Étape 8 le confronte aux issues — rien à démarrer ici.
- **Hors PR**, dans le tour du mainteneur où la sortie est connue, démarrer la session
  `repercussions` : `start_session`, `initiation: user_asked`, `context: fresh`,
  `use_worktree: true`, et
  - **avec `origine : #<N>`** reçue à l'étape 1, à **chaque** sortie, pas seulement à celle qui
    amende — la passe de `#<N>` s'est arrêtée avant son étape 2 et rien d'autre ne la reprend :
    `title: <préfixe> › repercussions` (`sessions-liees.md`, « Identité », une racine se nomme
    d'abord), prompt `/repercussions #<N>` suivi du bloc d'arrêt reçu et de la ligne
    `contradiction soldée : <sortie>` de la table, qui donne aussi le message de fin de l'étape 6 ;
  - **sans origine** : à chaque sortie qui merge une PR, et à elle seule, au merge de cette PR,
    `title: <préfixe> › repercussions #<m>` (`sessions-liees.md`, « Identité », une racine se
    nomme d'abord), prompt
    `/repercussions #<m>`, où `<m>` est son numéro (mode « PR d'amendement ») — les autres
    sorties n'ont aucun delta mergé, rien à démarrer.

  | Sortie | Tour de la relance | Sans origine | Avec origine : ligne du prompt | Message de fin |
  |---|---|---|---|---|
  | amendement mergé | son merge | `/repercussions #<m>` | `contradiction soldée : amendement PR #<m>` | « terminé — amendement PR #<m> mergé » |
  | décision gagne, amendement reporté | l'ouverture de `#<k>` | rien, aucun delta mergé | `contradiction soldée : amendement reporté — #<k>` | « terminé — amendement reporté à #<k> » |
  | document gagne, effet déplacé dans le dépôt par une PR | son merge | `/repercussions #<m>` | `contradiction soldée : document gagne — PR #<m>` | « terminé — PR #<m> mergée, le document gagne » |
  | document gagne, effet abandonné | la décision de l'étape 3 | rien, aucun delta mergé | `contradiction soldée : document gagne` | « terminé — aucune PR, le document gagne » |
  | document gagne, effet déplacé hors du dépôt | la décision de l'étape 3 | rien, aucun delta mergé | `contradiction soldée : document gagne` | « terminé — aucune PR, le document gagne » |
  | pas de contradiction | son constat | rien, aucun delta mergé | `contradiction soldée : écartée — <raison>` | « terminé — contradiction écartée » |

  Hors d'un tour du mainteneur, une carte de proposition (`initiation: own_initiative`,
  `context: fresh`, `use_worktree: true`, même titre et même prompt). Le worktree propre a la raison
  que la « Délégation » de `repercussions` donne aux sessions qu'elle démarre.

### 6. Récapituler

Au mainteneur : le numéro de la PR qui porte l'amendement ou le déplacement, les §§ amendés,
l'entrée d'archive créée, ce qui a été répercuté hors documents, la propagation aux issues — la
session `repercussions` démarrée, ou la passe de `cycle-pr` Étape 8 dans une session PR —, et
**ce qui reste ouvert**. Une cascade laissée à moitié est pire que la contradiction de départ : elle est
invisible.

**Session démarrée par une autre** — par `repercussions` (son prompt système nomme le parent,
`.claude/skills/cycle-pr/references/sessions-liees.md`, « Identité ») : le récapitulatif fait,
prévenir le parent par le message de fin de `sessions-liees.md` (« Fin de travail »), sous la
forme que la table de l'étape 5 donne à sa sortie, suivie du suffixe « — enfants au travail :
`local_…` » qui nomme la session `repercussions` démarrée, absent quand la relance est restée une
carte de proposition — la fin du tour ne le prévient pas. La session qui l'archive nettoie cette
enfant (« Nettoyage »).

## Ce que ce skill ne fait pas

- **Il ne détecte pas.** La détection est le rôle de `.claude/rules/decisions-vs-doc.md`, toujours
  active. Ce skill part d'une contradiction déjà établie.
- **Il ne tranche pas.** Il présente l'amendement et la cascade ; le mainteneur décide si la
  décision vaut son prix. Une cascade large est un argument **contre** la décision, pas pour.
- **Il n'édite aucune issue lui-même.** C'est `repercussions`, à l'étape 5 — sa propre session, ou
  la passe de `cycle-pr` Étape 8 dans une session PR.
- **Il ne touche pas au code.** Une décision qui périme du code déjà écrit suit « Création
  d'issues en cours de cycle » (`.claude/rules/contraintes.md`), pas une édition sauvage.

## Les 3 idées à retenir

1. **Le rang le plus haut commande.** On amende à la source, jamais au milieu de la chaîne.
2. **L'état courant dans le document, le pourquoi dans l'archive.** Les en-têtes des docs
   l'imposent ; c'est ce qui les garde lisibles.
3. **La cascade se mesure avant le « go ».** C'est elle, pas l'amendement, qui dit si la décision
   est raisonnable.
