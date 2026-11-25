---
name: init-projet
description: Met en place et maintient la pipeline de dev d'un projet, quelle que soit la stack — git + dépôt GitHub, profil du projet (langages, commandes de test/lint/build, domaines, zones sensibles), mapping rôle→label GitHub, template (.claude/rules, CLAUDE.md, CONTRIBUTING, CI générée), skills maison + publics, serveur MCP context7. Persiste tout dans .claude/pipeline.config.md. À utiliser au démarrage d'un projet, quand un autre skill signale « config de pipeline absente », ou pour reconfigurer (« change la commande de test », « ajoute un domaine », « réajuste les labels »).
argument-hint: "[ce qu'il faut reconfigurer]"
---

# Init projet

Met en place, en une passe, toute la pipeline de dev dans un projet — et reste **le point d'entrée
unique pour la reconfigurer** ensuite. Source du template : ce dépôt `boilerplate` (dossier
`template/` + dossier `skills/`).

La configuration est persistée dans **`.claude/pipeline.config.md`** à la racine du projet
(versionnée). C'est le fichier que tous les autres skills lisent pour savoir quelles commandes
lancer, quels labels utiliser et quels sont les domaines du projet.

> **Aucune hypothèse de stack.** Ce skill ne présuppose ni langage, ni framework, ni gestionnaire
> de paquets. Tout ce qui est spécifique au projet est **demandé puis persisté**, jamais codé en
> dur.

> **Un document généré n'affirme que ce que le générateur a constaté.** Toute phrase de la forme
> « X est installé / configuré » posée par un template est une assertion non testée qui deviendra
> fausse en silence. Écrire à la place un pointeur vérifiable (« déclaré dans <fichier>, vérifier
> avec <commande> »), et ne poser la ligne qu'après avoir constaté l'artefact attendu (entrée dans
> `.mcp.json`, label créé, commande qui répond). De même, **toute référence croisée vers un
> document utilise un identifiant structurel stable** (numéro de section, ancre de titre) — jamais
> un numéro de ligne, qui périme à la première édition.

## Deux modes

- **Amorçage** — `.claude/pipeline.config.md` absent : dérouler tout le process.
- **Reconfiguration** — le fichier existe : le lire, afficher l'état actuel, demander ce qu'il faut
  changer, puis ne rejouer que les étapes concernées (typiquement 3 → 7). Ne jamais écraser en
  silence une valeur déjà renseignée. Ses écritures de dépôt partent **par une PR**, portée par la
  session qui a décidé, jamais par un commit direct sur le trunk : la session
  l'ouvre, la relit et la merge au go du mainteneur, au déroulé de `triage/hors-scope.md`
  (« Quand écrire », étapes 5 et 6). La copie de l'étape 7 ne se rejoue pas : `copie`
  refuse dès qu'une cible diffère de sa source — `settings.json` fusionné, `CLAUDE.md` finalisé.

## Délégation

La session garde le dialogue avec le mainteneur — chemin du boilerplate, public ou privé, profil
validé valeur par valeur, mapping de labels, skills publics à cocher —, le choix des valeurs et le
récapitulatif. Le reste change de main :

- **`releveur`** — l'inspection de l'étape 3, rendue en tableau pré-rempli dans un fichier ; à
  l'étape 7, l'empreinte et l'étiquette la plus précise de chaque action (`git ls-remote`), les
  valeurs de `package-ecosystem` lues dans la référence Dependabot, passage cité (`context7`), la
  vérification du runtime épinglé ; à l'étape 11, le verdict de chaque commande — code de sortie
  et sortie brute, dans un fichier. Il ne décide rien : ce qui compte reste à la session ;
- **`executant`** — la génération de chaque fichier, en tranche entièrement spécifiée par la
  session (valeurs validées, gabarit, empreintes relevées) : `.claude/pipeline.config.md`
  (étape 5), `ci.yml`, `dependabot.yml` et `.gitignore` (étape 7), `CLAUDE.md` finalisé (étape 9) ;
  en amorçage **sans commit**, le premier commit étant `commit` (étape 12) ;
- **scripts** — les gestes de dépôt, appelés par la session elle-même : un geste isolé coûte plus
  délégué (`CLAUDE.md`, « Orchestration »). En amorçage, les skills ne sont pas encore dans le
  projet : `amorcage.py` se lance par `python <répertoire de ce skill>/scripts/amorcage.py` —
  `depot init` (étape 2), `copie` (7), `valide` (7), `ignore` (7), `mcp` (10), `commit` (12) —,
  `ecriture-relue.py` par `python <répertoire de ce skill>/../cycle-pr/scripts/ecriture-relue.py`
  — `depot create` (2), `label create --mapping` (6). Le contrat de chacun est son `--help` ;
- **sessions distinctes** — la première PR de code d'un projet sans code, une session `cycle-pr`
  (étape 11) ; `vers-prd` ou `vers-issues`, des sessions que l'étape 13 propose, jamais enchaînées
  dans celle-ci ; protocole commun : `.claude/skills/cycle-pr/references/sessions-liees.md`.

## Process

### 1. Localiser le template

