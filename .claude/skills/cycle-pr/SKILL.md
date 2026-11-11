---
name: cycle-pr
description: Exécute le cycle complet de développement d'une PR — briefing pré-PR, ouverture de la PR en draft avant tout code, implémentation en TDD red-green-refactor, cycle de commit modif→test→cleanup→test→commit, auto-review, passage en ready for review, boucle de review et merge. Utiliser pour implémenter une issue ready-for-agent, développer une fonctionnalité ou corriger un bug en suivant la pipeline.
argument-hint: "[#issue ready-for-agent | description du travail]"
---

# Cycle PR

Le cycle de réalisation d'une Pull Request, de bout en bout. Pièce centrale de la pipeline :
prend une issue `ready-for-agent` (ou une demande directe) et la mène jusqu'au merge — puis
répercute la clôture sur les autres issues — sans jamais laisser entrer un commit cassé dans
l'historique.

Les **règles permanentes** (`.claude/rules/`) s'appliquent en continu : aucun commit cassé,
pas d'auto-merge dans le trunk, pas de force-push, pas de code mort, format des commits
(préfixe EN + description FR), taille de PR. La **règle d'or** : toute question a une voie
— technique `[T]`, elle se décide et se trace ; vision `[V]`, elle attend le mainteneur, groupée ;
contradiction `[C]`, elle arrête (`.claude/rules/contraintes.md`).

**Commandes du projet.** Ce skill ne présuppose aucune stack : les commandes `test`,
`test-pipeline`, `test ciblé`, `lint`, `format`, `typecheck` et `build` se lisent dans la section
« Commandes du projet » de `.claude/pipeline.config.md`. Une étape marquée `n/a` s'ignore. Si le
fichier est absent, s'arrêter et proposer une session `init-projet` distincte (`init-projet`,
« Note pour les autres skills ») ; ne jamais deviner une commande.

**Vague parallèle.** → [references/briefing.md](references/briefing.md), « Vague parallèle ».

**Session de lot.** Si ce prompt fait de cette session un lot ouvert par une coordinatrice
(Étape 1, « Découpage en plusieurs lots »), lire d'abord
[references/coordinatrice.md](references/coordinatrice.md), « La session de lot » : il change le
premier geste, la base de la PR, le go de l'Étape 1, le body de la PR, le destinataire de la
vérification d'avant-go, le merge, le relais et l'Étape 8.

**Relais.** Un contexte qui se remplit avant la fin du cycle, à quelque étape que ce soit, se
passe à une session neuve par la passation de l'Étape 8, « Relais en cours de cycle » — écrite
**avant** de rendre la main, puisqu'elle porte ce que seule la session sortante possède.

## Voie courte — correctif évident

Un **correctif évident** au sens du barreau 3 de `.claude/rules/contraintes.md` — visible à la
lecture des lignes, sans décision de comportement — dont le diff attendu tient en **≤ 50 lignes et
≤ 3 fichiers**, sans zone sensible ni surface visible (`.claude/pipeline.config.md`, « Périmètre »)
et sans toucher `.claude/`, emprunte cette voie. Elle **remplace** les Étapes 1, 2, 5, 7 et 8 ;
les Étapes 3 et 6 s'appliquent telles quelles — 3.2 et 3.4 réduits au `lint` et au test ciblé —,
la session codant elle-même (3.1), l'Étape 4 sous la forme du point 3. Dès qu'une condition tombe
en cours de route — diff qui dépasse, décision à prendre, fichier de `.claude/` —, la PR repasse en
draft (`gh pr ready --undo`), son body reçoit le briefing de l'Étape 1, et le cycle complet reprend
à l'étape atteinte ; le body le dit.

1. **Branche** derrière la porte de fraîcheur (Étape 1) ; pas de sonde d'outillage, le premier
   commit est la sonde.
