# Règle — Contraintes permanentes (à chaque commit)

Ces contraintes sont actives en continu, sur **chaque** commit, sans qu'on ait à les rappeler.

## Intégrité de l'historique
- **Aucun commit cassé n'entre dans l'historique.** La qualité est garantie *à chaque commit*,
  pas seulement à la fin. Si les tests sont rouges → pas de commit.
- **Jamais de force-push** sur une PR ouverte (sauf rebase/squash explicitement demandé), et
  **jamais** sur `main`.
- **Jamais d'auto-merge dans le trunk.** Même avec CI verte et audit propre, toujours attendre un
  « go » / « merge » humain explicite. Hors du trunk, une seule voie s'en passe : une PR de lot
  mergée dans la branche d'intégration de son issue par
  `.claude/skills/cycle-pr/scripts/merge-lot.py`, qui refuse le trunk et n'agit que sur verdict
  vert (`cycle-pr` Étape 7, « Le merge d'un lot ») ; la PR d'intégration, elle, attend son go.

## Propreté du code
- **Aucun code mort, aucun scaffold inutilisé.** Supprimer les imports / classes /
  commentaires-tutoriels générés par les outils ; ne garder que ce qui sert *maintenant*.
- **Pas de fichiers placeholder « au cas où ».**
- **Pas d'imports wildcard / glob**, quelle que soit la forme qu'ils prennent dans le langage.
- **Aucune sortie de debug laissée en place** (log/print/console temporaire), ni `TODO`/`FIXME`
  sans propriétaire et explication.

## Qualité de conception
Le code visé est **modulaire, scalable, fractionné** — objectif permanent, pas une option :

- **Modulaire** : modules à responsabilité unique, derrière des interfaces petites et stables.
  Viser des **modules profonds** — petite interface, implémentation riche
  (`cycle-pr/references/modules-profonds.md`), jamais des modules qui passent-plat.
- **Fractionné** : décomposer les fonctions, séparer les responsabilités. Pas de fonction
  fourre-tout, pas de fichier monolithique.
- **Scalable** : concevoir pour que l'ajout d'un cas se fasse par **extension** plutôt que par
  modification invasive. Éviter le couplage fort et les hypothèses qui ne tiennent qu'à petite
  échelle (boucles N+1, état global, limites en dur non justifiées).

## Règle d'or — toute question a une voie, et une seule bloque
Une supposition silencieuse coûte une demi-journée ; une question posée à quelqu'un d'absent en
coûte autant — surtout quand la réponse est celle que le mainteneur donne toujours. Avant de
poser une question, la **classer**, et le dire d'une
lettre en tête de la question ou de la décision : `[T]`, `[V]` ou `[C]`.

- **Voie T — technique.** Le bon choix se déduit des bonnes pratiques, des sources de vérité et
  de la doctrine du projet, sans composante de goût ni de produit. **On ne demande pas.** On écrit
  le cadre sourcé — documentation officielle, ADR, règle du projet —, la décision, et on avance ;
  la trace va dans les Notes de la PR, et dans un ADR quand c'est un choix d'architecture ou de
  dépendance. Le test de la voie T : la question se répondrait par la réponse type du mainteneur,
  ci-dessous. Si oui, elle ne se pose pas.

  > Quelles sont les bonnes pratiques pour cela ? Sans oublier que nous voulons un code organisé,
  > structuré, optimisé, clair, cohérent, facilement maintenable, scalable et sécurisé. Éliminez
  > tout code dupliqué, inutile ou obsolète. Et surtout, rendez-le scalable, modulaire et
  > générique. Décomposez les fonctions et séparez les responsabilités en suivant les principes
  > KISS, DRY et YAGNI. L'objectif est d'obtenir un code propre, clair, concis et optimisé. Ne
  > rabote pas la qualité pour tenir dans un gabarit de PR :
  > la taille ne découpe pas, seul un second sujet ou un motif écrit le fait (`taille-pr.md`).

- **Voie V — vision.** Ce que l'utilisateur voit, le contenu, le ton, le périmètre, un compromis
  produit : tout choix qu'un autre expert technique ferait autrement **pour une raison de goût ou
  de produit**. Elle attend le mainteneur, mais **groupée** — au go du briefing, à l'arrêt visuel
  ou avant le go du merge —, jamais seule au fil de l'eau. En attendant, l'agent avance sur ce qui
  n'en dépend pas, en notant sous la question l'hypothèse réversible qu'il retient d'ici là ; il
  ne rend la main que si tout ce qui reste dépend de la réponse. Un `developpeur` ne la pose pas :
  il note son hypothèse et rend la `[V]` dans son rapport, et la session de dialogue les groupe ;
  `executant` et `releveur` ne classent aucune question, ils remontent tout choix à leur appelant
  (leur rôle, « Ce que tu n'appliques pas »).
- **Voie C — contradiction.** La décision contredit une source de vérité : arrêt immédiat, deux
  citations, `.claude/rules/decisions-vs-doc.md`. Rien ne change. Un `developpeur` s'arrête et
  remonte les deux citations ; la session de dialogue présente l'arrêt.

Dans le doute sur la voie, c'est la voie V — et ce doute doit rester rare : une question de voie
T posée au mainteneur lui fait payer un aller-retour pour une réponse qu'il donne toujours.

Quelle que soit la voie :

- Si la réponse se trouve dans le code, **explorer le code plutôt que demander** — par un
  `releveur` pour un relevé, l'`executant` pour une cartographie (`cycle-pr` Étape 1), la
  conclusion restant à la session ; un `developpeur` explore lui-même dans son bloc. Pour
  un grilling approfondi, utiliser `interroge-moi`. L'exploration ne s'arrête pas au dépôt : pour
  un comportement d'outil **non documenté**, les logs applicatifs, l'arborescence de données
  locale et les horodatages sont des sources de premier ordre — la documentation décrit
  l'intention, les logs enregistrent le comportement. Distinguer explicitement ce qui est
  **prouvé** (cité, horodaté) de ce qui n'a pas pu être vérifié.
- **Un « go » autorise l'exécution, il n'éteint pas le cadrage.** En particulier pour
  l'installation d'un outil : une demande qui nomme un outil précis est une solution déjà choisie,
  qui masque le problème qui l'a motivée. Faire remonter l'objectif avant d'installer — l'outil
  demandé peut ne pas le résoudre, ou le besoin peut être déjà couvert sans rien installer. Une
  **limite du geste** relevée dans l'outil nommé remonte de même, avant l'installation
  (`cycle-pr` 3.1, « Frontières tierces »).
- **« Comment faire X » présuppose que X existe.** Avant de répondre par un mode d'emploi, vérifier
  la prémisse — en source officielle, jamais de mémoire — dès que X touche aux capacités, quotas,
  identifiants ou facturation d'un service tiers : une prémisse fausse y coûte de l'argent réel.
- **Jamais d'information dérivée d'un secret.** En guidant une action humaine sur un secret (jeton,
  clé, mot de passe), ne jamais demander un extrait de sa valeur — préfixe, longueur, derniers
  caractères, empreinte : une question dont la réponse s'obtient en regardant le secret sera
  satisfaite en collant le secret. Demander une **assertion binaire** (« commence-t-il par `sk.` ?
  oui / non »), annoncer l'attendu avant l'action, et précéder toute création de secret d'un
  « ne colle jamais la valeur ici ».

## Création d'issues en cours de cycle
- **Un cycle n'ouvre jamais d'issue seul.** Chaque skill a sa porte de sortie « nouvelle issue »
  (résidu de relecture, « ce que cette PR ne couvre pas », vide relevé par `repercussions`,
  échappatoire de `decisions-vs-doc`) ; chacune est raisonnable seule, leur somme ne l'est pas.
  La borne vit ici, au-dessus des skills. Elle est portée par la session PR, hors cycle par la
  session de dialogue qui relève le vide ; un sous-agent n'ouvre ni issue ni brouillon, le
  `developpeur` remonte le vide dans son rapport.
- Tout vide, résidu ou hors-périmètre relevé en cours de cycle suit cet ordre et s'arrête au
  **premier barreau qui tient** :
  1. **il tient dans la PR courante en moins d'un commit** → le faire ;
  2. **une issue ouverte possède le sujet** — en critère, en journal, en brief, ou parce qu'une PR
     fermée le lui a renvoyé → y **ajouter un critère** : édition du corps avec sa ligne de
     journal, jamais un commentaire ; c'est la passe `repercussions` de l'Étape 8 qui le fait. Une
     automatisation qui possède le sujet (bot, workflow planifié) se répare, elle ne se doublonne
     pas ;
  3. **un correctif évident** — visible à la lecture des lignes, sans décision de comportement —
     hors du périmètre de la PR courante → une **petite PR** par la **voie courte** de `cycle-pr`,
     sans issue ;
  4. **sinon** → un **brouillon** par `bug-vers-issue` ou `vers-issues`, montré au mainteneur, qui
     décide. Jamais de `gh issue create` sans ce brouillon validé.
- Une issue ouverte par le barreau 4 porte **dès sa création** son gabarit, sa catégorie et son
  thème.

## Écritures sur un artefact distant
- **Toute écriture sur un artefact distant se relit après écriture** — corps ou commentaire
  d'issue, body de PR, label, milestone : re-télécharger et vérifier que ce qu'on voulait y est,
  une **ancre** du contenu pour un texte, l'élément lui-même pour un label ou un milestone,
  **et** pour un texte que la **longueur** est plausible. Le code de retour atteste que la
  requête a abouti, jamais que le contenu écrit est celui qu'on voulait : une forme destructrice
  (un chemin pris pour un contenu, un `-f` tapé pour `-F`) rend exactement le même succès qu'une
  édition — et un brief entier remplacé par son chemin ne se voit qu'à la relecture. La relecture
  est à qui écrit : la session, ou le `releveur` à qui elle confie une écriture verbatim et qui rend
  ce qu'il a relu.

## Maintenance continue
- Tenir à jour, sans qu'on le redemande, les supports d'exécution du projet : fichier de commandes
  (`Makefile` / `justfile` / scripts du manifeste) et `.env.example`.
- Si une commande du projet change (test, lint, build…), mettre à jour la section « Commandes du
  projet » de `.claude/pipeline.config.md` **dans le même commit** — c'est elle que les skills lisent.
- **Tenir la documentation à jour dans le même commit que le changement** : `README`, `docs/`,
  `CLAUDE.md`, glossaire de domaine (`UBIQUITOUS_LANGUAGE.md`), docstrings/commentaires. Si un
  commit change un comportement, une commande, une interface ou l'architecture, la doc
  correspondante est mise à jour *dans ce commit* — jamais « plus tard ». Une doc fausse est pire
  qu'une doc absente.
- **Porteur** : l'auteur du commit — le `developpeur` pour la doc descriptive de son bloc
  (`.claude/agents/developpeur.md`, « La doc »), la session pour ce qu'elle spécifie à
  l'`executant` ; l'amendement d'une source de vérité reste à la session de dialogue
  (`decisions-vs-doc.md`, « Deux sorties »).

## Points d'arrêt humains
- Seule zone sensible par défaut : l'**UI à valider visuellement**. Un projet peut en déclarer
  d'autres dans `.claude/pipeline.config.md` (section « Périmètre ») ; sans déclaration, aucun
  autre changement — schéma, migration, authentification — ne provoque d'arrêt.
- **Cadence : une fois par PR, dès que l'écran est assemblé** — au commit qui le rend visible,
  jamais plus tard, et toujours avant `gh pr ready` — regardé dans les deux modes ; pas avant
  chaque commit. Un écran n'existe pas avant d'être assemblé : au commit qui pose un composant, un
  jeton de thème ou une clé de texte, il n'y a rien à regarder, et demander de valider à l'aveugle
  transforme le point d'arrêt en formalité qu'on apprend à expédier. C'est le contraire de ce
  qu'il sert. Mais attendre la fin de la PR coûte autant : les attentes du mainteneur arrivent
  alors après la dernière relecture, et chacune rouvre un cycle. Si une passe de relecture
  indépendante part au même commit (`cycle-pr` 4.2), la lancer d'abord, puis montrer l'écran : les deux attentes se
  recouvrent, et la passe suivante absorbe ce que le mainteneur demande. C'est la session PR qui
  prend l'arrêt : elle coupe le bloc du `developpeur` au commit qui assemble l'écran, et le
  `developpeur` le lui signale.
- Une zone sensible **ajoutée** par le projet suit la même cadence, sauf si sa ligne dans
  `.claude/pipeline.config.md` en déclare une autre.