Déterminer le chemin du dépôt `boilerplate` (le demander si nécessaire). On y lira `template/` et
`skills/`.

### 2. Initialiser git + le dépôt GitHub

- Si le projet n'est pas un dépôt git : `amorcage.py depot init` (« Délégation ») ; le premier
  commit est celui d'amorçage (étape 12).
- Lire `git remote -v`. Si un remote GitHub existe, le proposer comme dépôt cible (`owner/repo`).
- Sinon, demander public ou privé, puis créer le dépôt et son remote `origin` :
  `ecriture-relue.py depot create <owner>/<repo> --private|--public` (« Délégation »).
- Brancher trunk-based sur `main`.

### 3. Profil du projet — détecter, puis faire confirmer

**Ne rien inventer en silence.** Le `releveur` inspecte le repo (« Délégation ») et rend des
valeurs pré-remplies, que la session fait corriger par l'utilisateur. Ce qui reste ambigu après
inspection se **demande**.

**Signaux à inspecter** (liste non exhaustive — s'adapter à ce qu'on trouve) :

- **Manifeste** : `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `composer.json`,
  `Gemfile`, `pom.xml`, `build.gradle`, `*.csproj`, `mix.exs`…
- **Gestionnaire de paquets** : le lockfile présent (`pnpm-lock.yaml`, `uv.lock`, `Cargo.lock`…).
- **Commandes déjà déclarées** : scripts du manifeste, cibles d'un `Makefile` / `justfile` /
  `Taskfile.yml`, workflows CI existants sous `.github/workflows/`.
- **Arborescence** : les dossiers de premier niveau sous la racine du code, qui suggèrent les
  domaines.
- **Version de runtime** : `.nvmrc`, `.tool-versions`, contrainte du manifeste, image Docker.
- **Conteneurs** : `Dockerfile`, `Containerfile`, fichiers Compose — ils ajoutent les
  écosystèmes `docker` et `docker-compose` de Dependabot (étape 7).

Présenter le résultat comme un **tableau à valider**, valeur par valeur. Pour chaque commande
absente ou introuvable, demander — ou enregistrer `n/a` si le projet n'a pas cette étape (un projet
sans type-checker met `n/a`, il ne faut pas en inventer un).

Les **domaines** sont la brique la plus utile à long terme : ce sont les périmètres nommés que
`vers-issues`, `triage` et `plan-qa` réutiliseront pour cadrer leur travail. Les faire nommer
explicitement, en vocabulaire **métier** (`Facturation`, `Ingestion`), pas en chemins techniques —
avec le ou les chemins en regard.

> Les domaines sont aussi la **source de vérité des thèmes** de `triage` : chaque milestone GitHub
> reprend le nom d'un domaine, à l'identique. Peu de domaines larges et stables valent mieux qu'une
> liste fine — un domaine par issue produirait un milestone par issue.

Les **zones sensibles** alimentent les points d'arrêt humains de `.claude/rules/contraintes.md`
— par défaut, les seuls écrans à valider visuellement ; n'en ajouter que sur demande
explicite de l'utilisateur.

Les **sources de vérité** sont les documents de référence du projet (cadrage, spec, ADR…),
classés par **rang de normativité** — en cas de contradiction, le rang le plus haut l'emporte. Les
issues GitHub ouvertes occupent toujours le **dernier rang** : elles dérivent des documents. Faire
nommer chaque document, sa portée et **où s'inscrit un amendement** (le § seul, le § + un journal
des changements…) : c'est ce que lisent la règle `decisions-vs-doc` et les skills `contradiction`,
`interroge-moi` et `repercussions`. Un projet sans document de référence n'a que les issues.

Les **surfaces** disent ce que le projet expose réellement — c'est ce qui empêche `plan-qa` de
générer une section frontend pour une CLI ou des vérifications de base pour une lib. Les faire
nommer explicitement plutôt que de les déduire d'un archétype : une CLI, une lib, un service et une
application web n'ont presque rien en commun ici. Le sous-ensemble « visible par un utilisateur »
est ce qui déclenche la vérif de fumée avant merge et la proposition de campagne QA en fin de
thème ; s'il est vide, ces deux propositions ne se déclenchent jamais.

### 4. Établir le mapping de labels

Les skills raisonnent en **rôles canoniques**. Le dépôt utilise des **chaînes de labels** réelles.
Établir la correspondance (proposer ces valeurs par défaut) :

| Rôle canonique | Type | Label par défaut | Couleur |
|---|---|---|---|
| bug | catégorie | `bug` | `d73a4a` |
| enhancement | catégorie | `enhancement` | `a2eeef` |
| needs-triage | état | `needs-triage` | `fbca04` |
| needs-info | état | `needs-info` | `d4c5f9` |
| needs-interrogation | état | `needs-interrogation` | `d876e3` |
| ready-for-agent | état | `ready-for-agent` | `0e8a16` |
| ready-for-human | état | `ready-for-human` | `1d76db` |
| wontfix | état | `wontfix` | `ffffff` |
| qa-plan | suivi | `qa-plan` | `0e8a16` |
| qa-finding | suivi | `qa-finding` | `b60205` |

Demander à l'utilisateur s'il veut des chaînes différentes (ex. labels existants du projet). Le
mapping validé s'écrit dans un fichier JSON pour l'étape 6 : une liste d'objets
`{"nom", "couleur", "description"}`, la description portant le rôle, au format de `label create`
(son `--help`). Ce fichier vit **hors de l'arbre du projet**, dans un dossier temporaire :
`commit` (étape 12) fait `git add -A` et l'emporterait.

### 5. Écrire `.claude/pipeline.config.md`

L'`executant` (« Délégation ») le génère depuis ce gabarit et les valeurs validées ; la session le
confirme à l'utilisateur :

<gabarit-config>
# Configuration pipeline

## Dépôt GitHub
- repo : `owner/repo`
- branche trunk : `main`

## Sources de vérité
Ordre de normativité : **en cas de contradiction, le rang le plus haut l'emporte**. Lu par le skill
`contradiction` et par la règle `.claude/rules/decisions-vs-doc.md`.

| Rang | Fichier | Portée | Où s'inscrit un amendement |
|---|---|---|---|
| 1 | <ex. `docs/cadrage.md`> | <ce que le document tranche> | <ex. le § concerné + une ligne au journal des changements> |
| n | issues GitHub ouvertes | découpage et planification, **dérivés** des rangs supérieurs | le corps de l'issue, jamais un commentaire — voir `repercussions` |

**Non normatif :** <ex. `docs/archive/` — le raisonnement et les options écartées ; rien ne s'y décide>

Toute référence croisée cite un **§ ou un titre de section**, jamais un numéro de ligne.

## Stack
- langages : <ex. TypeScript, Go>
- frameworks : <ex. Next.js, Fiber — ou "aucun">
- gestionnaire de paquets : <ex. pnpm, uv, cargo, go mod>
- runtime + version : <ex. node 22, python 3.12, go 1.23>

## Commandes du projet
Lues par `cycle-pr`, `execution-qa` et la génération de CI. `n/a` = étape absente du projet.
- install      : <cmd>
- test         : <cmd>                  # suite complète
- test ciblé   : <cmd> <chemin|motif>   # une seule cible, pour la boucle TDD
- test brut    : n/a                    # sortie du lanceur sans résumeur, si le poste en a un (cycle-pr 3.2)
- test-pipeline : `python -m pytest .claude -q`   # tests des scripts de la pipeline (`.claude/tests/`) ; `n/a` sans test sous `.claude/`, où pytest sort en 5
- lint         : <cmd>
- format       : <cmd>                  # écrit
- format:check : <cmd>                  # vérifie sans écrire
- typecheck    : <cmd | n/a>
- audit        : <cmd | n/a>            # audit des dépendances, porte de CI (`pip-audit`, `npm audit`…)
- build        : <cmd | n/a>
- run local    : <cmd | n/a>
- validation   : `claude plugin validate .claude --strict`   # sur le poste, par un `releveur`, avant chaque push d'un delta sur `.claude/` ou `CLAUDE.md`
- relecture    : `/code-review medium <n> --comment`   # `<n>` : numéro de la PR ; `medium`, le seul niveau mesuré (`cycle-pr/references/session-relecture.md`, « Réveil »)
- restrictions : `python .claude/skills/cycle-pr/scripts/restrictions-du-delta.py <début>`   # passe « restrictions du delta » ; `<début>` : début de la plage relue (`cycle-pr/references/session-relecture.md`, « Réveil »)
- sécurité     : `/security-review`   # seulement si le diff touche une zone sensible ou une surface exposée (« Périmètre »)
- e2e ciblé    : <cmd | n/a>            # script de navigateur rejouable de la lentille navigateur ; `n/a` avec son motif
- hooks        : <cmd | n/a>            # installe les hooks git, depuis le clone principal seulement (`pr-paralleles`) ; `n/a` avec son motif

## Qualité
- seuil de couverture : <ex. 80 % | aucun>
- règles sensibles à la plateforme : <n/a si poste et CI ont le même OS | liste, et où chacune est vérifiée — cycle-pr 3.2>
- gates bloquants en CI : <ex. audit, lint, format:check, typecheck, test>
- services requis en CI : <ex. postgres:16, redis:7 | aucun>

## Périmètre
- domaines (nom métier → chemin) — servent aussi de thèmes/milestones à `triage` :
  - <Domaine A> : <chemin/>
  - <Domaine B> : <chemin/>
- zones sensibles (arrêt humain — cadence dans `.claude/rules/contraintes.md`) : <défaut : écrans à valider visuellement>
- hors périmètre : <ce que le projet ne couvre pas / ne doit pas toucher>
- surfaces exposées — ce que la QA a le droit de vérifier ; ne lister que ce qui existe :
  <ex. API HTTP, interface web, CLI, persistance, traitements asynchrones, fichiers produits,
  comptes utilisateurs / isolation>
- surfaces visibles par un utilisateur : <sous-ensemble des précédentes ; déclenche la vérif de
  fumée de `cycle-pr` et la proposition de campagne QA — vide si le projet n'expose rien>

## Langue
- skills / issues / PRD / descriptions : français
- identifiants du code : <ex. anglais — observer le code existant à l'initialisation>
- commentaires / docstrings / noms de tests : <ex. français>
- préfixe conventional commit : anglais (feat/fix/chore/docs/refactor)

## Mapping labels (rôle canonique → label GitHub)
- bug → `bug`
- enhancement → `enhancement`
- needs-triage → `needs-triage`
- needs-info → `needs-info`
- needs-interrogation → `needs-interrogation`
- ready-for-agent → `ready-for-agent`
- ready-for-human → `ready-for-human`
- wontfix → `wontfix`
- qa-plan → `qa-plan`
- qa-finding → `qa-finding`
- prd → `prd`   # label de nature (document parent) — hors machine à états, ni rôle d'état ni thème
- documentation → `documentation`   # label de nature (PR `docs(…)` sans issue liée) — hors machine à états

**Métadonnées d'une PR** — posées à l'Étape 2 de `cycle-pr`, vérifiées à l'Étape 5, corrigées
avant la sortie du draft si elles dévient. Toute PR qui n'est pas l'œuvre d'un bot porte :
- **assignee** : son auteur ;
- **un** label de catégorie : celui de l'issue qu'elle ferme ; sans issue, dérivé du type
  conventional commit — `feat` / `chore` / `refactor` / `ci` → `enhancement`, `fix` → `bug`,
  `docs` → `documentation` ;
- **le milestone** du domaine de ses fichiers (section « Périmètre »).

## Skills du projet
- <liste retenue>
- Écartés : <skill> — <raison>
</gabarit-config>

### 6. Créer les labels manquants dans GitHub

`ecriture-relue.py label create --mapping <fichier>` (« Délégation »), sur le fichier de l'étape
4, crée les labels absents du dépôt ; sa sortie dit ce qui a été créé, et nomme un label présent
sous une autre couleur sans le modifier. Confirmer à l'utilisateur ce qui a été créé.

### 7. Copier le template + générer la CI et Dependabot

`amorcage.py copie <boilerplate>` (« Délégation ») copie `template/`, hors `.github/`, à la racine
du projet — et `skills/` sous `.claude/skills/` (étape 8) :

- `CLAUDE.md` (renvoie aux règles de `.claude/rules/`, chargées automatiquement)
- `.claude/rules/` (contraintes, cleanup-verbatim, taille-pr, decisions-vs-doc)
- `.claude/agents/` (`developpeur`, `executant`, `releveur`, `relecteur`, `verificateur` — les
  équipiers par rôle ; la relecture indépendante de l'Étape 4.2 de `cycle-pr` tourne sur
  `relecteur`)
- `.claude/settings.json` (permissions de base ; fusionner s'il en existe déjà un)
- `CONTRIBUTING.md` (pointeur vers `cycle-pr`)

**L'ordre est copie, puis fusion** : un `settings.json` déjà présent sous un autre contenu fait
refuser la copie entière — le mettre de côté, copier, puis le fusionner à la main. Après la
fusion, `copie` ne repasse plus : il refuserait sur ce fichier.

`CLAUDE.md` est copié **tel quel** ici : son placeholder `{{CHEMIN_JOURNAL_OBSERVATIONS}}` se
remplit à l'étape 9.

Puis, **si le projet a déjà du code**, l'`executant` génère `.github/workflows/ci.yml` à partir de
`template/.github/workflows/ci.yml`, qui est un modèle à trous — pour un projet sans code
encore, le `ci.yml` et le `dependabot.yml` attendent sa première PR de code (étape 11) :

- Remplacer chaque `{{CMD_*}}` par la commande correspondante de la section « Commandes du projet ».
- **Supprimer purement et simplement** toute étape dont la commande vaut `n/a` — ne jamais laisser
  un placeholder ni une étape vide dans le fichier généré.
- **Réécrire l'en-tête** : le commentaire « Modèle de CI » et ses règles de génération laissent
  place à un en-tête propre au projet ; aucun champ `{{MAJUSCULES}}` ne subsiste, pas même en
  commentaire. Les expressions GitHub `${{ … }}` du modèle ne sont pas des champs : elles restent
  telles quelles (`concurrency`, extraction de la tête, « Fusion explicite du trunk »).
  Retirer le commentaire d'une étape supprimée, et nommer le job d'après ses étapes réelles.
- Remplir `{{SETUP_STEPS}}` avec l'action de mise en place officielle de l'écosystème, qui
  provisionne la version du **runtime** épinglée dans « runtime + version » (`actions/setup-node`,
  `astral-sh/setup-uv`, `actions/setup-go`, `actions/setup-java`…).
- Remplir `{{SERVICES}}` depuis « services requis en CI », ou retirer le bloc s'il n'y en a pas.
- Au-dessus de l'étape `Audit`, écrire en commentaire le seuil de blocage et sa raison.
- **Épingler chaque `uses:` par empreinte de commit** — ceux du modèle (`{{ACTION_SHA}} #
  {{ACTION_VERSION}}`) comme ceux de `{{SETUP_STEPS}}`, sur la dernière version publiée de
  l'**action**, pré-versions exclues. L'empreinte se résout à la source, jamais de mémoire :
  `git ls-remote --tags --sort=-v:refname https://github.com/<owner>/<repo>.git` — le dépôt,
  pas le sous-dossier d'une action comme `github/codeql-action/init` ; pour une étiquette
  annotée, la ligne `^{}` donne le commit. Le commentaire porte l'étiquette **la plus
  précise** de ce commit (`v7.0.1`, pas `v7`) : Dependabot ne réécrit qu'un commentaire dont
  l'étiquette pointe encore sur le commit épinglé. Une étiquette peut être déplacée par qui
  prend la main sur le dépôt de l'action ; une empreinte non (GitHub, « Secure use reference »).
  Empreintes et étiquettes sont relevées par le `releveur` (« Délégation »).
