---
name: plan-qa
description: "À utiliser quand l'utilisateur veut planifier la QA d'un lot de travaux récemment implémentés — généralement après avoir fusionné des issues issues d'un PRD. Déclencheurs : « écris un plan de QA », « plan QA pour les issues #X #Y », « plan de QA pour le PRD », « je veux faire la QA de ce qu'on vient de livrer », ou après une session d'implémentation TDD."
argument-hint: "[\"Thème\" | #issues couvertes par la QA]"
---

# Rédacteur de plan de QA

Construis un plan de QA exhaustif et exécutable, cadré sur un lot de travaux précis, et publie-le sous forme d'issue GitHub avec un corps à cases à cocher. Le plan est ensuite exécuté par `execution-qa`, et les échecs trouvés pendant l'exécution sont qualifiés par `bug-vers-issue`, qui ne consigne en issue que le défaut à étudier.

## Principe fondamental

Le plan de QA doit être **cadré** (uniquement ce qui vient d'être livré), **exhaustif** (aucune hypothèse cachée) et **ancré dans la réalité** (vraies routes, vrais composants, vraies tables, vrais fixtures — pas inventés). Les checklists génériques sont un mauvais signe.

### La règle qui décide de tout : ne pas doubler la CI

**Une case n'a le droit d'exister que si un test automatisé ne peut structurellement pas la couvrir.**

`cycle-pr` a déjà imposé du TDD avec suite verte à chaque commit, un cleanup verbatim par commit et sur la branche, une relecture indépendante et des gates CI. Réécrire « la suite de tests passe » ou « l'API répond 200 » dans un plan de QA, c'est faire refaire à la main ce qu'une machine vient de faire — et c'est ce qui rend un plan si long que personne ne le déroule.

Ce qui mérite une case, c'est ce qu'aucun test ne voit :

- le **rendu réel** et les états d'interface (vide / chargement / succès / erreur) ;
- la **console et le réseau** du navigateur, les erreurs avalées par un wrapper générique ;
- l'**isolation entre comptes** avec de vrais jetons distincts ;
- un **job asynchrone** qui atteint réellement son état terminal, succès *et* échec ;
- les **effets de bord réels** : fichier écrit, ligne persistée, message émis ;
- l'**ergonomie** : bouton désactivé pendant l'attente, message compréhensible, polling qui s'arrête.

En cas de doute sur une case : « est-ce qu'un test aurait pu attraper ça ? » Si oui, elle sort du plan — et si ce test n'existe pas, c'est une issue pour `cycle-pr`, pas une case de QA.

### Les surfaces viennent de la config, pas d'un modèle en dur

Avant de rédiger, lire `.claude/pipeline.config.md` (sections **Stack**, **Périmètre**) et en déduire **quelles surfaces ce projet possède réellement**. Une CLI n'a pas de section frontend ; une lib n'a ni base ni worker ; un projet mono-utilisateur n'a pas d'isolation inter-comptes.

N'inclure que les surfaces existantes. Ne jamais générer une section pour une surface absente, même marquée « N/A » — c'est du bruit. En revanche, **si une surface existe et n'est pas couverte, l'omission doit être signalée** explicitement.

Si la config ne permet pas de trancher, **demander** plutôt que supposer.

## Délégation

La session garde le jugement : le périmètre — le mode, et la question au mainteneur du mode 4 —, les surfaces lues dans la config, le choix des phases et des cases et leur type, les « Décision QA », la rédaction, le go de publication. Le reste change de main :

- **`releveur`** — les relevés de l'entrée (« Entrées ») : les issues du périmètre — numéros, titres, corps, critères — par `gh issue list` ou `gh issue view` (modes 1 à 3), le PRD, les thèmes clos sans issue `qa-plan` (mode 4) ; `git log --grep="#<numéro-issue>"` par issue, et les chemins modifiés ; la carte des surfaces de l'étape 1 — routes, commandes, URLs, composants, tables, fixtures, variables d'environnement —, chaque nom vérifié contre les migrations ou les modèles, chaque endpoint ou chemin incertain vérifié localement (étapes 1 et 5). Il rend les relevés dans un fichier ; ce qui compte reste à la session ;
- **`executant`** — la passe comptable de la « Passe finale avant publication », sur le brouillon : il rend « conforme » ou les lignes en échec, et ne corrige rien ; une case sans type refuse la publication ;
- **script** — la publication, par `python .claude/skills/cycle-pr/scripts/ecriture-relue.py issue create …` (étape 7), appelée par la session elle-même : un geste isolé coûte plus délégué (`CLAUDE.md`, « Orchestration ») ;
- **sessions distinctes** — cette session peut être démarrée par `repercussions`, à son étape 7, qui lui passe le thème ; la QA se déroule dans une session `execution-qa` distincte, qui reçoit le numéro du plan publié, jamais dans le contexte de celle-ci (protocole commun : `.claude/skills/cycle-pr/references/sessions-liees.md`). `plan-qa` ne la démarre pas : il rend le numéro.

## Entrées (un mode parmi quatre)

Mode 1 — **Référence PRD** : `/plan-qa #42` où `#42` est une issue PRD. Le `releveur` (« Délégation ») relève le corps du PRD, puis les issues d'implémentation qui en découlent : `gh issue list --search "parent #42" --state all` (ou les issues qui mentionnent `#42`).

Mode 2 — **Liste explicite d'issues** : `/plan-qa #51 #52 #53`. Le `releveur` relève le corps et les critères d'acceptation de chaque issue.

Mode 3 — **Thème terminé** : `/plan-qa "Facturation"` où l'argument est un thème (milestone). C'est le mode le plus courant, proposé automatiquement par `repercussions` quand le dernier ticket d'un thème se ferme. Le `releveur` relève les issues du milestone : `gh issue list --milestone "<thème>" --state all --json number,title,body`.

Mode 4 — **Aucun argument** : le `releveur` relève les thèmes dont toutes les issues sont fermées et qui n'ont pas encore d'issue `qa-plan`, et la session demande au mainteneur lequel recetter. S'il n'y en a aucun, elle lui demande quelles issues sont dans le périmètre — **ne jamais deviner un périmètre de QA**, un plan mal cadré est un plan qu'on ne déroule pas.

Dans tous les modes, le `releveur` (« Délégation ») rend aussi :
- le PRD s'il est connu, dont la session tire la section « Vue d'ensemble » ;
- le corps et les critères d'acceptation de chaque issue dans le périmètre ;
- les commits de livraison de chaque issue, par `git log --grep="#<numéro-issue>"` ;
- les chemins de fichiers que ces commits modifient, pour que le plan s'ancre aux **vraies** routes, composants, tables, fichiers, variables d'environnement (étape 1).

## Processus

### 1. Inspecte le dépôt

- La session lit elle-même `.claude/pipeline.config.md` (stack, commandes, domaines, surfaces), `CLAUDE.md` et le glossaire du domaine (`UBIQUITOUS_LANGUAGE.md` ou équivalent), dont le plan emploie les termes.
- L'inspection part au `releveur` (« Délégation »), à qui la session donne la liste des surfaces de la config et des fichiers touchés par les commits du périmètre : `docs/`, `README`, le fichier de commandes du projet, puis les points d'entrée réels de **chaque surface déclarée** — selon le projet : routeur/contrôleurs, définition des commandes CLI, routes d'interface, schéma/migrations, définition des jobs —, plus tout fixture que ces commits touchent. Il cherche par `rg`/`rg --files` d'abord, et rend la carte des surfaces : chaque nom vérifié contre les migrations ou les modèles, chaque endpoint, commande ou chemin incertain vérifié localement — la session n'inclut comme instruction que ce que la carte a vérifié.

### 2. Décide où vit le plan

Essaie GitHub d'abord :
- Si `gh` est installé et que le cwd est un dépôt avec un remote GitHub, le plan est une **issue GitHub** portant le label `qa-plan` — le label réel est celui du mapping de `.claude/pipeline.config.md`. S'il manque au dépôt, `issue create` refuse en le nommant : s'arrêter et le dire au mainteneur ; `init-projet`, en reconfiguration, le pose (étape 6, « Créer les labels manquants dans GitHub »).
- Sinon, replie-toi sur un fichier markdown à `docs/qa/qa-plan-<slug>.md` (slug à partir du titre du PRD ou d'une courte étiquette de périmètre).

Indique à l'utilisateur quel mode tu utilises avant de rédiger.

### 3. Rédige le plan

Utilise `references/gabarit-plan-qa.md` comme squelette. Le plan a deux couches :

**Couche A — Phases transversales** (uniquement celles qui correspondent à des surfaces réelles du projet) :
- Phase 0 — Préliminaires (env, build, démarrage — commandes `install` / `build` / `run local` de la config)
- Phase 1 — Sécurité & Propriété (auth, isolation entre comptes) — **seulement si le projet a de l'authentification**
- Phase R — Régression (les flux existants fonctionnent toujours après la nouvelle livraison) — toujours inclure
- Phase Finale — Définition du Terminé

**Couche B — Blocs de fonctionnalité par issue**, intercalés entre les phases transversales dans l'ordre des dépendances. Un bloc par issue dans le périmètre. Utilise `references/exemple-bloc-issue.md` comme modèle. Chaque bloc inclut :

- Référence de l'issue (`#N — Titre`, lien)
- Référence au PRD source (le cas échéant)
- Critères d'acceptation, copiés/normalisés depuis l'issue en liste numérotée `- **C1** — …`, `- **C2** — …` : ce ne sont pas des cases, chaque case qui en couvre un le cite en fin de texte (`(C1)`)
- **Une section par surface que le projet possède réellement**, chacune ancrée à du vérifié :
  API/CLI (vraies routes ou commandes, vrais codes de sortie), interface (vraies URLs, composants, états), persistance (vraies tables ou chemins), traitements asynchrones (vrais services et flux de logs), artefacts produits (vrais fichiers, formats)
- Commandes exactes ou actions utilisateur
- Le type de chaque case, comme partout dans le plan : **Commande** ou **Observation** (`references/gabarit-plan-qa.md`, « Types de case »)
- Résultats attendus avant chaque action
- Règle d'arrêt
- Indices de sévérité pour les défaillances probables

Une surface que le projet n'a pas **ne produit aucune section**. Ne pas l'écrire pour la marquer « N/A ».

Utilise `references/taxonomie-couverture.md` comme feuille d'indices de couverture — n'en tire que les sections pertinentes pour les fonctionnalités dans le périmètre. Ne colle pas la taxonomie entière.

### 4. Rends-le exhaustif dans le détail et la vue d'ensemble

Pour chaque bloc par issue, demande-toi :
- Ai-je couvert chaque critère d'acceptation par au moins une case qui le cite (`(C<k>)`) ?
- **Chaque case survit-elle à la question « un test automatisé aurait-il pu attraper ça ? »** Si la réponse est oui, la case sort du plan.
- Chaque surface **que ce projet possède** est-elle considérée ? (Les surfaces absentes ne produisent rien ; une surface présente mais non couverte doit être signalée.)
- S'il y a une interface : les états d'erreur, vides, de chargement et de succès sont-ils tous listés ?
- S'il y a des comptes utilisateurs : les variantes propriétaire / accès croisé sont-elles testées pour chaque ressource liée à un utilisateur ?
- S'il y a des traitements asynchrones : atteignent-ils un état terminal vérifié, succès **et** échec ?
- S'il y a des fichiers entrants ou produits : les originaux sont-ils préservés, les invalides rejetés, les artefacts conformes au format annoncé ?

Pour le plan dans son ensemble :
- Y a-t-il une section **Vue d'ensemble** en haut indiquant : objectif du PRD, issues dans le périmètre, comportements visibles par l'utilisateur dans le périmètre, hors périmètre ?
- L'ordre des dépendances tient-il — une surface n'est testée qu'après celles dont elle dépend (ex. sécurité avant les fonctionnalités protégées ; primitives avant ce qui les consomme) ?
- La **Définition du Terminé** est-elle explicite et binaire ?

### 5. Ancre chaque commande à une réalité vérifiée

- Utilise des variables d'environnement pour la répétabilité : `$QA_RUN`, `$TOKEN_A`, `$TOKEN_B`, `$CLIENT_ID`, etc.
- Requêtes sur la persistance : uniquement sur les noms réels que le relevé du `releveur` a vérifiés contre les migrations ou les modèles (étape 1).
- Logs : toujours **bornés** (`--tail=200`), jamais un `--follow` non borné. Une preuve QA doit être petite et copiable-collable.
- Instructions d'interface : inclus l'URL ou la commande, le compte, l'état de départ (session vierge / préservée) et où lire les erreurs.
- Codes de sortie, statuts, états terminaux et volumes attendus font partie des « résultats attendus », pas des arrière-pensées.

### 6. Marque explicitement les décisions de politique

Quand un comportement dépend du produit ou est ambigu, marque la case avec `Décision QA :`, **après** sa marque de type — le plus souvent `**Observation** — Décision QA : … → <attendu>` : une case de décision reste une case typée, sinon la passe comptable la refuse comme case sans type. Indique :
- Comportement actuel (d'après le code)
- Risque
- Politique recommandée
- Ce qui change si l'utilisateur choisit autrement

Le compagnon d'exécution enregistre le choix de l'utilisateur lorsqu'il y parvient.

### 7. Montre le brouillon à l'utilisateur, puis publie

- La « Passe finale avant publication » d'abord, rejouée après chaque révision : le go du mainteneur porte sur le texte qui part.
- Affiche le corps complet du brouillon (ou un résumé plus le corps complet dans un bloc replié) et demande : « Publier ceci comme issue GitHub avec le label `qa-plan`, ou réviser ? »
- À l'approbation, publie :
  - GitHub : `python .claude/skills/cycle-pr/scripts/ecriture-relue.py issue create --title "Plan QA: <périmètre>" --body-file <brouillon> --label <qa-plan>`, `<qa-plan>` étant le label réel du mapping (étape 2) ; le script relit corps, titre et labels, et sa ligne de sortie porte le numéro ;
  - Repli markdown : écris le fichier, affiche le chemin.
- Rends le numéro de l'issue, ou le chemin du fichier : c'est ce que reçoit la session `execution-qa`.

## Sortie : titre et labels de l'issue GitHub

- Titre : `Plan QA: <court périmètre>` — ex. `Plan QA: PRD #42 (base de connaissances v2)` ou `Plan QA: issues #51 #52 #53`.
- Labels : `qa-plan`, sous son label réel (étape 2).
- Ne ferme AUCUNE issue source. Ne modifie PAS le PRD.

## Passe finale avant publication

Deux passes, dans cet ordre, avant de montrer le brouillon (étape 7).

### 1. Passe comptable — `executant`

La session lui passe le chemin du brouillon et celui du relevé des issues du périmètre (numéros et critères). Il joue les vérifications ci-dessous, chacune écrite en commande, et rend « conforme » ou chaque ligne en échec ; il ne corrige rien. Tout échec refuse la publication : la session corrige le brouillon et relance la passe. Aucun motif n'y porte de `\` : un caractère spécial s'y écrit entre crochets — `[[]`, `[]]`, `[*]`, `[(]`, `[)]` —, le hook RTK du poste faisant perdre ses `\` à un argument sans espace. Aucune ne commence non plus par un `grep` : le hook le réécrit en `rtk grep`, dont la sortie reformatée et tronquée a caché la case sans type d'un brouillon témoin — rejouée le 2026-11-03 vers 17:30 UTC, l'ancienne forme de « Cases sans type » a rendu « 42 matches in 1 files: » et « +17 more », sans la case de la ligne 73. Le brouillon y entre donc par `cat <brouillon> |`, que le hook réécrit en `rtk read`, contenu entier, et le `grep` placé après le `|` reste natif : rejouée ainsi sous le hook, telle qu'écrite, chaque commande a rendu sa sortie entière — 51 lignes pour « Critères → cases » — sur deux brouillons témoins, l'un conforme, l'autre fautif (`cycle-pr/references/tests.md`, « Frontières tierces : on vérifie, on ne suppose pas »).

- **Cases sans type** — toute ligne sortie est une case sans type (gabarit, « Types de case ») :

  ```bash
  cat <brouillon> | grep -nE '^([[:blank:]>]*([-*+]|[[:digit:]]+[.)])[[:blank:]]+)+[[][[:blank:]xX][]][[:blank:]]+' | grep -vE '^[[:digit:]]+:([[:blank:]>]*([-*+]|[[:digit:]]+[.)])[[:blank:]]+)+[[][[:blank:]xX][]][[:blank:]]+([*][*]Commande[*][*] — `[^`]+`|[*][*]Observation[*][*] — .+) → [^[:space:]]'
  ```

- **Critères → cases** — `cat <brouillon> | grep -nE '^## |^- [*][*]C[[:digit:]]+[*][*] — |^([[:blank:]>]*([-*+]|[[:digit:]]+[.)])[[:blank:]]+)+[[][[:blank:]xX][]][[:blank:]]+.*[(]C[[:digit:]]+(, C[[:digit:]]+)*[)]'` : chaque issue du relevé a son titre `## Bloc de fonctionnalité : Issue #<N>` ; sous chacun, avant le titre suivant, autant de lignes `- **C<k>** —` que l'issue a de critères, et chaque `C<k>` cité par au moins une case.
- **Marqueurs** — `cat <brouillon> | grep -nE 'TODO|FIXME|à compléter|<[^<>[:space:]][^<>]*>'` : toute ligne sortie porte un marqueur ou un espace réservé du gabarit ; une valeur d'exécution s'écrit en variable (`$CLIENT_A_ID`, étape 5) ou, produite par une case, se relit du fichier que cette case écrit (`$QA_RUN/upload.json`, `references/exemple-bloc-issue.md`).
- **Structure** — `cat <brouillon> | grep -nE "^## |^[*][*]Règle d'arrêt[*][*]"` : « Vue d'ensemble », « Types de case » et « Saisie d'échec » présents, « Paliers de sévérité » une fois, avant la première phase ; chaque `## Phase` — sauf la Phase Finale, qui clôt le plan — et chaque `## Bloc de fonctionnalité` suivi de sa ligne `**Règle d'arrêt**` avant le titre suivant.

### 2. Relecture de jugement — la session

- [ ] La section **Vue d'ensemble** nomme le PRD, les issues dans le périmètre, les comportements dans le périmètre, les éléments hors périmètre.
- [ ] **Aucune case ne re-teste ce que la CI couvre déjà** (suite de tests, lint, typecheck, build).
- [ ] **Aucune section ne porte sur une surface que le projet n'a pas** (déduite de `.claude/pipeline.config.md`).
- [ ] Chaque route, table, fichier, variable d'environnement ou fixture d'une case vient du relevé du `releveur`, vérifié contre le dépôt.
- [ ] *S'il y a des traitements asynchrones* : chacun a des vérifications d'état terminal (succès ET échec).
- [ ] *S'il y a des fichiers entrants ou produits* : chacun a des vérifications d'artefact (chemin, taille, format) et de persistance.
- [ ] Chaque échec d'action utilisateur a une vérification de visibilité de l'erreur UI attendue.
- [ ] La Définition du Terminé est binaire (`phases requises vertes, bloquants corrigés ou acceptés, ...`).
- [ ] Français, vocabulaire du domaine, pas de fuite de jargon interne.

## Erreurs fréquentes

| Erreur | Correction |
|---|---|
| **Cases qui refont le travail de la CI** (« les tests passent », « le lint est vert ») | Les supprimer. Le plan ne contient que ce qu'un test ne peut pas voir. |
| **Sections pour des surfaces inexistantes** (frontend sur une CLI, BDD sur une lib) | Déduire les surfaces de `.claude/pipeline.config.md`. Une surface absente ne produit aucune section, pas même un « N/A ». |
| **Case sans type** | `**Commande** —` ou `**Observation** —` en tête, puis ` → ` et l'attendu sur la ligne de la case (gabarit, « Types de case ») ; la passe comptable la refuse. |
| Le plan couvre des zones qu'aucune issue récente n'a touchées | Recadrer. Uniquement les phases de couche A pour le transversal, les blocs de couche B liés aux issues dans le périmètre. |
| Vérifications génériques (« l'API marche », « l'UI s'affiche ») | Ancrer à des routes/composants/états/codes de statut attendus spécifiques. |
| Jobs asynchrones sans vérifications d'état terminal | Ajouter les chemins explicites succès ET échec, avec l'état persisté attendu pour chacun. |
| Fichiers entrants/produits sans assertion sur l'artefact | Vérifier chemin, taille, format, préservation de l'original, et la trace persistée correspondante. |
| Un unique état « réussi/échoué » par phase | Chaque surface du projet est suivie séparément — ne jamais les fusionner en un verdict. |
| Longues queues de logs (`docker logs --follow`) | Utiliser des queues bornées. Les logs en preuve QA doivent être petits et copiables-collables. |
| Langues mélangées | Français, vocabulaire du domaine, pas de fuite de jargon interne. Les preuves collées par l'utilisateur restent dans leur forme native. |