2. **Un commit TDD par la session**, par le cycle 3.1→3.5 — le test vu rouge reste, le prompt de
   `.claude/rules/cleanup-verbatim.md` mot pour mot, `lint` et test ciblé verts — ; push ;
   `gh pr create` **direct, non draft**, `--assignee @me`, label et milestone
   (`.claude/pipeline.config.md`, « Métadonnées d'une PR »), body : Summary, Changes et une ligne
   « Relecture indépendante ». La qualification de correctif évident s'y écrit avec sa preuve
   (Étape 1, « Porte d'entrée obligatoire »). Née d'une case ` 🔴 correctif évident — …` d'un
   plan de QA, la session la remplace par ` 🔴 PR #<M>` dès l'ouverture, par le geste de l'Étape 2.
3. **Une passe** de relecture à contexte vierge : le sous-agent `relecteur`
   ([references/session-relecture.md](references/session-relecture.md), « Repli »), sans session
   liée ; avant lui, la session joue `/code-review medium` et, si le diff touche une surface
   exposée, `/security-review` (même référence, « Repli »). Mêmes sévérités et même traitement
   qu'en 4.2.
4. **CI verte**, lue dans `gh pr checks` — pas d'`attente-ci.py` en fond —, puis le relevé de
   conversation inscrit au body, sans `verificateur`, par
   `python <répertoire de ce skill>/scripts/porte-merge.py conversation <n> --releve`, puis lu
   (Étape 7, « Vérification d'avant-go »), puis go humain, puis le merge par la porte de « Le
   go, puis le merge » (Étape 7), le `<SHA du trunk éprouvé>` lu par
   `porte-merge.py trunk <run> <trunk> <SHA de tête vérifié>` (« Rejouer les vérifications
   périmées ») et noté dans le body avec le numéro du run ; trunk avancé : relancer comme la porte
   le dit — `gh run rerun <run>`, ou fermeture-réouverture sur une définition périmée, même
   paragraphe — et relire la ligne de fusion, sans `verificateur`.
5. Ni `verificateur`, ni bilan chiffré, ni `repercussions` — sauf si le diff touche un fichier de
   la section « Sources de vérité », ou si un résidu a été rangé au barreau 2 en cours de cycle :
   la passe `repercussions` de l'Étape 8 est alors due. Sinon, un `grep` des ancres du diff sur
   `docs/` et sur les issues ouvertes (`gh issue list --search <ancre>`), une ligne dans le body.

Les cinq invariants tiennent : commit vert, go humain, relecture indépendante, doc dans le commit,
minimalisme (`ponytail`).

## Étape 1 — Briefing pré-PR (avant la première ligne de code)

**Éprouver les outils d'abord.** → [references/briefing.md](references/briefing.md), « Éprouver les outils d'abord ».

```
python <répertoire de ce skill>/scripts/sonde-outillage.py --format "<format>" --test "<test>"
```

→ [references/briefing.md](references/briefing.md), « Six sondes, de la moins chère à la plus chère ».

Un échec ici se remonte à l'utilisateur **avant** le briefing, avec les cibles de correction
possibles et leur portée (session, projet, machine) : c'est un arbitrage de configuration, jamais
une décision du skill — **un skill ne modifie pas la configuration de l'utilisateur pour se
débloquer lui-même**. Un même message de refus quelle que soit la commande se lit comme un
problème de permissions alors que c'est l'outillage ; éprouver coûte quelques commandes avant le
briefing, et une demi-session après le « go ».

**Une commande marquée `# non vérifiée`** dans `.claude/pipeline.config.md` signale un projet
initialisé sans code. Si cette PR pose du code, elle porte aussi ce que `init-projet` a reporté —
la génération CI et Dependabot de son étape 7, paragraphe « Runtime épinglé » compris, la
vérification des commandes de son étape 11, puis le retrait des marqueurs. L'inscrire au
briefing ; sans elle, le projet resterait sans CI.

Produire un briefing écrit AVANT de créer la branche :

- **Liste précise des fichiers** à créer/modifier — le chemin exact de chacun.
- **Estimation** → [references/briefing.md](references/briefing.md), « Estimation ».
- **Décisions verrouillées** — choix d'architecture / scope / format actés.
- **Questions résiduelles** — découpage, format des données, transitions d'état, comportements,
  edge cases — **chacune avec sa voie** (`contraintes.md`, règle d'or) : une `[T]` se tranche
  ici même, avec sa source, et rejoint les décisions verrouillées ; les `[V]` se posent toutes
  ensemble, au go du briefing — l'accord pour démarrer sa session de relecture et l'archiver à
  l'Étape 8 en fait partie, puisque `start_session` ne part que dans ce tour
  ([references/session-relecture.md](references/session-relecture.md)), et hors vague
  l'accord pour lancer soi-même le `verificateur` d'avant-go (Étape 7).
  Le go couvre aussi les relances de CI de la PR par `gh run rerun` ou par fermeture-réouverture
  (Étapes 5 et 7), bornées ; une `[C]` arrête.
  Une session liée prévient son parent avant de poser ses `[V]` : « attend le mainteneur :
  <question> » ([references/sessions-liees.md](references/sessions-liees.md), « Messages »).

Lever les incertitudes **maintenant** : une `[V]` découverte après cinq commits coûte une
demi-journée d'attente ; une `[T]` ne se pose jamais, elle se décide — la plupart appellent la
réponse que le mainteneur donne toujours.

**Ce que couvre le go du briefing.** → [references/briefing.md](references/briefing.md), « Ce que couvre le go du briefing ».

### Porte d'entrée obligatoire — l'interrogatoire

**Aucune PR ne démarre sans que le travail soit passé par `interroge-moi`.** Vérifier l'état de
l'issue dès les outils éprouvés :

- **Issue interrogée** (passée par `needs-interrogation`, décisions consignées dans le brief
  d'agent) → relire ces décisions, et vérifier qu'elles tiennent encore (auto-challenge ci-dessous).
- **Brief portant `⚠️ Non interrogée au triage`**, ou aucune trace d'interrogatoire → **s'arrêter
  et proposer une session d'interrogatoire** (`interroge-moi`, numéro de l'issue en argument), avant
  la première ligne de code, puis reporter ses décisions, écrites dans l'issue, dans les
  « Décisions verrouillées » du briefing.
- **Demande directe sans issue** → l'interrogatoire s'applique aussi ; il n'y a pas de raccourci
  parce que le travail n'a pas de ticket. Un correctif évident — visible à la lecture, sans
  décision de comportement (`contraintes.md`, barreau 3) — n'a rien à interroger : sa
  qualification, écrite dans le body de la PR — draft, ou PR de la voie courte — avec sa preuve,
  en tient lieu.

Le point n'est pas de cocher une case : c'est que **les décisions tranchées soient écrites**, dans
l'issue — brief amendé s'il est contredit — et dans le briefing. Elles seront relues par une
autre session que celle-ci.

### Auto-challenge du plan — le plan est-il encore exact ?

→ [references/briefing.md](references/briefing.md), « Auto-challenge du plan — le plan est-il encore exact ? ».

S'il y a un écart qui change le cours du dev, **s'arrêter et le remonter à l'utilisateur** avant le
« go » — ne pas dérouler un plan périmé en silence. Si tout tient, le dire explicitement (« plan
confirmé contre l'état actuel »).

**Une réponse `[V]` du go qui contredit le brief l'amende avant la première ligne de code** → [references/briefing.md](references/briefing.md), « Une réponse `[V]` du go qui contredit le brief l'amende avant la première ligne de code ».

**Découpage en plusieurs lots.** → [references/briefing.md](references/briefing.md), « Découpage en plusieurs lots ».

Attendre un **« go » explicite**, puis créer la branche — trunk-based depuis `main`, derrière une
**porte**, c'est-à-dire une commande dont le code de sortie porte la condition :

```
git fetch origin
git merge-base --is-ancestor main origin/<trunk> && git merge-base --is-ancestor origin/<trunk> main && git checkout -b <type>/<description>
```

Cette porte suppose d'être **sur `main`**, dans le clone principal. Une session placée dans le
worktree d'une issue en lots est sur la branche **mergée** du lot précédent : elle ne compare
rien, elle part d'`origin/<trunk>` explicitement — `git fetch origin`, puis
`git checkout -b <type>/<description> origin/<trunk>`. Sans point de départ, `checkout -b` part
de la branche morte et emporte ses commits réécrits (mesuré ; la voie complète est dans
[references/prompt-lot-suivant.md](references/prompt-lot-suivant.md)). Une session **démarrée
par une autre** dans un worktree de l'application ne compare rien non plus : son premier geste
est celui de [references/sessions-liees.md](references/sessions-liees.md), « Premier geste ».

**Deux prédicats, pas un.** → [references/portes.md](references/portes.md), « Deux prédicats, pas un ».

**Au blocage** → [references/portes.md](references/portes.md), « Au blocage ».

## Étape 2 — Ouvrir la PR en draft (toujours avant la première ligne de code)

**La PR est le premier artefact produit, pas le dernier.** → [references/briefing.md](references/briefing.md), « La PR est le premier artefact produit, pas le dernier ».

GitHub refuse une PR sans commit : amorcer avec un commit vide, pousser, ouvrir en draft. Le
message d'amorce suit `taille-pr.md` comme tout autre commit — **pas de numéro d'issue dans le
titre**, le lien vit dans le `Closes #N` de la PR.

```
git commit --allow-empty -m "chore: amorce <description courte>"
git push -u origin <type>/<description>
gh pr create --draft --assignee @me \
  --label "<label de catégorie>" --milestone "<thème des fichiers>" \
  --title "<type>(<scope>): <description FR>" \
  --body "$(cat <<'EOF'
Closes #<N>

## Briefing (provisoire — remplacé à l'Étape 5)
<le briefing validé à l'Étape 1>
EOF
)"
```

La PR draft porte **dès sa création** :

- **`Closes #<N>`** dans le body. C'est **la** ligne qui rend l'issue détectable comme en vol.
  Sans elle, `repercussions` la croira dormante et éditera sa spec en cours de développement.
  **Cas découpé** — une issue en plusieurs lots, sur un motif écrit au brief (`taille-pr.md`,
  point 3) : par défaut en **lot léger**, des PR successives vers `main`, chacune avec son go
  (Étape 7), sans coordinatrice ni branche d'intégration (point 4). Seule la **dernière** PR porte
  `Closes #<N>` — un `Closes` sur la première fermerait l'issue trop tôt. Chaque autre PR ouvre son
  body par la ligne **`En vol pour #<N> (lot k/n)`**, que `repercussions` lit au même titre que
  `Closes` : sans elle, l'issue paraît dormante précisément pendant qu'on travaille dessus. GitHub,
  lui, ne lit que le mot-clé : le lien des lots précédents se repose à l'Étape 8, une fois l'issue
  close. Chaque lot suivant part du prompt du lot suivant, base `main`, dans une session neuve
  (3.5). Avec une coordinatrice — ses deux cas seulement —, le `Closes` passe à la PR
  d'intégration et **toutes** les PR de lot portent la ligne « En vol »
  ([references/coordinatrice.md](references/coordinatrice.md)).
- Le **briefing de l'Étape 1** comme corps provisoire — le plan devient lisible par le mainteneur
  et par les autres sessions, avant que le code n'existe.
- **Assignee**, **label** de catégorie et **milestone**, posés par le bloc ci-dessus — leurs
  valeurs : `.claude/pipeline.config.md`, « Métadonnées d'une PR » (une PR est déjà née sans l'un
  ni l'autre).
- Le marqueur **draft**, qui dit « en cours, ne pas reviewer » et interdit le merge accidentel.

Pour une **demande directe sans issue**, ouvrir quand même la draft : sans `Closes`, mais le
travail reste visible du reste de la pipeline. Pour une draft née d'un échec de QA (case
` 🔴 correctif évident — …`), la session, une fois la draft ouverte, remplace ce marqueur par
` 🔴 PR #<M>` sur la case, par une paire
(`python .claude/skills/cycle-pr/scripts/ecriture-relue.py checkbox patch <plan> --paires <fichier>`,
`execution-qa/references/patch-checkbox-gh.md`) : c'est ce que lit la reprise de la QA.

> **Une PR en draft n'a aucun run de CI** → [references/briefing.md](references/briefing.md), « Une PR en draft n'a aucun run de CI ».

En vague parallèle (`pr-paralleles`), le lead relève lui-même le numéro de PR (`gh pr list`) pour
son tableau de bord : rien à lui envoyer. Une session démarrée par une autre lit ensuite
`get_status` ; `bind_pr` n'y sert qu'en repli
([references/sessions-liees.md](references/sessions-liees.md), « Premier geste »).

## Étape 3 — Le cycle de commit

Chaque commit suit :

```
1. modif (TDD)  →  2. test (vert)  →  3. cleanup pass  →  4. test (vert)  →  5. commit
```

**La boucle s'enchaîne sans rendre la main.** Un cycle AFK va de 3.1 à 3.5 puis repart en 3.1
jusqu'à l'Étape 4 — en lançant au passage, à chaque frontière de bloc (3.5), la **passe de
relecture 4.2** de ce bloc ; l'annonce de
l'étape suivante (« Next : commit 2/3 ») est un **titre**, pas une demande d'autorisation. Les
seuls arrêts légitimes du cycle : une question `[V]` dont dépend **tout** ce qui reste à faire, un
arrêt `decisions-vs-doc` (`[C]`), le point d'arrêt humain (zone sensible, une fois par PR, au
commit qui assemble l'écran — 3.5) et le « go » de l'Étape 7. Une `[V]` dont une partie du travail
ne dépend pas s'inscrit dans le body de la PR draft, sous « Questions en attente », avec
l'hypothèse réversible retenue d'ici là, et le cycle continue sur cette partie ; elle sera posée
groupée au prochain arrêt. Arrêtée sur une `[V]`, une session liée prévient d'abord son parent :
« attend le mainteneur : <question> » ([references/sessions-liees.md](references/sessions-liees.md),
« Messages »). Ailleurs, s'arrêter est une remise de main que personne n'a demandée.

### 3.1 Modification — en TDD (tracer bullet vertical)

**La session PR écrit le bloc ; un `developpeur` neuf le code** (`.claude/agents/developpeur.md`)
**dès que le bloc dépasse ~50 lignes de diff ou ajoute un module ; en dessous, la session code
elle-même** — le brief coûterait plus que le code. Le brief d'un bloc porte ses fichiers, ses
signatures, ses tests attendus et leur rouge, son comportement, son estimation en blocs
(Étape 1), la base du gabarit (3.5) et le niveau `ponytail` ; le `developpeur` part à `xhigh` quand le bloc écrit des tests. Il fait le TDD
de cette étape, le cycle 3.2 à 3.5, la doc descriptive et le commit — jamais le push, que la
session PR fait après chaque remise, derrière la ligne « validation » quand le delta la demande
(3.2). Arrêté sur une `[C]` ou sur une question dont dépend tout le bloc, il est **repris par
`SendMessage`** avec la réponse — `[T]` tranchée par la session PR, ou
question portée au mainteneur —, jamais remplacé (mesuré le 2026-10-20 sur une `[C]` fabriquée) ;
ses `[V]` rejoignent « Questions en attente ». Un `developpeur` neuf
seulement au bloc suivant, jamais pour une retouche du même bloc.

**Un délégué qui attend son travail de fond au-delà de la durée prévue se diagnostique avant toute
nouvelle attente** — processus du worktree, sorties de ses tâches de fond. Sur un lot, la
suite du back est restée figée de 15:42 à ~19:20 sur un `docker run -i` lancé sans délai
(2026-10-28, rapporté, non re-mesuré) ; sur un autre, un `find` lancé en fond
sur tout le disque a tenu ≈ 1 h 20 sur le chemin critique, jusqu'à une intervention du
mainteneur. Pour l'éviter, chaque rôle à `Bash` porte la ligne « commande de fond bornée ».

**Frontières tierces : on vérifie, on ne suppose pas.** → [references/tests.md](references/tests.md), « Frontières tierces : on vérifie, on ne suppose pas ».

**Un zéro rendu par un outil de contrôle se lit avec son inventaire** → [references/tests.md](references/tests.md), « Un zéro rendu par un outil de contrôle se lit avec son inventaire ».

**Un avis de sécurité sans correctif n'est pas une impasse.** → [references/tests.md](references/tests.md), « Un avis de sécurité sans correctif n'est pas une impasse ».

Implémenter **un comportement à la fois** en red-green-refactor — pas tous les tests d'abord puis
toute l'implémentation, le découpage horizontal produit de mauvais tests :

```
ROUGE : écrire UN test du prochain comportement → il échoue
VERT  : écrire le minimum de code pour le faire passer → il passe
```

Règles : un test à la fois ; juste assez de code pour passer le test courant ; ne pas anticiper
les tests futurs ; tester le comportement observable via l'interface publique.

**Le rouge se constate, il ne se suppose pas — un test qui n'a pas été vu rouge n'est pas un test.** → [references/tests.md](references/tests.md), « Le rouge se constate, il ne se suppose pas ».

- Bons vs mauvais tests : [references/tests.md](references/tests.md)
- Quand mocker (frontières du système uniquement) : [references/mocking.md](references/mocking.md)
- Concevoir des interfaces testables : [references/design-interface.md](references/design-interface.md)
- Viser des modules profonds : [references/modules-profonds.md](references/modules-profonds.md)

**Documentation maximale** : chaque fonction écrite est documentée à fond (intention, params,
valeur de retour, erreurs, effets de bord, pré/postconditions, exemples, edge cases) au format
idiomatique du langage. La doc explique le contrat, les tests prouvent le comportement.

**Doc projet en sync** : si le delta change un comportement, une commande, une interface ou
l'architecture, mettre à jour la doc concernée (`README`, `docs/`, `CLAUDE.md`, glossaire) **dans
le même commit** — voir `.claude/rules/contraintes.md`. La doc ne se met jamais à jour « plus tard ».

### 3.2 Premier passage de tests

Le `developpeur` lance la suite rapide, et « test-pipeline » si le delta la concerne (« Commandes
du projet »). **Si rouge → pas de commit.** Il répare. Contrôles complémentaires :

→ [references/tests.md](references/tests.md), « Contrôles complémentaires de 3.2 ».

### 3.3 Le « cleanup pass » — relecture distincte du delta

Une fois le delta fonctionnel et vert, le `developpeur` en fait une **relecture distincte** (pas
du nettoyage au fil de l'eau).

**Le prompt à exécuter et la façon de l'appliquer vivent dans `.claude/rules/cleanup-verbatim.md`**
— règle permanente, donc déjà chargée. Le prompt s'exécute **mot pour mot** depuis ce fichier ; ne
jamais le recopier ici, une copie finit toujours par diverger de l'original.

Spécifique à cette étape :

- Pistes de refactor : [references/refactoring.md](references/refactoring.md).
- Vérifier aussi les 3 axes de conception de `.claude/rules/contraintes.md` (modulaire /
  fractionné / scalable), en plus de KISS, DRY et YAGNI.
- **PR « foundation »** : YAGNI peut être suspendu ponctuellement (scaffold pour la suite), mais
  le **noter explicitement**. KISS, DRY et la structure restent actifs.
- **La doc voyage avec le delta — question instrumentée, pas rappel** : « ce delta change-t-il un
  comportement, une commande, une interface ou l'architecture ? si oui, quel fichier de doc est
  dans le même `git add` ? ». Répondre en listant l'index (`git diff --cached --name-only`) —
  une doc rattrapée « en fin de PR » est la violation la plus répétée du cycle.

### 3.4 Second passage de tests

Le cleanup a pu casser quelque chose. Le `developpeur` relance les tests, et la commande du projet
que 3.2 a fait exécuter si le delta la touche ; rouge → pas de commit.

### 3.5 Commit

Uniquement si tout passe. Message = **titre conventional commit seul** (préfixe EN, description FR) :

```
git commit -m "type(scope): description"
```

Pas de corps, pas de footer, pas de `Co-Authored-By`, pas de numéro de PR. Breaking change : `!`
dans le titre.

**Puis la frontière de bloc** (`taille-pr.md`, points 5 et 7). Le `developpeur` rend avec chaque
commit le chiffre du gabarit, `git diff --stat <base>...HEAD`, la base de son brief ; seul un
changement de périmètre l'arrête, jamais un chiffre. La remise d'un bloc — ou le commit de la
session qui le code elle-même (3.1) — en est la frontière, où la session PR lit trois choses :

- **les blocs** — le chiffre contre l'estimation en blocs du briefing (Étape 1, « Estimation ») ;
  un dépassement tient en une ligne de Notes ;
- **le périmètre** — un bloc qui a dû toucher ce que ni son brief ni les critères de l'issue ne
  portent rouvre le découpage maintenant, pas à l'Étape 5 ;
- **la fenêtre** — la part de son propre contexte déjà consommée ; si un relais s'annonce, elle
  rejoue le test du sujet (`taille-pr.md`, point 1) : deux sujets, elle coupe en lot léger (Étape 2,
  « Cas découpé ») ; un seul, elle relaie (Étape 8, « Relais en cours de cycle »).

**Un découpage rouvert en cours de cycle coupe en lot léger** (`taille-pr.md`, point 4). Les PR
qu'il fait naître suivent « Une session neuve par lot » (Étape 8) : la session courante finit son
lot — sa PR vers `main`, son go, la ligne « En vol » (Étape 2, « Cas découpé ») — et écrit la
passation depuis les artefacts ; le lot suivant reçoit sa session neuve, proposée au mainteneur
par une carte (`start_session`, `initiation: own_initiative`) — aucune session n'en démarre une
autre hors d'un tour humain. **Un sous-lot n'existe que sous une coordinatrice** : un lot coordonné
qui se rouvre devient un sous-lot, qu'elle ouvre comme un
lot ([references/coordinatrice.md](references/coordinatrice.md), « Ouvrir le lot suivant »). Un
re-découpage qui sépare un commit de ses
correctifs rejoue d'abord la passe « affirmations » de `cleanup-verbatim.md` sur le premier
morceau **seul** : chaque docstring s'y lit contre le code de ce morceau, pas contre l'état final,
et les limites que le morceau suivant lève s'y nomment.

Puis la session PR pousse et enchaîne sur le bloc suivant (retour 3.1) — ou, à une frontière de
bloc, lance d'abord la passe de ce bloc (4.2). Si ce commit assemble un écran
d'une zone sensible, c'est maintenant qu'elle prend le point d'arrêt humain — cadence et forme
dans `.claude/rules/contraintes.md`, « Points d'arrêt humains », source unique.

## Étape 4 — Relecture indépendante

Deux relectures. Le cleanup pass holistique (4.1) quand tous les commits sont faits. La relecture
à contexte vierge (4.2) **par bloc** (`taille-pr.md`, point 5) — une seule passe quand la PR tient
en un commit de code — : une passe à chaque frontière de bloc (3.5), en plein cycle de commit, la
première sur `<base>..HEAD` ; puis la **passe finale** après 4.1, sur ce qui a été écrit depuis la
dernière ; et une passe de plus tant que la dernière trouve un bloquant ou un important (« La
boucle », ci-dessous). `<base>` est le point de fork,
`git merge-base origin/main HEAD`, jamais le nom du trunk : une plage adossée à un trunk qui
avance se diffe à l'envers.

**4.1 Cleanup pass holistique** — le prompt de `.claude/rules/cleanup-verbatim.md` sur le **diff
complet de la branche** (`git diff main...HEAD`), à l'échelle de la PR : architecture (couplage,
frontières), naming entre commits, edge cases / erreurs / race conditions, **duplication
inter-commits**. C'est le seul regard global sur le code avant la relecture à contexte vierge — le
regard local, c'est 3.3, à chaque commit ; il n'y en a pas de troisième avant le merge. La session
PR le confie à un `developpeur` neuf, qui ne rend que des commits, **au-delà de 3 commits de code
ou de 150 lignes de diff ; en dessous, elle l'exécute elle-même** ; la passe « affirmations » de
`cleanup-verbatim.md` s'y joue aussi sur tout le delta — exigée par le brief du `developpeur`, ou
faite par la session —, avec son dénombrement
(N affirmations, k établies, N−k non vérifiées), que la session PR inscrit dans les Notes avant la
première vérification d'avant-go. Puis la passe finale 4.2.

**4.2 Relecture par un contexte vierge.** Le cleanup holistique est fait sous le brief de la
session PR, avec les hypothèses qui ont produit le code ; il ne les met pas à l'épreuve. Le diff est donc
relu par un lecteur qui ne les a pas : la **session de relecture** de la PR, que la session PR
démarre au go du briefing, réveille par message et nettoie — protocole dans
[references/session-relecture.md](references/session-relecture.md) —, et qui suit
`.claude/agents/relecteur.md` : ce qu'elle reçoit, ce qu'elle vérifie, ce qu'elle rend. Le
sous-agent `relecteur` en est le repli écrit (même référence, « Repli »). Un rôle ajouté
dans `.claude/agents/` pendant cette session n'existe pas encore pour l'outil Agent : le repli
`general-purpose` ne vaut que pour un rôle sans liste `tools:`, et `relecteur` en a une — un rôle à
outils réduits se lance depuis une session neuve (`CLAUDE.md`, « Orchestration »), que la session PR
ne démarre pas hors d'un tour humain : d'ici là, la relecture passe au relecteur humain,
ci-dessous.
L'invocation de `cycle-pr` — `/cycle-pr` tapé par l'utilisateur, ou prompt de démarrage d'une vague
`pr-paralleles` — **vaut demande** pour ce sous-agent : une consigne de session « pas de
sous-agent sans demande de l'utilisateur » est déjà satisfaite. S'il ne peut pas même être lancé,
la relecture passe au relecteur humain (même référence, « Repli »).

**Les portes bon marché d'abord.** Un relecteur coûte un contexte entier ; ce qu'une commande
trouve en dix secondes ne se paie pas en jetons. Avant chaque appel, dans cet ordre :

Chaque commande se lit dans « Commandes du projet » de `.claude/pipeline.config.md`, avec ce
qu'elle couvre et ce qu'elle ne voit pas — jamais de mémoire :

1. **`lint`, `typecheck` et la suite** verts — « test-pipeline » compris si le delta la
   concerne —, et la ligne **validation** si le delta touche `.claude/` ou `CLAUDE.md` — un
   `releveur` lancé par la session PR, qui rend le verdict et les lignes en échec ; sur zéro
   test collecté, la sortie brute du lanceur (3.2).
2. La ligne **relecture**, en balayage mécanique du diff. C'est la session de relecture qui
   l'invoque, à chaque réveil — à la différence de `/code-review ultra`, qui demande un geste du
   mainteneur et reste hors pipeline.
3. La ligne **restrictions**, jouée par la session de relecture à chaque réveil, juste après :
   chaque ligne restrictive que le delta retire de la prose normative reçoit sa réponse.
4. La ligne **sécurité**, quand le diff touche une zone sensible ou une surface exposée
   (section « Périmètre » de la config), jouée par la session de relecture. Sinon, le dire en une
   ligne et passer. Un échec d'outillage de la porte — précondition absente, commande qui échoue
   avant toute analyse — se dit dans « Relecture indépendante » du body, jamais en saut
   silencieux.

**Ces deux commandes closent un tour — celui de la session de relecture.** Leur prompt exige
une réponse finale faite de leur seul rapport — `/security-review` : « Your final reply must
contain the markdown report and nothing else » ; `/code-review` : son outil de rapport, seule
sortie. Jouées par la session PR, elles ont arrêté son cycle trois fois, la dernière après qu'une
phrase les avait bornées ; dans la session de relecture, l'arrêt ne coûte rien
(`session-relecture.md`, « Réveil »). En repli seulement, la session PR les joue : la consigne vaut
alors pour la forme du rapport, pas pour l'arrêt du cycle, et elle enchaîne dans le même tour.

→ [references/relecture.md](references/relecture.md), « Ces portes sont additives ».

La session PR **pousse**, puis réveille la session de relecture par le message de
`session-relecture.md` (« Réveil »), qui porte la plage et le SHA. À la première passe, celle-ci
ne lit **que** le corps de l'issue et son brief d'agent (ou le briefing de l'Étape 1), la plage
`<base>..HEAD` et le SHA complet de tête. Aux suivantes, elle a déjà tout cela : elle ne reçoit
que la plage `<sha de fin de la passe précédente>..HEAD` et les constats de la précédente,
corrigés ou écartés. Elle rend chaque critère d'acceptation ✅ / ❌ / ⚠️ avec preuve, la réponse à
chaque ligne de la passe « restrictions du delta », puis ses constats classés bloquant / important
/ mineur, chacun avec fichier, raison et marqueur de provenance.

**Une seule session de relecture pour la PR — toutes ses passes et la relance.** Pas de relecteur
par préoccupation, pas de contre-vérificateur par constat, pas de workflow : chaque agent de plus
repaye le contexte entier et rend ses constats à la même distance du code. Un constat bloquant se
re-mesure par la session PR, dans son arbre, en une commande, avant d'en écrire le brief — jamais par
un agent de plus.

**Chaque passe revient à la session de la première, réveillée par message** — jamais à une
session ni à un agent neufs. Son contexte est intact : elle a déjà lu le brief, les critères et les
blocs précédents, et son worktree est en place. Sur un lot, la passe 2 confiée à un agent neuf a
repayé **un contexte entier** pour un diff que le relecteur de la passe 1 connaissait déjà. Le
coût se compare **par contact** — passe, reprise, relance —, tel que `bilan-session.py` le lit
dans son transcript.

**Une passe par bloc, jamais par commit — et une passe suffit quand la PR tient en un commit de
code.** Sinon, une passe à chaque frontière de bloc (3.5), qui remplace la passe au socle, puis la
passe finale, plus courte, sur ce qui a été écrit après la dernière. Placée seulement à la fin, la
relecture rend
ses constats à la distance maximale du moment où ils auraient pu être absorbés. Un constat d'une
passe de bloc se fond dans le bloc suivant ; un constat qui arrive après le passage en ready coûte
un run de CI complet et le rejeu des vérifications manuelles (Étape 7).

**Un worktree de relecture par PR, jamais l'arbre de la session PR.** → [references/relecture.md](references/relecture.md), « Un worktree de relecture par PR, jamais l'arbre de la session PR ».

**La mutation s'appelle, elle ne se décrit pas.** Le harnais existe et il est versionné :

```
python <répertoire de ce skill>/scripts/mutation.py <racine du dépôt> <mutations.json>
```

→ [references/relecture.md](references/relecture.md), « Le contrat du harnais de mutation et ses pièges ».

**Sévérité — trois définitions, pas trois nuances.** *Bloquant* : un défaut de comportement en
production, une faille, une perte de données possible. *Important* : une régression que la CI ne
verrait pas et qu'un changement plausible du code déclencherait. *Mineur* : tout le reste —
lisibilité, nommage, doc, et « ce test pourrait tenir davantage ». Un constat qui n'entre dans
aucune des deux premières est mineur, quelle que soit sa longueur — « ce test pourrait tenir
davantage » en est le cas le plus fréquent. La session de relecture rend chaque mineur sous
forme d'**édit précis** — fichier, ligne, remplacement — ou l'écarte elle-même avec sa raison.
Hors sévérité, le ***vide relevé*** : un constat qui demande un cas que ni le bloc ni les critères
de l'issue ne portent. Il s'écrit aux Notes et à la passation, part au barreau 2 de « Création
d'issues en cours de cycle » (`contraintes.md`), ne se corrige jamais dans la PR et ne déclenche
jamais la passe de plus (« La boucle »). Seul un défaut de ce que la PR affirme livrer est
bloquant ou important : sans cette frontière, la passe de plus relance la boucle mesurée sur une PR
— gabarit ×4 (1 301 lignes pour ~320 estimées), 6 `developpeur` à `xhigh`, ~5 % du quota
hebdomadaire.

**Traitement — par passe, jamais par constat.** La session PR trie et vérifie le diff rendu ; elle
ne corrige pas. Les bloquants et importants d'une passe partent **ensemble** à un `developpeur`
neuf — jamais un par constat —, avec leur classe, le dénombrement déjà écrit (le cliquet,
ci-dessous) et le test qui doit tenir chaque fermeture : **un commit par passe** (ou par zone, si
deux correctifs n'ont rien en commun), un cycle complet 3.1→3.5 pour le groupe. Les mineurs d'une
passe s'appliquent en **un commit groupé** — un remplacement verbatim au `releveur`, une
reformulation à l'`executant`, en fond pendant que la session PR lit les importants et écrit leur
brief, sans éditer avant leur retour puisque l'arbre est partagé —, ou s'écartent avec leur
raison dans le body (Étape 5). **Les mineurs d'une passe ne rouvrent jamais de relance** : leur
commit groupé n'est pas relu. Aucun registre ailleurs : un mineur écarté qui compte
encore reviendra à la prochaine relecture de la zone ; s'il ne revient pas, il ne comptait pas. Un
constat de la **première** passe s'absorbe de préférence dans le commit à venir qui touche sa
zone.

**Un bloquant ou un important se ferme par un test, jamais par une édition de prose seule.**
Avant la passe suivante ou la relance, chaque constat corrigé nomme le test qui tient sa
fermeture — identifiant de cas — et joue la **mutation inverse du correctif**, la forme fautive
remise, qui doit rendre `ROUGE`. Une fermeture que la mutation inverse laisse `VERT` est une
lecture, et c'est le relecteur qui la paie à la passe suivante — deux fois sur un même lot, un
contact de relecture chacune.

**Le cliquet — dénombrer avant de corriger, pas après.** → [references/relecture.md](references/relecture.md), « Le cliquet — dénombrer avant de corriger, pas après ».

**Quand une garde imite un analyseur, c'est l'analyseur qui la corrige.** → [references/relecture.md](references/relecture.md), « Quand une garde imite un analyseur, c'est l'analyseur qui la corrige ».

**Une lentille navigateur, dès qu'un script client entre dans le delta.** → [references/relecture.md](references/relecture.md), « Une lentille navigateur, dès qu'un script client entre dans le delta ».

**La boucle — une passe de plus tant que la dernière trouve un bloquant ou un important.**
(`taille-pr.md`, point 5.) Les constats
d'une passe de bloc se ferment dans le bloc suivant, que sa passe relit. Après la passe finale, la
passe de plus est la **relance** : une **revue des commits de correction**, ciblée par un diff
explicite (`<sha avant>..<sha après>`) et par la liste de ce que chaque commit prétend régler et du
test qui épingle chacun, avec la question obligatoire : « qu'est-ce que ce correctif a cassé, ou
fait rougir à tort, que la version précédente voyait ? ». Elle revient à la **session de relecture
de la PR**, réveillée par message — son contexte est intact, elle n'a rien à relire —, jamais à un
agent neuf. Un correctif est du code neuf écrit sous pression de conclure — c'est la partie la
moins éprouvée de la PR, pas la plus sûre. Une relance qui trouve encore un bloquant ou un
important en rouvre une, après correction ; un mineur suit la règle ci-dessus, et un vide relevé
ne rouvre rien (« Sévérité »). La boucle s'arrête
sur une passe sans bloquant ni important, et le body le dit. Les constats écartés sont notés avec
leur raison dans le body (Étape 5).

C'est **cette fermeture** — et elle seule — qui autorise le nettoyage de la session de relecture
(Étape 8) ou le retrait du worktree du sous-agent de repli : tant que la boucle peut rouvrir une
relance, ils en sont le destinataire, et les retirer n'est pas un nettoyage, c'est une
terminaison.

**Pousser avant chaque réveil** — chaque passe, relance —, jamais en force :
`/code-review --comment` commente la tête poussée. Une draft n'a aucun run (Étape 2) : chaque
passe relit un SHA sans verdict de CI, et un rouge de plateforme (3.2) se voit au passage en
ready (Étape 5).

## Étape 5 — Finalisation de la PR (passage en ready for review)

La PR **existe déjà** depuis l'Étape 2. Il s'agit ici de remplacer le briefing provisoire par le
body définitif, puis de sortir du draft.

- **Titre** conventional commit (préfixe EN + description FR) — le réajuster si le scope a bougé
  en cours de route.
- **Assignee**, **labels**, **milestone** : vérifier qu'ils sont toujours justes.
- **Conserver la ligne `Closes #<N>`** — la perdre en réécrivant le body casserait à la fois la
  fermeture automatique de l'issue et la détection « en vol ».
- **Vider « Questions en attente »** : toute `[V]` encore ouverte se pose maintenant — par une
  session liée, après « attend le mainteneur : <question> » à son parent
  ([references/sessions-liees.md](references/sessions-liees.md), « Messages ») —, groupée avec
  le point d'arrêt humain s'il reste à prendre ; sa réponse rejoint les Notes, et l'hypothèse
  retenue d'ici là se confirme ou se défait en un commit.
- Remplacer le corps par un **body structuré** :

```markdown
## Summary
<1-3 phrases : l'intention de la PR>

## Changes
<commits regroupés par thème : infra / feature / tests / docs>

## Test plan
- [x] CI locale verte
- [x] CI verte
- [x] <vérifs manuelles si pertinent — chacune porte les deux SHA sur lesquels elle a été prise,
      la tête et la base de branche `git merge-base origin/main HEAD`, et « observe : » les fichiers ou
      dossiers dont son résultat dépend (Étape 7)>
- [x] <exécutable livré : sa sortie réelle (entrée : <nommée>), chaque ligne confrontée au
      critère qui la décrit (3.2) — avec les deux SHA et « observe : », comme ci-dessus>
- [x] <étape non applicable — cochée avec sa raison (« sans objet »), jamais laissée décochée>

## Relecture indépendante
<verdicts des passes de l'Étape 4.2 : constats corrigés (commit) / écartés (raison)>

## Notes
<décisions, follow-ups différés, hors-scope, comportements tiers vérifiés (doc citée)>
```

**Preuves visuelles exigées par un HITL** → [references/finalisation.md](references/finalisation.md), « Preuves visuelles exigées par un HITL ».

**Un jeu de captures est jugé par comparaison, pas capture par capture.** → [references/finalisation.md](references/finalisation.md), « Un jeu de captures est jugé par comparaison, pas capture par capture ».

### Point d'arrêt humain

Sur une zone sensible, il a été pris au commit qui assemble l'écran (3.5). Si l'écran a bougé
depuis, rejouer la vérification sur ce qui a changé (Étape 7, « Rejouer les vérifications
périmées ») **avant `gh pr ready`**.

**Sortir du draft, puis lire le run du SHA de tête.** Une PR en draft n'a aucun run (Étape 2) :
`gh pr ready` déclenche le premier run de la PR (`ready_for_review`), puis chaque push
le sien. Les passes de relecture de 4.2, faites en draft, ont donc relu un SHA sans verdict de
CI : c'est ce run qui le rend. **Jamais un push suivi aussitôt de `gh pr ready`** : la
`concurrency` du `ci.yml` annule le run en cours d'une PR au run suivant, et un run `synchronize`
créé après celui du passage en ready l'annulerait — tous ses jobs sautés, son événement étant un
push en draft. Avant de sortir du draft, attendre que le run sauté du dernier push apparaisse sur
le SHA de tête (`gh run list --commit <sha> --workflow CI`) — supposé, non mesuré. Sortir du
draft :

```
gh pr ready <numéro>
```

Tant que la PR est en draft, elle n'est **pas** à reviewer : c'est ce marqueur qui distingue
« travail en cours » de « prêt à être relu ».

Puis lire ce run : la session PR **l'attend** avant de passer à la suite, par une commande lancée
en fond, dont la fin réveille la session, bornée : 1800 s par défaut, `--delai <secondes>` pour
une autre borne.

```
python <répertoire de ce skill>/scripts/attente-ci.py <numéro>
```

Le script relit à chaque tour la tête de la PR, son état draft et les runs `CI` de son SHA, dont
le plus récent par `created_at` décide : une réouverture ajoute un run sur la même tête, et les
plus anciens ne comptent plus. Sitôt `gh pr ready`, le plus récent est encore le run `skipped`
d'un push en draft : le script le relit comme « aucun run » jusqu'à ce que celui du passage en
ready apparaisse. Il attend un run qui tourne, suit la nouvelle tête quand un push annule le run,
et rend une ligne — le verdict, le run, le SHA court et le paragraphe à suivre. Ses sorties :

- sortie 0, vert (`success`) → Étape 6 ;
- sortie 1, rouge — toute autre conclusion (`failure`, `timed_out`, `startup_failure`…), ses jobs
  en échec nommés → `erreurs-ci.py <id>`, puis Étape 6, « Trier un rouge ». Une ligne ouverte par
  « refus — » sort aussi en 1 : une lecture `gh` en échec ou d'une autre forme, son motif en une
  ligne, et aucun verdict ;
- sortie 3, draft — la PR est encore en draft, aucun run lu → `gh pr ready <numéro>` d'abord,
  puis relancer le script ;
- sortie 3 → « Si aucun run n'apparaît », ci-dessous : `skipped` resté le plus récent au délai,
  la draft jamais repoussée — le run sauté d'un push en draft, que le garde d'un job saute
  (mesuré le 2026-10-20 sur l'amorce d'une PR), sans run du passage en ready ; `cancelled`
  sans nouvelle tête, annulé sans remplaçant ; aucun run au délai, un événement émis pendant une
  panne d'Actions ;
- sortie 124, délai dépassé : Étape 6, « CI qui ne démarre pas ».

Jamais une fin de tour nue : le moniteur de PR de l'application ne réveille que sur un échec, un
conflit ou un commentaire (description de `set_monitor`, lue le 2026-10-20), jamais sur un succès
— mesuré le même jour : run vert à 19:21:01Z, aucun réveil en 14 min. C'est la seule
surveillance de la CI que la session lance elle-même, le moniteur ne couvrant pas le succès ;
jamais une sonde planifiée. Le script ne couvre ni les autres workflows et événements, ni ce que le
run a combiné (paragraphe suivant), ni la page d'état et la réouverture, qui restent à la session
(« Si aucun run n'apparaît »).

Chaque job de ce run fusionne la tête au trunk tel qu'il est à son propre démarrage, et les jobs
démarrent à des moments différents : le trunk peut avancer pendant le run comme après.
Ce que le run a combiné se lit dans la ligne de fusion de ses jobs, à l'Étape 7.

**Si aucun run n'apparaît** pour le SHA de tête — sortie 3 : sauté, annulé sans remplaçant ou
aucun run —, consulter d'abord `https://www.githubstatus.com/api/v2/components.json` : un
événement émis pendant une panne d'Actions, le passage en ready compris, n'est **pas rejoué** au
rétablissement. Le re-déclenchement propre est `gh pr close` puis `gh pr reopen` (`reopened` est
dans les types du workflow), une relance de CI de la PR, couverte d'avance et bornée comme à
l'Étape 7 (« Rejouer les vérifications périmées ») — jamais de commit vide ni de force-push. Puis
relancer le script, comme ci-dessus : le run de la réouverture est le plus récent. Ce run attendu,
lire ce qu'il a combiné comme à l'Étape 7 : `git fetch origin`, seul, puis la ligne de fusion de
ses jobs,
`python <répertoire de ce skill>/scripts/porte-merge.py trunk <run> <trunk> <SHA de tête vérifié>`.

## Étape 6 — Review + CI

- **CI verte** : tous les gates déclarés dans `.claude/pipeline.config.md` (« gates bloquants en
  CI »), dont le seuil de couverture s'il y en a un.
- **Jamais de push sur une tête rouge sans tri.** Après le passage en ready, chaque push lance un
  run : pousser sur une tête rouge repaie un verdict déjà connu. Le réveil du moniteur
  de PR sur un échec est l'événement — en plein cycle de commit comme pendant l'attente de
  l'Étape 5 — : le tri ci-dessous précède le prochain push. Même règle pour la PR d'un lot d'une
  issue découpée, et, sous une coordinatrice, pour sa PR d'intégration, qui reste en draft
  jusqu'au dernier lot et ne tourne donc pas à chaque merge de lot
  ([references/coordinatrice.md](references/coordinatrice.md), « Au go du découpage »).
- **Trier un rouge avant de toucher au code** — chaque famille de causes a son remède, et le
  premier message d'erreur du step les sépare presque toujours. La session PR lance elle-même
  `python <répertoire de ce skill>/scripts/erreurs-ci.py <id>`, une commande à la sortie courte :
  une ligne par step en échec — job, step et première ligne d'erreur du journal, suivie du segment
  `Run …` d'où elle vient quand `gh` n'a rendu que le journal entier du job (`UNKNOWN STEP`) —, ou
  le job en échec sans step, ou le run en échec sans job ; une section du journal qu'aucun step
  en échec ne nomme se rend sous son nom, et un step en échec sans section à lui le dit (« journal
  indisponible »). Le script ne classe rien et ne lit pas
  les annotations des jobs ; une erreur sans marqueur d'outil retombe sur la première ligne qui
  nomme une erreur, sinon sur l'annotation de fin du step (`##[error]Process completed…`), qui ne
  dit rien : ce step-là se relit au journal.
  Le tri est une décision, à la session PR ; un correctif, à un `developpeur` :
  - *Rouge d'infrastructure* : échec de téléchargement (403/5xx/timeout d'un dépôt d'artefacts,
    « error while downloading ») alors que le diff ne touche aucune dépendance et qu'un run
    voisin passe le même step → `gh run rerun <id> --failed`, ou le run entier si le trunk a
    avancé depuis le run : une relance partielle laisse aux jobs verts leur ancien trunk, et la
    porte de l'Étape 7 sortirait en 1 (« Sortie 1 ») ; noter la cause et le rerun dans le
    Test plan. Corriger du code sur un rouge d'infra coûte un cycle complet pour rien.
  - *CI qui ne démarre pas* : `startup_failure` **immédiat et reproductible au re-run** → le
    fichier de workflow est en cause ; job resté `queued` sans runner, ou `startup_failure` dont
    le job n'a aucun step → allocation de runner (quota, incident fournisseur) — ne pas modifier
    le workflow, surveiller en fond et **rendre la main au mainteneur**. Les runs `skipped`
    (garde `if:`) se terminent sans runner et ne prouvent rien sur la disponibilité de la CI.
  - *Rouge d'avis* : le step d'audit ou de scan rougit — au run planifié du trunk, ou au job des
    portes d'avis d'une PR sur un paquet que son diff ne touche pas (`.claude/pipeline.config.md`,
    « Qualité ») → une base d'avis a changé sans commit. C'est une **procédure du trunk**, pas de
    la PR : l'avis porte sur l'état du monde, et se corrige sur le trunk par
    la voie courte (« Voie courte — correctif évident ») — une montée de version ou une exception
    datée —, jamais par d'autres pushes sur la PR, qui repaieraient le même verdict. Pour un rouge
    de PR, vérifier d'abord que le trunk rougit aussi — son dernier run
    planifié ou un `workflow_dispatch` s'il en a, sinon la porte elle-même, sa commande du projet
    lancée sur `origin/<trunk>` dans un worktree jetable — et pour un scan d'images, précédée de
    leur construction depuis ce worktree sous un nom propre au trunk : le démon de conteneurs est
    partagé, et un scan sous le nom par défaut lirait les images de la branche, celles mêmes qu'il
    s'agit de mettre hors de cause. Jamais un rerun d'un run du trunk :
    `--job` comme le run entier relancent les jobs qui en dépendent (REST : « Re-run a job and
    its dependent jobs »), publication et déploiement compris. Puis appliquer « Création
    d'issues en cours de cycle » (`.claude/rules/contraintes.md`), barreau par barreau ; la PR
    attend le correctif sur le trunk, puis, celui-ci mergé, suit le cas suivant. **Trunk déjà
    vert sur cette porte** — correctif mergé depuis la base de branche : rien à corriger dans la
    PR, qui ne fait tourner le job concerné que parce que son delta touche une de ses entrées, le
    reste du tri étant celui du trunk. Sa CI se relance par le geste de
    l'Étape 7, que tranche la ligne de définition de `porte-merge.py trunk`, lancé sur ce run après
    `git fetch origin` — `gh run rerun <run>`, run entier, qui refait la fusion sur le trunk
    corrigé, ou la fermeture-réouverture quand elle dit la définition périmée —, et ce que le
    nouveau run a combiné se lit dans la ligne de fusion de ses jobs. Ni commit de fusion —
    `gh pr update-branch` sans `--rebase` compris, en `ask` dans `.claude/settings.json` comme sa
    forme `--rebase` —, ni rebase d'une branche poussée sans demande explicite (`contraintes.md`),
    ici comme à l'Étape 7 : sur une PR, faute d'un geste à cette étape, deux sessions de suite ont
    planifié de fusionner `main` dans la branche.
  - *Rouge de code* : tout le reste, y compris un rouge de plateforme (3.2) → cycle complet
    3.1→3.5.
- **Revue** : les commentaires d'une revue automatisée (bot), s'il y en a une. Un `developpeur` a
  relu la PR entière en 4.1, un tiers en 4.2 : pas de troisième lecture ici.
- Chaque commentaire **pertinent** → cycle complet (3.1→3.5) + push + re-trigger de la review.
  Chaque commentaire **non pertinent** → noter brièvement pourquoi, ne pas corriger.
- **Boucler jusqu'à review vide.**

> **Commentaire de répercussion.** Un merge survenu ailleurs pendant que cette PR était ouverte a
> pu rendre sa spec fausse ; `repercussions` le signale ici même, par un commentaire sur la PR (le
> corps de l'issue n'est volontairement pas modifié tant que la PR est ouverte). L'instrument qui
> publie un tel commentaire puis le relit en entier est
> `python <répertoire de ce skill>/scripts/ecriture-relue.py comment <n> --body-file <fichier>`
> (Étape 8) ; `repercussions` le prescrit à son étape 5, « Issues en vol ». Un signalement
> **bloquant** se traite comme tel : intégrer la correction dans cette PR, ou remonter au
> mainteneur si cela déplace le périmètre — ne jamais merger par-dessus. Le prédicat de
> conversation de la porte de merge le garantit (Étape 7, « Le go, puis le merge ») :
> `porte-merge.py conversation <n>` sort en 1 sur tout commentaire ou revue postérieurs au relevé
> du verdict, « à ajuster » compris ; antérieur, il a été lu avec le relevé (« Vérification
> d'avant-go »).

## Étape 7 — Avant le merge

Quand la review est vide et la CI verte, **avant de demander le go** — sans nouvelle relecture du
code : le regard global a eu lieu en 4.1, la relecture indépendante en 4.2.

**Relire l'issue une dernière fois.** Le corps a pu bouger depuis le briefing de l'Étape 1 — d'autres
PR ont été mergées entre-temps, et une passe `repercussions` a pu la corriger ou déposer un
signalement sur cette PR. Comparer le corps actuel au briefing : si la spec a changé sur un point
que la PR ne couvre pas, **s'arrêter et le remonter** plutôt que de merger un travail construit sur
une spec périmée.

**Rejouer les vérifications périmées.** Une preuve a deux ancrages : la **tête** de branche et la
**base de branche** (`git fetch origin`, puis `git merge-base origin/<trunk> HEAD` — le point de
fork) — et elle se périme quand **ce qu'elle observe** a changé, pas quand un identifiant a
changé. « Base » désigne ici **cette** grandeur, et elle seule ; la grandeur voisine qui lui
ressemble tant que le trunk n'a pas avancé — le **trunk éprouvé**, ce que la CI a réellement
combiné — porte son propre nom, au paragraphe de la ligne de fusion ci-dessous, parce qu'un
paramètre de porte dont le nom désigne deux valeurs se remplit un jour avec la mauvaise. Une vérification sans SHA, ou
sans « observe : », se rejoue d'office. Quand la **tête** a bougé : `git diff --stat <sha de la
vérification>..HEAD`, croisé avec ce que la vérification déclare observer (« observe : » du Test
plan), puis `git diff <sha de la vérification>..HEAD -- <fichiers observés>` pour juger le
contenu — elle se rejoue si le diff touche du code dont elle dépend ; elle reste cochée, ses deux
SHA d'origine conservés et le nouveau noté à côté, si le diff ne touche que des commentaires, de
la documentation ou des fichiers qu'elle n'atteint pas. Une preuve qu'on rejoue sans qu'elle
puisse changer de résultat n'est pas une preuve, c'est un rituel, et un rituel coûteux est le
plus sûr moyen de faire abandonner l'étape.

Quand c'est le **trunk** qui a bougé, les preuves locales sont périmées : prises sur un état qui
n'atteindra jamais le trunk, et rien de local ne le signale. La CI d'une PR, elle, éprouve l'état
combiné : chaque job fusionne la tête au trunk tel qu'il est à son démarrage, et l'écrit dans une
**ligne de fusion** de son journal. La référence de fusion de la forge n'y entre plus :
GitHub ne la recalcule ni à chaque merge sur le trunk ni au passage en ready, et un
`gh run rerun` réutilisait le commit du déclenchement. Si le trunk a bougé **avant** le dernier run, ce run peut donc éprouver l'état
combiné — **à condition de lire sa ligne de fusion**. `git fetch origin` d'abord, **seul**, puis,
pour le dernier run `CI` de la tête — celui qu'`attente-ci.py` a rendu :

```
python <répertoire de ce skill>/scripts/porte-merge.py trunk <run> <trunk> <SHA de tête vérifié>
```

Le `<SHA de tête vérifié>` est celui que la porte de merge passera à `--match-head-commit` : le
même SHA aux deux commandes, si bien que le run lu est celui de la tête qui sera mergée, et le
script refuse un run d'une autre tête. Le script lit, sur chaque job qui a tourné, sa ligne de
fusion (« Fusion explicite : <commit> Merge <tête> into <trunk> (workflow <sha>) »,
`gh run view <run> --log`) : le `<trunk>`, **premier parent** du commit construit, est le **trunk
éprouvé** — ce que le run a réellement combiné à la tête —, et c'est **lui** que la porte de merge
consomme, sous le nom `<SHA du trunk éprouvé>`, inscrit au Test plan avec le numéro du run. Le
`<sha>` du workflow est le commit dont le run a lu sa définition, la référence de fusion du
déclenchement : le script vérifie aussi que le trunk n'a pas changé `.github/workflows/` depuis.
Le `<SHA du trunk éprouvé>` ne vaut qu'à la sortie **0**, chaque job ayant combiné
`origin/<trunk>` sous une définition à jour ; **1**, trunk ou définition périmés ; **2**, refus,
son motif en une ligne (docstring du script). `porte-merge.py trunk` suppose la PR sortie de
draft : sur une draft, le dernier run de la tête a tous ses jobs sautés, et le script refuse en 2
(mesuré sur une PR). La référence de fusion de la forge
(`gh api …/git/ref/pull/<n>/merge`) ne dit pas ce qu'un run a combiné : du `GITHUB_SHA` du run,
la référence calculée au déclenchement, le script ne lit que le premier parent, le trunk d'alors,
pour juger la définition.

**Sortie 1** : la ligne de définition du script tranche le geste, une relance de CI de la PR dans les
deux cas, couverte par le go du briefing (Étape 1) — jamais un commit vide ni un force-push.
**Définition périmée**, trunk à jour ou non : le trunk a changé `.github/workflows/` depuis le
déclenchement, et un rerun, qui garde le `GITHUB_SHA` du déclenchement, rejouerait l'ancienne
définition (doc GitHub « Re-running workflows and jobs » et « Workflows », lues le 2026-11-08) :
relancer par `gh pr close` puis `gh pr reopen`, le geste de l'Étape 5, dont le run neuf refait
aussi la fusion. Un run d'un workflow d'avant la fusion explicite, que le script refuse faute de
ligne, se relance de même. **Trunk périmé, définition à jour** :
relancer par un commit réel, ou par `gh run rerun <run>` — le run **entier**, qui refait la fusion
sur le trunk du moment, jamais `--failed`, dont les jobs verts garderaient leur ancien
trunk. Puis attendre le run neuf ou la nouvelle tentative (`attente-ci.py`, Étape 5 : un run
relancé garde son `created_at`), et lire **sa** ligne de fusion : `gh run view --log` rend la
dernière tentative d'un run relancé (sur une tentative 2 : mêmes octets qu'avec
`--attempt 2`, relevé le 2026-11-08, gh 2.94.0). **Après 3 relances de suite dont
la porte sort en 1, la session redemande l'accord** du mainteneur avant la suivante. Puis vérifier
l'absence de conflit par
`git merge-tree --write-tree origin/<trunk> HEAD`, qui est un **prédicat** : il sort en 0 sans
conflit et en 1 avec (mesuré le 2026-10-13, témoin de chaque côté), donc il s'enchaîne par `&&`,
et ce qu'il imprime n'est qu'un détail de diagnostic. L'état `MERGEABLE` de la forge, lui, se met
à jour en différé et ne prouve rien. Puis redater les preuves locales sur cette base. Si elle a bougé
**après**, relancer la CI de même, puis relire la ligne de fusion du nouveau run. Sur un
trunk fusionné par rebase ou squash, jamais de commit de fusion : il ne respecte pas le format
des messages et tombe au merge.

**Un critère qui nomme une commande se solde par cette commande, verbatim.** « `just run` démarre
l'app » ne se satisfait pas par `flutter build` + `adb install` : une équivalence est un résultat
*non vérifié*, pas un résultat — défendable par lot, et c'est ainsi qu'un critère transverse se
perd, chaque lot substituant en croyant qu'un autre a joué la recette.

### Vérif de fumée — regarder le logiciel tourner

Tout ce qui précède examine du **code** : tests, diffs, specs. Personne n'a encore vu la
fonctionnalité fonctionner. Pour tout ce qui est visible par un utilisateur, c'est un angle mort
qu'aucun test unitaire ne couvre.

**Condition de déclenchement** : la PR touche une surface visible du projet (une des surfaces
déclarées dans `.claude/pipeline.config.md` — interface, API publique, sortie de commande, format
de fichier produit). Une PR de refacto interne, de doc ou d'outillage **saute cette étape** — le
dire en une ligne et passer.

Si elle se déclenche, proposer **3 à 5 vérifications, pas plus**, dérivées des critères
d'acceptation de l'issue et exécutables sur l'application qui tourne (commande `run local` de la
config) :

- Chaque vérification nomme l'**action exacte** et le **résultat attendu**, et porte son **type**,
  écrit par la session PR : « commande + attendu », jouée par un `releveur`, qui rend le code de
  sortie et la sortie brute ; « observation humaine » (rendu, état affiché, console), jouée par le
  mainteneur au go de merge, dans la fenêtre de la session PR — aucun rôle de
  sous-agent n'a `playwright`.
- Ne vérifier que ce qu'un **test automatisé ne peut pas voir** : rendu réel, état d'erreur affiché,
  console propre, comportement d'un job jusqu'à son état terminal, fichier réellement produit.
  Si la CI le couvre déjà, ce n'est pas une vérif de fumée — c'est du doublon.
- **Aucune issue n'est créée**, aucune checklist n'est publiée. C'est une passe de deux minutes,
  pas une campagne : la campagne, c'est `plan-qa`, au niveau du thème.

Un écart constaté → le traiter comme un finding de l'Étape 7 (corriger, re-tester, push). S'il
sort du périmètre de la PR, appliquer « Création d'issues en cours de cycle »
(`.claude/rules/contraintes.md`) — PR courante, puis propriétaire ouvert (une automatisation qu'on
a fait taire se répare, elle ne se doublonne pas), puis petite PR pour un correctif évident, puis
brouillon soumis au mainteneur. Jamais un `gh issue create` de la session.

### Vérification d'avant-go — le `verificateur`

**La session PR lance son `verificateur`** (`.claude/agents/verificateur.md`), sous-agent éphémère,
un par (PR, go), qui ne rend qu'un verdict, **si la PR ferme une issue
(`Closes`), porte des décisions verrouillées dans ses Notes, ou si `gh pr list` montre une autre
branche en vol touchant ses fichiers ; sinon la porte de merge suffit**, sur le relevé de conversation que la session inscrit elle-même (ci-dessous) — en vague comme hors vague, le lead ne le lance plus (`pr-paralleles`
Étape 6). Il reçoit le numéro de la PR, celui de l'issue, le chemin absolu du worktree et la liste des autres branches en vol (`gh pr list`), jamais le récit
de la session. Hors vague et hors lot coordonné, l'accord du mainteneur se demande **avec les
`[V]` du go du briefing** (Étape 1) — demandé à la fin, il attend la prochaine présence : 6 h 37
d'absence sur un lot pour cette seule question, à un moment où il ne restait rien
d'indépendant à faire. En vague, l'accord est celui du lot validé (`pr-paralleles` Étape 2) ; une
session de lot coordonné : son accord est à [references/coordinatrice.md](references/coordinatrice.md),
« La session de lot ».

**Le verdict s'inscrit dans les Notes du body avant le go**, relu après écriture
(`contraintes.md`, « Écritures sur un artefact distant ») — au moins sa ligne d'en-tête (base,
tête) et ses lignes « Fichiers croisés » et « Non vérifié », qui parlent d'**autres** branches et
d'autres lots, et sa ligne `Conversation : …`, copiée en début de ligne — jamais dans une puce
`- `, jamais entre backticks : la porte de merge compare la dernière ligne de cette forme du body,
et refuse sans elle. Rendu seulement à
la session qui l'a commandé, il ne survit que par sa mémoire, et la passation suivante le relaie
comme un énoncé sans source : deux lots de suite, le prompt du lot suivant a cité un verdict que ni
le corps ni les commentaires de la PR ne portaient.

**Une PR sans `verificateur`** — hors des trois conditions ci-dessus — porte le même relevé, que la
session inscrit aux Notes avant de demander le go, de la même façon : la ligne que rend
`python <répertoire de ce skill>/scripts/porte-merge.py conversation <n> --releve`, copiée telle
quelle, puis la lecture de ce qu'il compte, `gh pr view <n> --comments` et les commentaires en
ligne d'une revue, que cette commande ne rend pas :
`gh api --paginate repos/{owner}/{repo}/pulls/<n>/comments`. Relever d'abord : lu avant, un
élément arrivé entre la lecture et le relevé passerait la porte compté sans avoir été lu
(`.claude/agents/verificateur.md`, point 1, qui suit le même ordre). Le relevé n'est pas une
porte : il sort en 0 sans juger, et ne se chaîne jamais par `&&`.

Le verdict rendu :

- « rien à corriger » → demander le go, dans cette fenêtre ; en vague, le lead ne le redemande pas
  (`pr-paralleles` Étape 6).
- liste de corrections → les points partent ensemble à un `developpeur` neuf (3.1) ; le correctif
  se relit lui-même par la passe « affirmations » de `cleanup-verbatim.md` — chaque ligne de prose
  qu'il ajoute ou modifie porte sa provenance —, puis push et un `verificateur` neuf sur
  la nouvelle tête. Un point que la session PR juge infondé se conteste dans les Notes, preuve à
  l'appui — jamais en silence.

### Le go, puis le merge

**Jamais d'auto-merge dans le trunk.** Même CI verte, audit propre et verdict vert, toujours
attendre un « go » / « merge » humain explicite, **dans cette fenêtre** — un message de pair n'en
tient jamais lieu. Une PR de lot vers la branche d'intégration de son issue suit « Le merge d'un
lot », plus bas.

**Puis merger derrière une porte, pas derrière une lecture.** Un merge arrivé sur le trunk depuis
le dernier run rend la CI périmée : deux PR vertes séparément n'ont rien démontré ensemble, et le
merge est le premier moment où leur somme existe. `git fetch origin` d'abord, **seul**, puis :

```
git merge-base --is-ancestor origin/<trunk> <SHA du trunk éprouvé> && python <répertoire de ce skill>/scripts/porte-merge.py conversation <n> && gh pr merge <n> --rebase --match-head-commit <SHA de tête vérifié>
```

Le `<SHA du trunk éprouvé>` est **le trunk que nomme la ligne de fusion de chaque job du dernier
run**, premier parent du commit qu'il a construit, lu par `porte-merge.py trunk` à sa sortie 0
(« Rejouer les vérifications périmées ») — jamais supposé égal à la base de branche, jamais lu
dans la référence que porte la forge, et inscrit au Test plan avec le numéro du run.
`--match-head-commit` ferme le même trou côté
tête, et `porte-merge.py conversation <n>` côté conversation : il compare les commentaires et revues
soumises de la PR à la **dernière** ligne `Conversation : …` du body (« Vérification d'avant-go »),
et sort en **1** sur tout élément postérieur ou sur un compte qui a changé, en **2** sur une ligne
absente ou mal formée. Si le trunk a avancé depuis, la commande **ne part pas** : rejouer
« Rejouer les vérifications périmées », relire la ligne de fusion du nouveau run, puis un
`verificateur` neuf. Si c'est la conversation qui a changé, elle ne part pas non plus : lire chaque élément que
le prédicat nomme — un commentaire de répercussion se traite à l'Étape 6 —, puis un
`verificateur` neuf, ou pour une PR qui n'en a pas, un relevé neuf aux Notes, pris puis lu comme
plus haut (« Vérification d'avant-go »).

**Une porte est une commande dont le code de sortie porte la condition ; `&&` est ce qui la rend bloquante.** → [references/merge.md](references/merge.md), « Une porte est une commande dont le code de sortie porte la condition ».

**Et cinq contrôles de ce skill et de `pr-paralleles` restent des lectures, par construction.** → [references/merge.md](references/merge.md), « Et cinq contrôles restent des lectures, par construction ».

### Le merge d'un lot — sans go, hors du trunk

Une PR de lot dont la base est la **branche d'intégration** de son issue, et non le trunk, se merge
**sans go humain** une fois verte : CI verte sur sa tête, boucle de relecture fermée et PR sortie
du draft (Étapes 4 et 5), verdict d'avant-go « rien à corriger ». Ce verdict s'inscrit dans les
Notes du body comme tout verdict (« Vérification d'avant-go »), plus une ligne de forme figée, que
le script lit :

```
Verdict d'avant-go (<SHA complet de tête>) : rien à corriger
```

Puis une seule commande, qui récupère elle-même la base :

```
python .claude/skills/cycle-pr/scripts/merge-lot.py <n> <SHA de tête vérifié> <branche d'intégration>
```

C'est la **seule** voie de merge que `.claude/settings.json` autorise sans invite ; `gh pr merge`
reste en `ask`, épinglé par `.claude/tests/test_agent_permissions.py`. Le script porte lui-même
les portes de « Le go, puis le merge » — trunk refusé, base qui doit être la tête d'une PR
d'intégration ouverte, tête comparée au SHA vérifié — et une plus stricte : la tête du lot doit
**contenir** la tête actuelle de sa base, par un historique sans commit de merge. La CI de la tête
a alors éprouvé l'arbre exact que le `--rebase` rejouera, sans lire la référence de fusion, que la
forge recalcule à son rythme. Puis `--rebase --match-head-commit`. Il refuse aussi une
conversation changée depuis la ligne `Conversation : …` du verdict, ou sans relevé lisible, qu'il
lit par `porte-merge.py conversation <n>` en dernier avant `gh pr merge`, refus qui se traite comme
celui de la porte (« Le go, puis le merge »). Ses refus, et ce qu'il
ne prouve pas, sont dans sa docstring ; son contrat, dans `.claude/tests/test_merge_lot.py`. Un
refus sort en une ligne et se traite comme une porte qui ne part pas : rejouer « Rejouer les
vérifications périmées », jamais le contourner par `gh pr merge` — sauf un refus de contenance ou
de commit de merge, que ces vérifications ne lèvent pas et qui suit la phrase suivante. **Un lot en
retard sur sa base** — ce que des lots ouverts l'un après l'autre ne devraient pas rencontrer (non
mesuré) — ne se remet pas à jour par `gh pr update-branch` : son commit de merge, que le script
refuse, serait abandonné par le `--rebase` (relevé en relecture, non mesuré). C'est un rebase
de branche ouverte, qui attend la demande explicite du mainteneur (`contraintes.md`). Un refus « CI
pas entièrement verte » alors que le dernier run est vert vient d'un run plus ancien sur la même
tête, que le script lit aussi (le rollup d'une tête porte un run par événement — cinq par job
relevés sur une PR) : un commit réel en ouvre un neuf, sur sa propre tête ; qu'un rerun du run
rouge lui-même suffise n'est pas mesuré.

## Étape 8 — Après le merge : clôture propre, puis répercussions

**Les écritures de la clôture passent par la famille « écriture distante relue »** — un script à
sous-commandes, Python ≥ 3.11 sans dépendance, lancé depuis le dépôt :

```
python <répertoire de ce skill>/scripts/ecriture-relue.py <sous-commande> …
```

→ [references/cloture.md](references/cloture.md), « Le contrat d'ecriture-relue.py ».

Le merge **clôt l'issue liée** (via `Closes #N`). **Retirer aussitôt son label d'état** —
`ready-for-agent` ou `ready-for-human`, selon le mapping de `.claude/pipeline.config.md` :
`ecriture-relue.py label <N> --remove <label>`. Une issue fermée ne porte **aucun** rôle d'état ;
le laisser fait apparaître des issues closes dans les files de `triage` et de `pr-paralleles`.
Le label de catégorie (`bug` / `enhancement`) et le thème restent.

Puis **cocher les critères d'acceptation soldés**, dans le **corps** de l'issue *et* dans le
commentaire de **brief** (`- [ ]` → `- [x]`) : ils ont été vérifiés à l'Étape 7 — le
`verificateur` d'une PR qui ferme une issue juge l'union des cases du corps et du brief
(`.claude/agents/verificateur.md`, point 1) —, il ne reste qu'à
l'enregistrer là où un lecteur le cherche. Le corps par
`ecriture-relue.py checkbox patch <N> --case <ancre> …`, puis le brief par
`ecriture-relue.py brief patch <N> --case <ancre> …`, une ancre par critère : un extrait de son
texte, sans le marqueur `- [ ]`, qu'aucune autre case ne porte. Une ancre introuvable ou ambiguë
refuse l'appel entier sans rien écrire ; une case déjà cochée se dit.
Un critère atteint sous une forme **amendée** se coche
quand même — l'amendement est tracé au journal de spec du corps. Le brief d'une issue **close** est
un artefact daté : on coche ses cases, on ne réécrit pas son texte. (Tant que l'issue était
ouverte, c'était l'inverse : une réconciliation `repercussions` qui falsifiait une de ses lignes
l'amendait — la clôture est ce qui fige le brief.)

Puis **nettoyer la session de relecture** — archivage sur l'accord donné au go, worktree,
échafaudage —, la boucle de 4.2 étant fermée
([references/session-relecture.md](references/session-relecture.md), « Nettoyage »).

**Cas découpé : reposer le lien des lots précédents.** GitHub ne lie une PR à une issue que par un
mot-clé de fermeture, et seul le lot final en portait un (Étape 2) ; sans ce geste, l'issue
n'affiche qu'une PR sur les k qu'elle a coûté. Une fois l'issue close, ajouter en fin de body de
**chaque lot précédent** mergé dans le trunk le bloc ci-dessous, écrit dans un fichier :
`ecriture-relue.py issue edit <n> --append <fichier>`, qui le sépare du body par une ligne vide —
le body d'une PR s'écrit par l'endpoint des issues. Sur une issue close, le mot-clé ne change aucun
état ; une PR de lot vers une branche d'intégration n'en reçoit pas, il y serait ignoré :

```markdown
*Rattachement a posteriori (<date>) : lot k/n de #<N>. L'issue a bien été fermée par le lot
final, la PR #<M> ; le mot-clé ci-dessous ne sert qu'à faire apparaître cette PR parmi les PR
liées de l'issue.*

Closes #<N>
```

Puis vérifier que l'issue affiche autant de PR liées que de lots vers le trunk — avec une
coordinatrice, plus la seule PR d'intégration : une PR de lot vise une autre branche, où GitHub
ignore le mot-clé ([references/coordinatrice.md](references/coordinatrice.md), « Après le
dernier lot ») :

```
gh api graphql -f query='{ repository(owner:"<owner>",name:"<repo>"){ issue(number:<N>){
  closedByPullRequestsReferences(first:20, includeClosedPrs:true){ nodes{ number } } } } }'
```

**Un critère soldé par un autre lot se coche avec la trace de qui l'a joué** — le lot et le SHA.
Un critère transverse à plusieurs lots n'appartient à aucun ; sans cette trace, chaque lot croit
qu'un autre l'a fait et l'issue se ferme sur une case que personne n'a jouée.

**Relire le plan de test de la PR** et cocher toute case devenue vraie depuis son écriture —
« CI verte » d'abord, vérifiée par le rollup (`gh pr checks`), pas de mémoire ; puis les gates
délégués à la CI. Une case qui reste décochée après le merge l'est **par décision** et le dit sur
sa ligne, jamais par oubli : un compteur d'inachèvement allumé sur du travail fini s'éteint dans
les têtes avant de s'éteindre à l'écran.

Si la PR a porté des **preuves visuelles**, supprimer enfin la branche orpheline promise à
l'Étape 5 : `git push origin --delete captures/pr-<n>`.

**Bilan chiffré du cycle.** Mesurer la session sur **tous** ses transcripts — Python 3, sans
dépendance :

```
python <répertoire de ce skill>/scripts/bilan-session.py <transcript .jsonl> [<relais .jsonl> …] [--relecture <transcript de la session de relecture .jsonl>] …
```

→ [references/cloture.md](references/cloture.md), « Les transcripts du bilan et ce que le script rend ».

Écrire ces lignes, plus quatre à la main — commits prévus contre commits de correction, constats
par passe, correctifs qui ont cassé quelque chose, et **échappements** : chaque défaut trouvé
pendant ce cycle dans du code déjà mergé par une **autre** PR, avec le numéro de cette PR d'origine
et sa taille en lignes (`taille-pr.md`, point 8 ; un défaut ne se voit qu'après le merge de la PR
qui l'a introduit, son propre bilan ne peut pas le compter) — dans
`retrospectives/<date>-<issue>.md`, dossier voisin du journal d'observations (chemin dans `CLAUDE.md`), hors du dépôt. C'est la seule
mesure qui dise si un changement de la pipeline a marché : l'attente et le coût des relectures ne
se voient dans aucun compte rendu.

**La ligne de comparaison au cycle précédent porte l'attente hors absences** → [references/cloture.md](references/cloture.md), « La ligne de comparaison au cycle précédent porte l'attente hors absences ».

La PR et la conversation qui l'a résolue ont pu acter des décisions, déplacer un contrat d'interface, déjà faire une partie d'un autre lot, ou rendre une
hypothèse caduque ailleurs. **La passe est due si la PR porte `Closes #N`, ou `En vol pour #N` vers
`main` — un lot léger intermédiaire —, touche un fichier de la section « Sources de vérité », ou a
rangé un résidu au barreau 2 en cours de cycle** : un lot léger intermédiaire peut déplacer un
contrat dont dépend une autre issue ouverte, et son issue, en vol, ne s'édite pas
(`repercussions`, étape 5, « Issues en vol → signaler sur la PR, ne rien éditer ») ; sinon —
demande directe sans issue —, un `grep` des ancres du diff sur `docs/` et sur les issues ouvertes
(`gh issue list --search <ancre>`) par la session, et une ligne dans le body. Quand elle est due,
**immédiatement après le merge**, la session PR lance le skill `repercussions` — elle tient le
brief, les Notes et les constats de la PR, c'est le moment où l'analyse est la plus riche. La
collecte (delta, issues du thème, briefs pré-filtrés par ancre) part à un `releveur` ; le go
d'édition se demande au mainteneur dans la fenêtre de la session PR.

Il confronte le **delta réel** de la PR aux issues du **même thème** et à celles qui **mentionnent
une ancre** du delta (symbole, format, module, décision), puis **corrige le corps** de celles dont
la planification est devenue fausse — après un « go » explicite, et sans publier le moindre
commentaire. C'est le pendant *sortant* de l'auto-challenge *entrant* de l'Étape 1.

Si une issue déjà `ready-for-agent` voit son **périmètre** ou une **décision verrouillée** modifié
par cette passe, elle repasse en `needs-interrogation` : son interrogatoire portait sur une spec
qui n'existe plus.

Quand elle est due, ne pas considérer la PR « terminée » tant que cette passe n'a pas été faite
(même si la conclusion
est « aucune répercussion »).

**Cas découpé : la frontière de lot se franchit par la session sortante.** → [references/cloture.md](references/cloture.md), « Cas découpé : la frontière de lot se franchit par la session sortante ».

**La passation s'écrit en dernier, depuis les artefacts** → [references/cloture.md](references/cloture.md), « La passation s'écrit en dernier, depuis les artefacts ».

**Une session neuve par lot.** → [references/cloture.md](references/cloture.md), « Une session neuve par lot ».

**Relais en cours de cycle — la session sortante passe ce qu'elle seule possède.** → [references/cloture.md](references/cloture.md), « Relais en cours de cycle — la session sortante passe ce qu'elle seule possède ».

**Le message de clôture prend une forme figée**, chemin de la passation compris
([references/sessions-liees.md](references/sessions-liees.md), « Fin de travail ») : jamais une
fin de tour. **En vague parallèle, il part au lead** : c'est sur lui que le lead archive la
session, ce qui libère son worktree (mesuré le 2026-10-18), puis retire celui-ci — un dossier
qui est le répertoire courant d'un processus ne s'efface pas (`pr-paralleles` Étape 8).
Une session sait qu'elle a fini avant que le lead ne le sache : c'est elle qui porte ces faits.

## Les 5 idées à retenir

→ [references/cloture.md](references/cloture.md), « Les 5 idées à retenir ».