- **Conserver `permissions: contents: read`** en tête : le jeton par défaut d'un dépôt peut être
  bien plus large. Un job qui doit écrire élève ses droits à son niveau, jamais le workflow.
- **Conserver le garde `if:` et `ready_for_review`.** Le garde saute toute PR en draft, quel que
  soit l'événement — ouverture, push, réouverture —, et `ready_for_review` figure dans les `types`
  du `pull_request` : une draft n'a aucun run, le premier part au passage en ready (`cycle-pr`
  Étape 5), puis chaque push en lance un. La forge tient la règle, aucune session n'a à se la
  rappeler à chaque push ; un rouge de plateforme se voit au passage en ready, après la relecture
  — le prix assumé. Sans `ready_for_review`, une PR sortie du draft resterait sans run jusqu'à son
  prochain push.
- **Donner une horloge aux portes qui lisent une base d'avis** — audit des dépendances, scan
  d'images : leur verdict change sans commit, quand un avis se publie. Ajouter au `on:` un
  déclencheur `schedule` quotidien et `workflow_dispatch`, réservés à ces portes : toute étape ou
  job dont aucune d'elles ne dépend — lint, typecheck, tests, publication, déploiement — porte un
  `if:` qui écarte ces deux déclencheurs ; checkout, mise en place, installation et construction
  de ce que le scan lit restent. Sans horloge, un avis n'est vu qu'au run suivant d'une PR
  quelconque, qui hérite d'un rouge hors de son sujet — deux fois en deux jours.
  `workflow_dispatch` éprouve ce chemin sans attendre un jour ; `schedule` ne part que de la
  branche par défaut, et GitHub le désactive dans un dépôt public resté 60 jours sans activité
  (doc GitHub Actions : « Troubleshooting workflows », « Disabling and enabling a workflow »).
  Sans porte d'avis dans la config, rien à ajouter.
- **Ajouter un job des tests de la pipeline** si la ligne `test-pipeline` n'est pas `n/a` : à
  part du job principal, sans le runtime ni les dépendances du projet, il installe Python
  (`actions/setup-python`, épinglée comme les autres `uses:`) et pytest à version épinglée, puis
  lance cette ligne, sans filtre de chemins. Même garde draft que le job principal, écarté de
  `schedule` et `workflow_dispatch` ; il extrait la tête et reprend le pas « Fusion explicite du
  trunk ». Sans lui, un delta sur la pipeline passe la CI sans ses tests.

Puis l'`executant` génère `.github/dependabot.yml` depuis `template/.github/dependabot.yml` : les
empreintes du `ci.yml` n'avancent que si Dependabot les tient, et le modèle porte déjà
l'écosystème `github-actions`. Ajouter une entrée par écosystème de la stack — celui du
gestionnaire de paquets déclaré, `docker` si un `Dockerfile` ou un `Containerfile` existe,
`docker-compose` pour les fichiers Compose —, copiée de l'entrée modèle avec le `directory`
de son manifeste, puis retirer le bloc `{{ECOSYSTEMES_STACK}}`. Pour `docker`, une entrée **par
dossier de Dockerfile**, jamais une entrée à `directories` : tant qu'une PR de groupe est
ouverte, Dependabot n'examine plus aucun dossier de son entrée, et une image peut rester des
semaines sans proposition. Dependabot diffère un groupe quand une PR ouverte porte le même nom
de groupe et que ses dossiers sont inclus dans ceux de l'entrée — une PR sans dossier enregistré
compte comme incluse (`find_existing_group_pr`, `updater/lib/dependabot/updater/
group_update_creation.rb` de dependabot-core, lu le 2026-10-18).
Les valeurs de `package-ecosystem` se lisent dans la référence des options, pas de mémoire — le
`releveur` en cite le passage :
https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference

**Images de base** — le skill ne réécrit pas les `FROM`, il signale à l'utilisateur ceux qui
ne suivent pas la forme `<image>:<étiquette la plus précise>@sha256:<empreinte>`
(`python:3.12.14-slim@sha256:…`). Dependabot propose la plus haute version stable publiée,
mineure comprise (`3.14` s'il y en a une) : si la version du runtime est épinglée ailleurs
(`.python-version`, `.nvmrc`…), ajouter à l'entrée `docker` de cette image — ou
`docker-compose`, pour une image citée dans un fichier Compose — un `ignore` des montées
`version-update:semver-major` et
`version-update:semver-minor` de cette image : changer de runtime est une décision du projet, et
la PR échouerait sur l'épingle. Chaque correctif (`3.12.15`) arrive alors en PR, étiquette et
empreinte ensemble ; sous cet `ignore`, une étiquette sans correctif (`3.12`) n'avancerait que
par un rafraîchissement d'empreinte, que Dependabot peut ne pas proposer.

**Runtime épinglé — une version, des fournisseurs.** Si le profil déclare un gestionnaire de
version (FVM, pyenv, nvm, asdf, mise…), séparer *quelle version* de *qui la fournit* :

- La version a **une source unique** (fichier d'épinglage) lue par tous les environnements.
- Le fichier de commandes route le runtime **à travers le gestionnaire par défaut** — un épinglage
  que les commandes n'empruntent pas est décoratif, pire qu'aucun — mais via une **variable
  surchargeable** (`flutter := env('FLUTTER_CMD', 'fvm flutter')`) : la valeur par défaut est le
  chemin qui a besoin d'isolation (le poste de dev).
- La CI **surcharge la variable** et provisionne le runtime avec l'action qui lit le **même**
  fichier d'épinglage — jamais un canal indépendant (`channel: stable` flottant) : deux mécanismes
  de provisionnement pour la même version divergent silencieusement.
- À la génération, le `releveur` vérifie qu'aucune recette n'invoque le binaire nu d'un runtime
  épinglé, et simule la résolution des deux environnements.

**Valider les deux fichiers** contre leur schéma — `amorcage.py valide <fichier> --schema
vendor.github-workflows` pour le `ci.yml`, `--schema vendor.dependabot` pour le `dependabot.yml`,
le script validant une copie temporaire en `.yml` —, puis les montrer à l'utilisateur.

**`.gitignore` — généré depuis le profil, puis testé.** L'`executant` le génère depuis les **chemins
déclarés** (une section par langage présent, motifs indépendants de la profondeur `**/` dès qu'un
paquet vit hors racine), jamais d'un gabarit mono-paquet dont les motifs sont ancrés à la racine.
Puis **tester mécaniquement** avec `amorcage.py ignore --exclus <chemin> … --suivis <chemin> …`
sur une liste de chemins fabriqués depuis le profil : ceux qui doivent être exclus, et les
lockfiles/sources qui doivent rester suivis ; **un dossier absent se nomme avec sa barre finale**
(`node_modules/`) ou par un chemin qu'il contient. Un fichier de motifs ne se relit pas, il se
teste.

### 8. Déployer les skills maison et les skills embarqués

`copie` (étape 7) a copié les skills de la pipeline de `boilerplate/skills/` vers
**`.claude/skills/`** du projet :

`init-projet`, `vers-prd`, `vers-issues`, `triage`, `interroge-moi`, `cycle-pr`, `contradiction`,
`repercussions`, `pr-paralleles`, `plan-qa`, `execution-qa`, `bug-vers-issue`, `audit-spec-ui`,
`schema-architecture`.

Et les skills publics que `boilerplate/skills/` embarque, activés par `CLAUDE.md` (« Minimalisme »,
« Observation continue ») : `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`,
`ponytail-gain`, `ponytail-help`, `task-observer`. L'étape 9 ne les réinstalle pas.

Chaque skill s'invoque par `/<nom>` (`/triage`, `/cycle-pr`, `/plan-qa`…) : c'est le skill
lui-même qui crée la commande, et son `argument-hint` vit dans le frontmatter du `SKILL.md`.
**Jamais de fichier de commande homonyme** dans `.claude/commands/` : Claude Code charge le skill
et ignore la commande (doc `skills`, table « Same name in / Which one runs »), et tout ce que la
commande porterait — rappels, `argument-hint` — serait perdu en silence.

**Un skill retiré du projet ⇒ aucun fichier `.claude/commands/<nom>.md` à son nom** : plus masqué
par le skill, il s'exécuterait et renverrait vers un skill inexistant.

### 9. Repérer les automatisations utiles, puis installer les skills publics

**Point de départ — le plugin `claude-code-setup`** (Anthropic, lecture seule) : il analyse le
projet — structure, dépendances, langages — et propose des automatisations dans **cinq
catégories** : serveurs MCP, skills, hooks, sous-agents, commandes. Le lancer avec « recommande
des automatisations pour ce projet ». S'il n'est pas installé, le proposer à l'utilisateur depuis
l'annuaire des plugins et **continuer sans lui** plutôt que de bloquer l'amorçage.

1. **Récolter les recommandations** — lancer `claude-code-setup`. Il ne rend que le **top 1–2 par
   catégorie** ; demander explicitement une catégorie (« quels skills ? », « quels hooks ? ») pour
   obtenir 3–5 options. Ses sorties *MCP* alimentent l'**étape 10** ; ses sorties
   *hooks / sous-agents / commandes* sont à proposer telles quelles.
2. **Repli si `claude-code-setup` est indisponible** — plugin non installé, session distante sans
   accès au catalogue — ne pas s'arrêter là, dérouler dans cet ordre :
   1. le skill **`find-skills`**, s'il est installé : il consulte le classement skills.sh (les plus
      installés, donc les plus éprouvés) avant toute recherche CLI ;
   2. `npx skills find <langage>`, `<framework>`, `testing` — recherche brute par mot-clé ;
   3. le catalogue https://skills.sh/ à la main.

   Ne **jamais** proposer un set en dur : un projet Go n'a rien à faire avec des skills d'un
   cadriciel Python. **Dire en une ligne que le repli a servi**, et que relancer `init-projet` une
   fois le plugin installé complétera la liste — l'étape 9 se rejoue seule, sans toucher au reste
   de la config.
3. **Présenter en cases à cocher** — l'utilisateur active/désactive chaque ligne. Ne **jamais**
   rien installer sans confirmation. Les skills publics embarqués (étape 8) n'y figurent pas : ils
   font partie du socle de la pipeline, toujours déployés, jamais retirés.
4. **Installer** la sélection (vérifier la CLI : `npx skills --version`) :
   `npx skills add <owner/repo> -s <skill> --agent claude-code -y`.
   - **Répéter `-s` pour chaque skill** — la forme `-s a,b,c` séparée par des virgules ne marche pas.
   - **Vérifier `ls .claude/skills/` après chaque `add`** : un skill tiré d'un gros dépôt
     communautaire en amène souvent d'autres. Retirer les intrus — chaque skill coûte du contexte
     à chaque session.
   - **Vérifier la compatibilité avec la stack *avant* d'installer**, pas après. Beaucoup de skills
     « design » ou « frontend » supposent un DOM (React / Tailwind) et sont inertes sur une stack
     qui n'en a pas.
   - Un outil recommandé n'est pas toujours un skill : certains s'installent en **plugin**, en
     **paquet** (npm, uv/pipx) ou en **serveur MCP**. Ne pas forcer `npx skills add` sur eux.
5. **Enregistrer** la sélection dans la section « Skills du projet » de
   `.claude/pipeline.config.md` — **et les candidats écartés avec leur raison**, sinon la passe
   suivante les repropose.
6. **Finaliser `CLAUDE.md`** — l'`executant` (« Délégation »), sur le chemin que la session lui
   donne : remplacer `{{CHEMIN_JOURNAL_OBSERVATIONS}}` par un chemin **stable hors du dépôt** —
   `~/.claude/projects/<projet>/skill-observations/log.md` — jamais relatif au répertoire courant.

### 10. Installer les serveurs MCP utiles (context7)

Reprendre ici les **serveurs MCP** remontés par `claude-code-setup` à l'étape 9, en plus de
context7 qui, lui, est installé dans tous les cas.

**context7** donne à Claude la **doc à jour des bibliothèques**, résolue à la demande, au lieu de la
deviner de mémoire ou de la chercher sur le web — c'est un **gain de tokens** direct, d'autant plus
utile que la stack s'appuie sur des libs qui évoluent vite.

1. `amorcage.py mcp context7 https://mcp.context7.com/mcp` (« Délégation ») : rien à faire si
   `claude mcp list` le liste déjà ; sinon il l'ajoute — transport HTTP distant, portée
   utilisateur, sans clé : suffisant, débit limité —, puis relit la liste.
2. Pour référence, la commande qu'il lance, puis celles qui restent au mainteneur :

   ```
   claude mcp add --scope user --transport http context7 https://mcp.context7.com/mcp
   ```

   Pour un débit plus élevé, une clé (gratuite sur `context7.com/dashboard`) se passe par en-tête :
   **ce geste reste au mainteneur, qui tape lui-même la commande** (`contraintes.md`, « Jamais
   d'information dérivée d'un secret »).
   **Ne jamais la committer** : la garder en portée `user` (config locale hors dépôt), ou via
   variable d'environnement si on préfère `--scope project` (`.mcp.json` versionné) :

   ```
   claude mcp add --scope user --header "CONTEXT7_API_KEY: <clé>" --transport http context7 https://mcp.context7.com/mcp
   ```

   Variante locale (process local au lieu du serveur distant) :
   `claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp`.
3. Une fois installé, **l'utiliser en priorité** pour toute question sur une lib de la stack (une
   note le rappelle dans le `CLAUDE.md` du template).

### 11. Vérifier que les commandes déclarées fonctionnent

Avant de committer, le `releveur` (« Délégation ») lance réellement `test`, `test-pipeline` et
chaque commande des « gates bloquants en CI » de la config, et rend le verdict de chacune — code
de sortie et sortie brute — dans un fichier.
Une commande déclarée mais fausse est pire qu'absente : elle casse `cycle-pr` et la CI au premier
usage. Corriger la config si l'une échoue pour cause d'erreur de saisie.

**Projet sans code encore** : il n'y a rien à lancer. Enregistrer les commandes cibles avec le
marqueur `# non vérifiée`, et **ne générer ni `ci.yml` ni `dependabot.yml`** : un workflow
committé avant le code qu'il vérifie est rouge dès son premier run (`uv sync` sans manifeste),
contre la règle « aucun commit cassé ». Le marqueur est
l'engagement : `cycle-pr` le lit à son Étape 1, et la première PR de code rejoue la génération
CI et Dependabot de l'étape 7 — paragraphe « Runtime épinglé » compris — et cette
vérification, puis retire les marqueurs. Cette première PR de code est une **session `cycle-pr`
distincte** (« Délégation ») : celle-ci ne la mène pas.

Deux pièges de diagnostic à cette étape :

- **Un binaire installé dans cette session peut être introuvable** : le shell hérite du PATH figé
  au démarrage, antérieur à l'installation. Avant de conclure à un échec d'installation, augmenter
  explicitement le PATH avec les répertoires d'installation connus, ou vérifier l'existence du
  binaire sur disque.
- **Un contrôle « doctor » en échec accuse ce qu'il contrôle autant que lui-même.** Avant de
  mettre à jour l'outil de contrôle (l'action la plus facile, pas la plus probable), établir ce
  que le contrôle exécute réellement et si cette cible a changé récemment — lire le message
  d'erreur de la cible, pas seulement le verdict du contrôleur.

### 12. Commit d'amorçage

`amorcage.py commit` (« Délégation ») refuse tant qu'un fichier suivi viole les règles d'ignore —
`.gitignore` n'agit pas rétroactivement sur des fichiers déjà stagés — et les nomme tous : les
sortir de l'index (`git rm --cached`), puis le relancer. Sinon il commite
`chore: amorçage pipeline de dev`, puis relit.

### 13. Récapituler

Afficher : dépôt GitHub, profil du projet retenu (stack + commandes + domaines), labels créés, CI
et Dependabot générés — ou reportés à la première PR de code, projet sans code (étape 11) —,
skills maison déployés, skills publics installés, context7 disponible, et les prochaines
étapes : `vers-prd` ou `vers-issues` pour démarrer la planification, que la session **propose**
en sessions distinctes (« Délégation »), jamais enchaînées dans celle-ci. Elles démarrent avec
`use_worktree: false` : leur seule écriture de dépôt, l'archive de `vers-prd`, passe par son
`executant` en isolation `worktree`.

## Checklist finale

Projet sans code encore : les cases de la CI, de Dependabot et des commandes restent ouvertes
jusqu'à la première PR de code, qui les coche (étape 11).

- [ ] git + remote GitHub en place, branche `main` (`depot init`, `depot create`)
- [ ] profil du projet confirmé par l'utilisateur (aucune valeur devinée en silence)
- [ ] `.claude/pipeline.config.md` écrit, sans placeholder résiduel
- [ ] projet sans code seulement : chaque commande de la config marquée `# non vérifiée` (étape 11)
- [ ] labels manquants créés dans GitHub (`label create --mapping`)
- [ ] `CLAUDE.md` + `.claude/rules/` + `.claude/agents/` + `settings.json` + `CONTRIBUTING.md`
      copiés (`copie`)
- [ ] `CLAUDE.md` finalisé (étape 9) : sans `{{CHEMIN_JOURNAL_OBSERVATIONS}}` résiduel
- [ ] section « Sources de vérité » renseignée (au minimum : les issues ouvertes)
- [ ] `ci.yml` généré depuis les commandes réelles, sans champ `{{PLACEHOLDER}}` ni étape `n/a` (les expressions GitHub `${{ … }}` restent)
- [ ] chaque `uses:` du `ci.yml` épinglé par empreinte + `# <étiquette la plus précise>` ; `permissions: contents: read` en tête
- [ ] portes à base d'avis (audit, scan) : `schedule` quotidien et `workflow_dispatch`, réservés à elles et à ce dont elles dépendent
- [ ] job des tests de la pipeline, sauf `test-pipeline : n/a`
- [ ] `.github/dependabot.yml` généré (`github-actions` + écosystèmes de la stack)
- [ ] `ci.yml` et `dependabot.yml` validés contre leur schéma (`valide`)
- [ ] skills maison et skills publics embarqués (`ponytail*`, `task-observer`) déployés dans `.claude/skills/` (`copie`)
- [ ] aucun fichier dans `.claude/commands/` au nom d'un skill déployé (il serait ignoré), ni d'un
      skill maison retiré (il s'exécuterait)
- [ ] skills publics cochés installés (choisis d'après la stack, pas d'un set en dur)
- [ ] serveur MCP context7 disponible (`mcp`)
- [ ] `test`, `test-pipeline` et commandes des gates bloquants en CI vérifiées en local
- [ ] commit d'amorçage fait (`commit`)

## Note pour les autres skills

Quand un skill a besoin du dépôt, du vocabulaire de labels, des commandes ou des domaines, il lit
`.claude/pipeline.config.md`. S'il est absent ou incomplet, le skill **s'arrête** et propose une
session `init-projet` distincte (protocole : `.claude/skills/cycle-pr/references/sessions-liees.md`)
— il ne l'enchaîne pas dans sa propre session. Absent, c'est un amorçage, `use_worktree: false` :
il écrit à la racine du projet, qui n'est peut-être pas encore un dépôt git ; incomplet, une
reconfiguration, `use_worktree: true` : elle écrit sur une branche, par une PR.
