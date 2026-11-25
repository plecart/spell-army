---
name: pr-paralleles
description: Orchestre plusieurs PR en parallèle — prépare la vague quand trop peu d'issues sont prêtes (crible, sessions de triage et d'interrogatoire), sélectionne des issues ready-for-agent non bloquées et à faible recouvrement de fichiers, démarre une session par issue dans un worktree de l'application, tient un tableau de bord, et nettoie après merge. Utiliser pour développer plusieurs issues en même temps, paralléliser la réalisation de PR, ou lancer une vague de travail AFK.
argument-hint: "[#issues | nombre de PR à lancer]"
---

# PR parallèles

Permet de travailler sur **plusieurs PR en même temps** sans qu'elles se marchent dessus, en
isolant chaque unité de travail dans son propre **git worktree** (un dossier de travail + une
branche distincts, partageant le même dépôt `.git`). Chaque worktree se développe dans **sa propre
session Claude Code**, en suivant `cycle-pr` : une session que le lead démarre lui-même, selon le
protocole des sessions liées (`.claude/skills/cycle-pr/references/sessions-liees.md`).

Prérequis : `.claude/pipeline.config.md` existe — sinon s'arrêter et proposer une session
`init-projet` distincte (`init-projet`, « Note pour les autres skills »).

## Quand l'utiliser

- Plusieurs issues `ready-for-agent` sont prêtes et indépendantes.
- L'utilisateur veut « faire plusieurs PR en même temps ».
- Trop peu d'issues sont prêtes pour une vague : l'étape 0 la prépare.

## Process

### 0. Préparer la vague — quand trop peu d'issues sont prêtes

**Entrée.** Lister les issues prêtes comme à l'étape 1, argument compris, et en retirer celles qui
sont **en vol** (`repercussions`, « Marquer les issues « en vol » »). Si ce qui reste ne suffit pas
à une vague — aucune, moins que le `n` donné, ou une seule sans argument —, ou si une issue nommée
en argument n'est pas prête, l'étape 0 la prépare ; sinon, passer à l'étape 1.

**Premier geste du lead**, l'étape ouverte, avant le crible — une porte, dans son dossier : les
sessions de cette étape n'ont pas de worktree et y lisent le code, qui doit être le trunk :
`git fetch origin && git merge-base --is-ancestor HEAD origin/main && git merge --ff-only origin/main`.
Le prédicat refuse une tête en avance ou divergente — `--ff-only` seul laisse passer la première,
« Already up to date. » et sortie 0 (mesuré le 2026-10-19 sur `fd6678f`). Un
refus se remonte au mainteneur.

**Crible**, en lecture seule :

1. `gh issue list --state open --limit 200 --json number,title,labels,author,body` — sans
   `--limit`, `gh` s'arrête à 30 (`gh issue list --help`, gh 2.94.0) ; hors issues d'un bot
   (`author.is_bot`), hors label de nature `prd`, hors `needs-info` et `ready-for-human`,
   qu'aucune session ne fait avancer (`triage`, « Rôles »), et retirées celles en vol, comme à
   l'entrée.
2. Les bloqueurs : chaque numéro de « Bloquée par » lu dans GitHub (`triage`, « Trier une issue
   spécifique », étape 4) ; une issue dont un bloqueur est ouvert n'est pas proposée.
3. Le recouvrement : le crible de l'étape 2, lu par domaines (section « Périmètre » de
   `.claude/pipeline.config.md`) — une issue non triée n'a pas de brief qui nomme ses zones.
4. Le chemin critique : ce que chaque issue débloque, en chaîne, parmi les « Bloquée par » des
   issues ouvertes.

**Proposition.** Un tableau — issue, état de triage, domaine, chemin critique, HITL attendu (arrêt
visuel d'une surface visible de la config, service tiers, interrogatoire long) —, puis les deux ou
trois phrases par issue de l'étape 2. `n` donné → `n` issues ; sans argument, le skill recommande
un degré et le motive : domaines disjoints, chemin critique, temps du mainteneur, chaque
interrogatoire se menant dans sa fenêtre. Les issues déjà prêtes y entrent sans session. Rien ne
s'ouvre avant l'accord : la question nomme les sessions que l'accord démarrera, et demande l'accord
d'archiver chacune une fois son issue vérifiée — session de tri comme session d'une issue `bug`
(ci-dessous).

**Démarrer les sessions**, dans le tour de l'accord et dans celui-là seulement (étape 3, même
raison) : le lead se nomme d'abord `vague-<k>` (`set_session_title` sur `"self"`, `<k>` lu comme
le dit l'étape 4), puis démarre une session par issue à préparer — une issue `bug` à part, voir
plus bas —, `start_session` avec `initiation: user_asked`, `context: fresh`, `use_worktree: false`
écrit en clair, `wake_when_done: true`, `title: <préfixe> › #<N> tri` (`sessions-liees.md`,
« Identité », une racine se nomme d'abord), `model` et `effort` omis — hérités du lead.
La session
n'écrit que dans GitHub et lit le code dans le dossier du lead — qui, tant que ses sessions
lisent, n'y écrit rien et n'y change pas de branche ; omis, `use_worktree` lui donne un worktree à
elle dès que le lead travaille dans un worktree (description de l'outil, lue le 2026-10-19). Le
brief :

```
Tu es une session de préparation de vague, démarrée par la session lead — ton parent, dont
l'adresse est dans ton prompt système. Tu n'écris que dans GitHub : ni fichier, ni branche, ni
commande du projet hors lecture. Une écriture qu'un skill exige — ADR, amendement d'un document
(`decisions-vs-doc`), `.out-of-scope/` (`triage`) — ne se fait pas ici : « bloquant : <…> » à
ton parent.
Ne charge `task-observer` que sur demande du mainteneur (CLAUDE.md, « Observation continue »).
Lis CLAUDE.md et .claude/pipeline.config.md.
Invoque le skill `triage` (outil Skill) avec #N, puis `interroge-moi` avec #N s'il ne l'a pas
lancé ; tes questions se posent au mainteneur, dans ta fenêtre. La transition qu'il accepte,
applique-la par `triage`, brief d'agent publié, puis envoie à ton parent « interrogatoire #N
terminé — ready-for-agent proposé » — ou « terminé — #N en <état> » si l'issue s'arrête ailleurs
(.claude/skills/cycle-pr/references/sessions-liees.md, « Fin de travail »). Le message ne part
qu'une fois la transition appliquée, y compris celui que demande `interroge-moi` à sa fin.
```

**Une issue `bug`** — étiquetée `bug`, ou que son rapport décrit comme telle — reçoit au contraire
son propre worktree, `use_worktree: true`, les autres paramètres inchangés : la reproduction de
`triage` (étape 3) lance des commandes du projet, que le dossier du lead ne porte pas. Son brief
remplace « Tu n'écris que dans GitHub : ni fichier, ni branche, ni commande du projet hors
lecture. » par : « Ni branche ni commit, dans ton propre worktree. Premier geste :
`git fetch origin && git switch --detach origin/main` — aucune branche à créer —, puis les gestes 1
à 5 de `pr-paralleles` étape 3, « Provisionner son worktree » ; la reproduction de `triage`
(étape 3) se joue ici. » Le geste détache la tête sur le trunk sans créer de branche (mesuré le
2026-10-19 sur un worktree jetable, git 2.47.1 : sortie 0, `HEAD` égal à `origin/main`,
`git symbolic-ref -q HEAD` en 1). Elle s'archive sur l'accord de la proposition, comme une session
de tri, puis se nettoie comme à l'étape 8 (liens, worktree, échafaudage).

**Fin — un message, puis GitHub.** Le message réveille le lead ; il ne prouve rien seul.
Pour chaque issue, `gh issue view <N> --json labels` porte `ready-for-agent` et
`gh issue view <N> --comments` un `## Brief d'agent` ; une issue qui n'y est pas sort de la vague,
dite au mainteneur, comme celle dont la session envoie un « bloquant » ; une session muette suit
l'étape 7, « Session disparue ». **Une session de tri s'archive dès que le lead a vérifié son issue
sur GitHub**, sur l'accord demandé à la proposition, comme la session d'une issue `bug`, et garde
`use_worktree: false` : l'archivage d'une session sans worktree ne détache pas la tête du dossier
qu'elle partage, ici celui du lead (mesuré le 2026-11-03 dans un worktree, `sessions-liees.md`,
« Nettoyage » ; clone principal non mesuré).
Archiver le lead de préparation archive avec lui ses sessions de tri, qui partagent son worktree
(description d'`archive_session`, lue le 2026-11-03 : « Archiving a session also archives its side
sessions that share its worktree or have finished » ; relevé le même jour vers 15:15 UTC par
`get_session` : les trois sessions de tri de la préparation d'une vague, `local_9cc0a634`,
`local_08600026` et `local_04a2a910`, rendaient `isArchived: true`, archivées avec leur lead) :
la règle vaut tant que le lead de préparation vit. Chaque message reçu et
vérifié, la préparation **se termine** : préparer la vague et la conduire sont deux sessions.
Elle rend au mainteneur la liste des issues vérifiées, plus celles déjà prêtes de la
proposition, et propose une carte « démarrer la vague » — `start_session`,
`initiation: own_initiative`, `context: fresh`, brief : le skill `pr-paralleles` invoqué avec cette
seule liste en argument —, que son clic démarre. Le lead de la vague naît donc neuf, sans le
contexte de la préparation ; son premier geste le détache d'elle (`detach_session` sur `self`),
pour qu'elle ne soit plus réveillée à chacune de ses fins de tour (description de l'outil, lue le
2026-10-20 ; non mesuré).

### 1. Rassembler les issues candidates

Un argument borne le lot : des numéros d'issues (`#N`) → ne considérer que celles-là parmi les
`ready-for-agent` listées ci-dessous, puis le crible de l'étape 2 ; un nombre nu → c'est le degré
de parallélisme à proposer à l'étape 2.

Lister les issues prêtes :

```
gh issue list --label ready-for-agent --state open --limit 200 --json number,title,labels
```

Lire l'« agent brief » de chacune (commentaire posé par `triage`). En extraire la **liste des
fichiers/zones probablement touchés** (les briefs décrivent des interfaces et des comportements,
pas des chemins — déduire les zones du code à partir de là).

### 2. Sélectionner un lot sûr

Ne retenir que des issues :

- **sans bloqueur en attente** — vérifier le champ « Bloquée par » de l'issue / du brief ; tout
  bloqueur doit être déjà mergé.
- **à faible recouvrement de fichiers/zones** entre elles — deux issues qui touchent le même
  module sont des candidates au conflit de merge ; les exécuter en série, pas en parallèle.
- **à faible recouvrement sur les ressources à état partagées** — l'isolation par worktree ne
  couvre que le système de fichiers. Recenser les services à état que les commandes de test
  touchent (base, cache, broker, ports du compose du poste) et vérifier que chaque suite s'y
  présente sous une clé propre, sur l'**écriture et l'observation** (purges et scans compris).
  Sinon, deux issues dont les suites touchent le même magasin se recouvrent comme un fichier
  partagé : en série.

Présenter le lot proposé à l'utilisateur sous forme de tableau (issue, titre, zones touchées,
risque de recouvrement), suivi pour chaque issue de **deux ou trois phrases en langage courant**
qui disent ce qu'elle apporte à l'utilisateur final et ce qu'elle change dans le code — pas le
titre reformulé, pas le brief recopié. Puis **demander confirmation** avant de créer quoi que ce
soit. Recommander un degré de parallélisme raisonnable (souvent 2–4, ou le nombre donné en argument)
plutôt que tout d'un coup. La question nomme les sessions que l'étape 3 démarrera, demande du même
coup l'accord d'archiver chacune après le merge de sa PR (étape 8) et celui que chacune lance son
`verificateur` d'avant-go (étape 6), et, si la session lead est en
dessous d'Opus 5.5, effort `max`, de l'y passer d'abord quand une issue du lot est au barème `max`
— le lead tourne sinon à `high` : la première session fixe le plafond de
l'arbre (`sessions-liees.md`, « Héritage »). C'est la réponse à cette question qui ouvre le seul
tour où le lead peut démarrer les sessions.

### 3. Démarrer une session par issue

Dans le tour où le mainteneur valide le lot (étape 2), et dans celui-là seulement —
`start_session` est refusé dans un tour ouvert par un message de session ou par un événement
automatique (`.claude/skills/cycle-pr/references/coordinatrice.md`, « Au go du découpage ») —,
le lead se nomme d'abord `vague-<k>`, comme à l'étape 0, puis démarre d'un coup une session par
issue retenue, une par `start_session` : `initiation: user_asked`, `context: fresh`, worktree de
l'application, `wake_when_done: true`, `title: <préfixe> › #<N>` (`sessions-liees.md`,
« Identité », une racine se nomme d'abord), et pour `prompt` : le brief de l'étape 5. Le
worktree se demande en clair,
`use_worktree: true` : omis, l'outil donne à l'enfant le dossier du lead quand celui-ci travaille
dans un dossier simple (description de l'outil, lue le 2026-10-18), et les premiers gestes des
sessions basculeraient tour à tour la même branche. L'effort de chaque session suit le
barème de la coordinatrice (même référence, point 3), sous le plafond du lead (question de
l'étape 2), fixé au démarrage et jamais changé en cours de session. Le lead ne
démarre aucune session de relecture : chaque session PR démarre la sienne au go de son briefing,
dans sa fenêtre, en est le parent et la nettoie
(`.claude/skills/cycle-pr/references/session-relecture.md`).

`start_session` rend le `session_id` (`local_…`) de chaque session : c'est son identité et
l'adresse de ses messages (`sessions-liees.md`, « Identité »). Le lead l'inscrit au tableau
(étape 4), avec le `worktreePath` que `get_session` rend pour elle (mesuré le 2026-10-18 sur
deux sessions témoins, avec `branch`, `sourceBranch` et `isRunning`).

Le lead ne crée ni worktree ni branche. L'application place chaque session sous
`.claude/worktrees/`, et son premier geste crée sa branche depuis le distant
(`sessions-liees.md`, « Premier geste ») : la fraîcheur vient d'`origin/main`, sans porte à
jouer sur un `main` local.

- `<type>` = `feat` / `fix` / `chore` / `docs` / `refactor` selon la catégorie de l'issue.
- `<slug>` = description courte en kebab-case.

**Provisionner son worktree — la session le fait, juste après son premier geste.** Le lead ne
connaît pas le worktree avant le démarrage de la session. Un worktree est un checkout neuf, pas une
copie de l'environnement de travail : tout ce que git ignore en est absent. Le brief (étape 5) fait
jouer cinq gestes, dans l'ordre :

1. **Copier depuis le clone principal** (première ligne de `git worktree list`) les fichiers
   locaux ignorés par git dont les commandes du projet dépendent — ex. un `.env` lu par le
   fichier de commandes, `.claude/settings.local.json` (jetons MCP). Les repérer en croisant
   `.gitignore` et le fichier de commandes, pas de mémoire. Un refus du garde de permissions se
   signale au lead (« bloquant : … »), jamais contourné par une copie d'un modèle.
2. **Recréer les artefacts d'outillage par l'outil qui les gère** — ex. le lien de SDK posé par le
   gestionnaire de version déclaré dans « runtime + version » de `.claude/pipeline.config.md`
   (FVM, mise, asdf…). **Jamais de lien fabriqué à la main** (`mklink`, `ln -s`) : l'outil qui
   crée le lien sait aussi le défaire, un lien manuel se fait traverser à la suppression (étape 8).
   Si l'outil n'est pas résolvable depuis le shell, utiliser la surcharge que la CI emploie déjà
   plutôt que d'improviser.
3. **Installer les dépendances des piles que l'issue touche**, par la commande `install` de
   chaque pile dans `.claude/pipeline.config.md` — une pile non touchée ne s'installe pas.
4. **Commande de fumée** avant l'Étape 1 de `cycle-pr` (la commande `lint` de la config) : un
   échec « exécutable introuvable » signale un worktree non préparé, pas un défaut du code.
5. **Vérifier que chaque service à état recensé à l'étape 2 pour cette issue répond** — démon
   Docker par `docker info`, base ou broker par leur commande de santé : la fumée `lint` ne les
   exerce pas, et un échec de suite au premier test coûterait un tour de session.

**Jamais d'installation des hooks depuis un worktree** — quand la ligne `hooks` de
`.claude/pipeline.config.md` n'est pas `n/a` ; à `n/a`, aucune étape de ce skill ne lance ni ne
relance de commande `hooks`. `.git/hooks/` vit dans le répertoire git commun, partagé par tous les
worktrees et le clone principal, et le gabarit écrit par la commande `hooks` y fige un **chemin
absolu** vers l'interpréteur qui l'a installé. Lancée depuis un worktree, elle fait pointer le
hook de tout le dépôt vers un environnement qui disparaît avec le worktree — et le clone principal
refuse ensuite tout commit (« exécutable introuvable »), cassé par un worktree qu'il n'a jamais
ouvert. Les hooks s'installent une fois, depuis le clone principal ; un worktree les trouve
installés.

### 4. Tenir le tableau de bord

Maintenir un fichier `PR-PARALLELES.md` **hors du dépôt**, dans le dossier du projet qui porte
`skill-observations/` et `passations/` (chemin du journal dans `CLAUDE.md`, « Observation
continue »), et le tenir à jour à chaque changement d'état. Écrit dans un worktree, il partirait
avec lui ; le hook d'écriture du harnais refuse le clone principal à une session placée ailleurs.

```markdown
# Vague <k> — <date>

| Issue | PR | Branche | Worktree | Session | Base du verdict | État |
|-------|----|---------|----------|---------|-----------------|------|
| #51 lot 1/2 | #62 (draft) | feat/extraction-pdf | .claude/worktrees/brave-turing-1a2b3c | vague-1 › #51 › lot 1 · local_7534fbb3… | — | 🟡 en cours |
| #52 | #63 | fix/quota-upload | .claude/worktrees/calm-hopper-4d5e6f | vague-1 › #52 · local_2afdedb5…, vague-1 › #52 (relais 2) · local_9c1e0a4f… | 863d606 | 🔵 en review |
```

`<k>` est le rang de la vague : celui de l'en-tête que la vague précédente a laissé dans
`PR-PARALLELES.md` (étape 8), plus 1 — 1 sans fichier. Le lead le lit avant de se nommer
`vague-<k>` (étape 0 ou 3), puis l'écrit en tête du fichier.

Trois colonnes portent chacune une identité qu'un nom ne suffit pas à tenir :

- **Issue** — `#N lot k/n` dès qu'une issue est réalisée en plusieurs lots, une ligne par lot :
  sans le rang, une ligne mergée et une ligne en vol se ressemblent. Chaque PR de lot
  s'ouvre par `En vol pour #N (lot k/n)` ; le `Closes` va à la dernière, ou, sous une
  coordinatrice, à la PR d'intégration (`coordinatrice.md`, « Au go du découpage »).
- **Session** — le titre passé à `start_session` et le `local_…` qu'il a rendu. Le titre est un
  repère ; le `local_…` est l'adresse de `SendMessage` et la clé de `get_session` et de
  `list_events` (`sessions-liees.md`, « Identité » ; `list_events` : description de l'outil, lue
  le 2026-10-18). Une session **relayée** ajoute le sien à côté de ceux qui
  l'ont précédée au lieu de les remplacer : l'unité qui survit au relais est le cycle, et c'est
  elle qui porte la liste de ses sessions.
- **Base du verdict** — le SHA d'`origin/main` pour lequel le dernier verdict d'avant-go a été
  rendu (étape 6). Un verdict ne vaut que pour sa base : si le trunk avance, il est périmé avec
  toutes les preuves de la PR. Sans ce SHA, on relit un verdict sans savoir de quel état il parle.

États : `🟡 en cours` → `🔵 en review` → `🟢 mergée` → `⚪ worktree nettoyé`.

La colonne **PR** se remplit dès l'Étape 2 de `cycle-pr` : chaque session ouvre sa **PR draft avant
d'écrire la moindre ligne**. Le lead la lit sans rien demander aux sessions —
`gh pr list --state open --limit 200 --json number,headRefName,isDraft` relie chaque branche à sa PR. C'est ce
qui rend le lot lisible d'un coup d'œil — et détectable par `repercussions`.

**Le tableau de bord des sessions.** Un mod installé en local, hors du dépôt, affiche dans un
panneau de l'application une carte par issue : avancement, résumé, sessions rattachées. À chaque
mise à jour de `PR-PARALLELES.md`, le lead appelle `tableau_de_bord_maj`
(`mcp__tableau-de-bord-sessions__tableau_de_bord_maj`) pour la carte de chaque issue dont la ligne
a changé. Si l'outil n'est pas dans la liste d'outils de la session — ni chargé, ni trouvé par
`ToolSearch` sur son nom complet —, l'appel est sauté, sans aucun message ni erreur : la pipeline
ne dépend pas du mod.

Une carte a **un seul auteur** : la coordinatrice si l'issue en a une
(`cycle-pr/references/coordinatrice.md`), sinon le lead. Le lead ne nourrit pas la carte d'une
issue à coordinatrice, qu'il reconnaît à sa PR d'intégration, ouverte par « En vol pour #<N>
(intégration », ou au titre de sa session, terminé par `coordinatrice`.

Les champs, tous requis :

- `sujet` : `#<N>` — une carte par issue ;
- `titre` : `#<N> <titre court de l'issue>` ;
- `avancement` : de 0 à 100, par le barème ci-dessous ;
- `resume` : une phrase en langage courant, réécrite à chaque appel, qui dit l'état courant et
  quand le mainteneur doit agir — « relecture indépendante en cours, 2 constats à corriger »,
  « attend ton go », « bloquée : CI rouge sur main » ; sur le message « attend le
  mainteneur : <question> » d'une session (`sessions-liees.md`, « Messages »), « attend ta
  réponse : <question> » ;
- `sessions` : les sessions de la colonne Session de ses lignes — relais et lots compris, des
  sœurs que la chaîne de `startedBy` ne relie pas (étape 5) — et leurs descendantes, lues dans
  `list_sessions {"linked": true}` par cette chaîne, chacune en `{ titre, local_id, role }` — son
  titre (`sessions-liees.md`, « Identité »), son `local_…`, son rôle : `session PR`, `relecture`,
  `lot <k>`, `<k><x>`, `relais <r>` ;
- `etat` : la colonne État traduite — `🟡 en cours` → `en-cours`, `🔵 en review` → `en-review`,
  `🟢 mergée` → `mergee`, `⚪ worktree nettoyé` → `nettoyee`.

**L'avancement** suit l'étape `cycle-pr` de la PR, pondérée par l'effort — barème écrit une
fois, ici ; la coordinatrice y renvoie :

| Étape `cycle-pr`      | Avancement |
|-----------------------|------------|
| Étape 1 — briefing    | 10 %       |
| Étape 2 — draft       | 15 %       |
| Étape 3 — commits     | 40 %       |
| Étape 4 — relecture   | 60 %       |
| Étape 5 — ready       | 70 %       |
| Étape 6 — review + CI | 80 %       |
| Étape 7 — avant-go    | 90 %       |
| mergée                | 100 %      |

Issue en `n` lots, dont le lot `k` est en cours : `((k−1) + avancement du lot k) / n` — 3 lots, le
lot 2 à l'Étape 4 : `(1 + 0,60) / 3` ≈ 53 %.

L'étape se lit sur des signaux que le lead observe déjà, sans nouveau message entre sessions :

- aucune PR pour la branche → Étape 1 ;
- PR draft sans autre commit que l'amorce → Étape 2 ;
- PR draft avec des commits → Étape 3 ;
- PR draft avec des commits, portant des commentaires de relecture (`/code-review --comment` de
  la session de relecture) ou dont la session de relecture est au travail (`isRunning` dans
  `list_sessions {"linked": true}`) : une passe sans constat ne commente rien → Étape 4 ;
- PR draft dont le body porte `## Summary`, le body définitif de l'Étape 5 → Étape 5 ;
- PR sortie du draft → Étape 6 ;
- Notes portant le verdict d'avant-go → Étape 7 ;
- PR mergée → 100 %.

L'étape retenue est la plus haute déjà lue : une carte ne recule pas quand un signal retombe — la
session de relecture inactive entre deux passes.

Un message reçu d'une session — fin de travail, blocage — peut faire avancer l'étape ou nuancer le
`resume`.

### 5. Le brief de chaque session

Le brief est le `prompt` que l'étape 3 passe à `start_session` : la session reçoit son premier tour
avec lui. Le mainteneur n'ouvre aucune fenêtre et n'a rien à coller ; le lead ne place personne —
l'application a placé la session, et son premier geste crée sa branche.

**Session relayée.** Un cycle peut durer plus qu'un contexte. La session dont le contexte se
remplit suit la voie de `.claude/skills/cycle-pr/references/coordinatrice.md`, « Relais en cours
de lot », le lead tenant la place de la coordinatrice : elle pousse sa branche, détache sa tête,
écrit la variante « relais » de `.claude/skills/cycle-pr/references/prompt-lot-suivant.md`
(`cycle-pr` Étape 8, « Relais en cours de cycle ») et envoie au lead « relais demandé —
passation : <chemin> ». Réveillé par ce message, le lead ne peut pas démarrer la remplaçante : il la
propose par une carte de proposition (`start_session`, `initiation: own_initiative`,
`use_worktree: true`, brief : la passation), qu'un clic du mainteneur démarre ; la voie n'est pas
mesurée (même référence). Il
**ajoute** ensuite le `local_…` de la remplaçante — le `from` de son premier message, qui porte
l'identifiant de l'émettrice (mesuré le 2026-10-18 sur deux sessions témoins) — à la colonne
« Session », en gardant ceux des sessions précédentes. C'est la session sortante qui
sait que son contexte se remplit, pas le lead : sa passation porte l'adresse du lead et renvoie à
ce paragraphe.

**Une session neuve par lot, que le lead ne démarre qu'en repli** (étape 8, « Issue en plusieurs
lots »). Une issue
réalisée en plusieurs lots ne garde **pas** la même session d'un lot au suivant, ni d'un sous-lot
au suivant (`cycle-pr` 3.5 et Étape 8, « Une session neuve par lot »). Sous une coordinatrice —
ses deux cas seulement (`.claude/rules/taille-pr.md`, point 4) —, chaque lot a sa session et son
worktree neufs, et la frontière de lot passe par la passation que la session sortante remet à la
coordinatrice (`.claude/skills/cycle-pr/references/coordinatrice.md`). En lot léger, le défaut, ou
en repli, la session qui finit un lot écrit, après sa passe
`repercussions`, le prompt du lot suivant depuis
`.claude/skills/cycle-pr/references/prompt-lot-suivant.md` et le **remet au mainteneur** ;
la session neuve crée sa branche, puis envoie au lead son `local_…` (`get_session` sur `self`,
mesuré le 2026-10-18) et
sa branche. Le lead l'inscrit au tableau (étape 4), et répond par ce que lui seul sait : base du
moment, PR en vol, fichiers croisés. Le lead ne réécrit plus le prompt à chaque frontière — c'est
exactement ce qui faisait grossir son contexte.

**Le brief**, dans cet ordre :

```
Tu es la session de l'issue #N, démarrée par la session lead de la vague — ton parent, dont
l'adresse est dans ton prompt système : ton interlocuteur pour la vérification avant merge de
`cycle-pr` (Étape 7).
Premier geste, avant toute écriture :
`git fetch origin && git checkout -b <type>/<slug> --no-track origin/main`
(.claude/skills/cycle-pr/references/sessions-liees.md, « Premier geste »). Puis provisionne ton
worktree : `pr-paralleles` Étape 3, « Provisionner son worktree ».
Ne charge `task-observer` que sur demande du mainteneur (CLAUDE.md, « Observation continue »).
Lis CLAUDE.md, .claude/pipeline.config.md et ta mémoire de phase.

Porte le cycle complet de l'issue #N et délègue le code (`cycle-pr` 3.1), en invoquant le skill
`cycle-pr` (outil Skill) avec N — brief : commentaire de l'issue. Tu lances toi-même ton
`verificateur` d'avant-go (`cycle-pr` Étape 7).
Ta session de relecture se démarre à ton go, dans ta fenêtre : c'est toi qui la démarres, la
réveilles et la nettoies (`.claude/skills/cycle-pr/references/session-relecture.md`) ; le
sous-agent `relecteur` n'en est que le repli. Cette invocation de `cycle-pr` vaut demande de
l'utilisateur pour tes sous-agents.
<Si la ligne `hooks` de la config n'est pas `n/a` : ne lance pas la commande `hooks` ici — les
hooks sont partagés entre worktrees et déjà installés depuis le clone principal.>
Le garde de permissions de ta session refuse les commandes qu'il ne sait pas vérifier, sans
nommer le fragment fautif — substitution de commande dans une condition, heredoc suivi d'une
commande, boucle `for`, gabarit `--format` ou `--jq` avec accolades, `sh -c` en ligne. Une chaîne
de trois commandes `&&` n'est pas refusée en soi — mesuré en worktree isolé avec une troisième
commande **en lecture**, la forme écrivante n'ayant pas été provoquée
(`cycle-pr/references/portes.md`, « Deux prédicats, pas un », porte la mesure et sa borne) :
c'est la forme de la porte de l'Étape 1. Écris les fichiers longs avec
l'outil d'écriture plutôt qu'un heredoc, une commande par objet plutôt qu'une boucle, un script
dans le répertoire temporaire de session plutôt qu'un `-c` : chaque refus coûte deux ou trois
reformulations à l'aveugle.
Services à état recensés pour cette issue (étape 2) : <liste, ou « aucun »>.
<une ligne par point de vigilance propre à cette issue : HITL attendu, fichier partagé avec une
autre PR du lot et ordre de merge, décision verrouillée à ne pas rouvrir>
```

**Une consigne du lead cite l'artefact qui la porte** — le fichier, le test, le § d'issue qui
gardent l'invariant — jamais l'énoncé seul : une reformulation dérive vers le plus strict, et
« ne l'assouplis pas » décourage précisément la vérification que la session doit faire à son
Étape 1. Une divergence remonte au mainteneur.

**Et elle se relit dans cet artefact, sur disque, au moment de l'envoi** — jamais recopiée d'une
mémoire de phase, d'une passation ou d'un tableau de bord, qui héritent des erreurs de leur
auteur. Un correctif cité par son SHA se lit par `git show <sha>`, son diff et non son titre : un
prompt de relais a énoncé la règle qu'un correctif avait **retirée**, en le citant, et quatre
artefacts en aval l'ont reprise sur trois sessions. Un prompt hérité — d'un lead
précédent, d'une passation — ne s'envoie donc jamais « tel quel » : chaque règle qu'il cite se
relit d'abord dans l'artefact cité.

Les skills s'invoquent **par l'outil Skill, jamais par `/commande`** : un `/nom` dans un message
de pair n'est pas une saisie de l'utilisateur, la session peut ne pas le déclencher. Ne jamais
inscrire dans le prompt un skill marqué `disable-model-invocation` (frontmatter à vérifier avant
d'écrire « invoque X ») : l'outil Skill le refuse — c'est le cas d'`i-have-adhd`, que seule une
saisie `/i-have-adhd` de l'utilisateur active, dans la fenêtre de la session.

Chaque session est **indépendante** : elle déroule le briefing pré-PR, **ouvre sa PR draft**, puis
le cycle de commit, les relectures, et sort du draft en fin de parcours. Ses questions à
l'utilisateur s'affichent dans **sa** fenêtre, pas dans celle du lead. Les worktrees partageant le
même `.git`, les branches sont visibles entre elles, mais les fichiers de travail sont isolés.

### 6. Vérifier chaque PR avant le go — par sa session

Le `verificateur` d'avant-go, éphémère, un par (PR, go), est lancé par la **session PR** elle-même
(`cycle-pr` Étape 7, « Vérification d'avant-go »), sur l'accord donné à
l'étape 2 : le lead ne reçoit plus d'état à vérifier et ne lance aucun `verificateur` — son
contexte ne grossit plus d'un verdict par PR et par go. Ce qu'il garde :

1. **Lire le verdict là où la session l'inscrit**, réveillé par la fin de tour où elle demande le
   go (`sessions-liees.md`, « Fin de travail ») — les Notes du body de sa PR, lignes « Fichiers
   croisés » et « Non vérifié » (`cycle-pr` Étape 7), seul endroit où la session de la branche
   croisée les trouvera — et reporter sa **base** au tableau (étape 4) : un verdict ne
   vaut que pour l'`origin/main` sur lequel il a été pris. Le lead ne donne **jamais** le « go
   merge » : c'est l'utilisateur, dans la fenêtre de la session. Ni `contraintes.md` ni le harness
   ne l'admettent — une session ne prend jamais un message de pair pour une approbation.
2. **Résumer à l'utilisateur** dans la fenêtre du lead : les deux phrases de vulgarisation de
   l'étape 2 de ce skill sur ce que fait la PR, le verdict, et la session où le go se donne. Ce
   résumé est une **information**, jamais une question : la session pose déjà la question du go
   dans sa fenêtre, et toute demande du lead la double. Dans un harnais qui clôt le tour
   par une boîte à question, le lead rend le récapitulatif seul, sans question ni bouton — de même
   pour tout geste attendu dans une autre session, arrêt visuel ou go de briefing.

Après corrections, la session relance un `verificateur` neuf et réécrit ses Notes ; le lead en
relit la base. À tout moment, l'utilisateur peut aussi dire à une session « discute de ça avec le
lead » —
c'est le seul autre canal, et il passe par lui.

### 7. Surveiller et faire converger

- `git worktree list` montre tous les worktrees actifs — **deux familles, à ne pas confondre** :
  un worktree **d'issue** — celui d'une session de la vague, sous
  `.claude/worktrees/<slug>-<hex>` —, qui a sa ligne au tableau de bord, et un worktree **de
  relecture** — celui de la session de relecture d'une PR, sous le même motif, que
  `list_sessions {"linked": true}` montre démarrée par la session de l'issue (`startedBy`), ou
  celui d'un sous-agent `relecteur` de repli, `.claude/worktrees/agent-<id>` —, qui n'en a jamais
  et vit tant que la boucle 4.2 de sa PR n'est pas fermée. C'est l'absence de ligne au tableau qui
  le distingue, jamais un verrou git : le verrou ne tient que pendant l'invocation initiale d'un
  agent (`cycle-pr/references/session-relecture.md`, « Repli »). Le second n'est pas une dérive :
  le retirer termine la relecture et ferme la voie de la relance. Seule la session PR qui l'a
  démarré ou lancé le retire. Le `verificateur` de l'étape 6, lui, n'en crée **aucun** — il n'a pas
  d'`isolation` : un worktree par (PR, go) serait précisément le coût que son éphémérité évite.
- Quand une PR passe en review puis est mergée, mettre à jour `PR-PARALLELES.md` et la carte de
  son issue (étape 4).
- Après chaque merge, la session concernée déroule la clôture de l'Étape 8 de `cycle-pr` —
  label d'état retiré, critères d'acceptation cochés, puis la passe `repercussions` ; une session
  de lot d'une coordinatrice la borne, et la passe attend le merge de la PR d'intégration
  (`.claude/skills/cycle-pr/references/coordinatrice.md`). **C'est le
  moment le plus dangereux d'une vague parallèle** : les autres issues du
  lot sont en cours de développement, et leurs sessions ont déjà lu leur spec.
  - `repercussions` les détecte comme **« en vol »** (via les PR ouvertes et ce tableau de bord) :
    il **n'édite pas** leur corps et **ne change pas** leurs labels, il dépose un commentaire sur
    **leur PR ouverte**, que `cycle-pr` traite à son Étape 6. L'instrument qui publie ce
    commentaire et le relit après écriture est
    `.claude/skills/cycle-pr/scripts/ecriture-relue.py comment <PR> --body-file <fichier>` ;
    `repercussions` le prescrit à son étape 5, « Issues en vol ».
  - **Tenir `PR-PARALLELES.md` à jour est donc fonctionnel, pas décoratif** : une ligne périmée
    (issue mergée encore marquée en cours, ou worktree **d'issue** actif absent du tableau) fait
    mal classer une issue — et une issue en vol traitée comme dormante se fait réécrire sa spec
    sous les pieds. Un worktree de relecture absent du tableau, lui, est l'état normal.
  - Un signalement **bloquant** sur une issue du lot : le lead l'écrit à la session par
    `SendMessage` (« signalement bloquant : … — arrête-toi et remonte-le au mainteneur ») ;
    occupée, elle ne le reçoit qu'à la fin de son tour en cours
    (`.claude/skills/cycle-pr/references/sessions-liees.md`, « Messages », mesuré) : le travail de
    ce tour peut être à jeter, et un merge lancé dans ce tour n'attend pas le message — mais la
    porte de merge l'arrête : le commentaire que `repercussions` dépose sur la PR après le relevé
    du verdict fait sortir en 1 son prédicat de conversation (`cycle-pr` Étape 7, « Le go, puis le
    merge »), et un « à ajuster » la bloque comme un « bloquant ».
- **Après chaque merge du lot, avant toute consigne aux sessions encore en vol** : `git fetch
  origin`, puis croiser les fichiers **réellement mergés** avec ceux de chaque branche en vol :

  ```
  python <répertoire de ce skill>/scripts/croisement-fichiers.py <PR> <branche> [<branche> …]
  ```

  Le script rend une ligne `<fichier> → <branches>` par fichier mergé que touche au moins une
  branche, puis, pour chaque branche, le code de `git merge-tree --write-tree` contre
  `origin/main`, **prédicat** : 0 sans conflit, 1 avec, les fichiers en conflit cités. Ce 1 ne
  prouve un conflit que parce que le script valide d'abord chaque référence : `merge-tree` sort en
  1 aussi sur une référence inconnue — mesuré les 2026-10-13 et 2026-10-21, un témoin de chaque
  côté (table `FRESHNESS_GATE_FORMS` de `.claude/tests/test_agent_skills.py`). Il refuse une PR
  non mergée, et une base qui ne contient pas son merge en nommant les deux remèdes : `git fetch
  origin`, qu'il ne fait pas, ou `--base origin/<branche où la PR a été mergée>`, qu'il lit sur la
  PR. Il ne voit ni un renommage, ni un fichier qu'une branche touche hors du merge, ni un
  conflit de sens sans conflit de texte. La consigne se fonde sur ce croisement, jamais sur la
  carte de recouvrement de l'étape 2 : elle décrit des issues entières, un merge livre un lot. Le
  script ne l'envoie pas, et ne relance rien : une branche qui recouvre relance sa CI par
  `gh run rerun`, ou par fermeture-réouverture quand la porte le dit (`cycle-pr` Étape 7,
  « Rejouer les vérifications périmées ») ; ce que le run prouve se lit dans la ligne de fusion de
  ses jobs, par
  `.claude/skills/cycle-pr/scripts/porte-merge.py trunk <run> main <SHA de tête vérifié>`,
  jamais dans la référence que porte la forge, qu'aucun job n'extrait plus — pas de
  commit de fusion sur un trunk fusionné par rebase, ni de rebase
  d'une branche poussée sans demande explicite (`contraintes.md`) ; un conflit se résout par un
  commit réel sur la branche.

**Session disparue.** Le silence d'une session dont la PR est ouverte ne dit rien : une session
arrêtée et une session qui attend un go rendent le même. Son état se lit par
`get_session` sur le `local_…` du tableau — `isRunning`, `isArchived`, `lastActivityAt`, mesurés
le 2026-10-18 —, pas par `list_sessions {"linked": true}`, qui ne range pas forcément une
remplaçante démarrée par une carte de proposition parmi les sessions liées du lead (non mesuré).
Une session inactive reprend sur le message qu'on lui envoie (`sessions-liees.md`, « Messages ») ;
qu'elle reprenne aussi après un redémarrage de l'application n'est **pas mesuré**. Introuvable,
ou muette après un message, elle se traite comme perdue — règle de prudence, aucun cas mesuré.
Dans cet ordre :

1. **Mesurer les artefacts** — tête, base, CI, body de PR, worktrees : c'est ce qui est *prouvé*,
   et ça ne dépend pas d'elle. Le relevé part à un `releveur`, qui rend chaque valeur avec sa
   commande.
2. **Lire la fin de son récit** par `list_events` sur son `local_…` — un outil de session, au
   lead —,
   puis le dernier texte de ses sous-agents, que le même `releveur` extrait :

   ```
   python <répertoire de ce skill>/scripts/fin-transcript.py <transcript .jsonl> [<tours>]
   ```

   Le transcript vit sous `~/.claude/projects/<worktreePath encodé>/<uuid>.jsonl`, ses sous-agents
   dans `<uuid>/subagents/` — le dossier **du worktree** de l'application, pas celui du clone
   principal. Ce dossier sert à plusieurs sessions successives : le bon transcript est celui dont
   la dernière écriture rejoint son `lastActivityAt` (deux transcripts sous le dossier d'un même
   worktree, relevé le 2026-10-18). Le script rend les derniers tours, les messages du mainteneur
   — débarrassés des blocs que le harnais injecte — et le dernier texte de chaque sous-agent,
   « mort avant de rendre » compris.
3. **Écrire la passation en séparant prouvé et récit** : le point 1 donne le premier, le point 2 le
   second, et les mêler fait hériter la reprise d'un récit comme s'il était mesuré.
4. **Proposer d'abord de rouvrir la même conversation** — son contexte est intact, elle coûte bien
   moins qu'un relais neuf. Un relais neuf sinon (étape 5, « Session relayée »).

Un **sous-agent de fond lancé avant l'arrêt est perdu** : le relancer sur la même plage. C'est ce
qu'un incident a payé — une seconde passe de relecture partie six minutes avant l'arrêt, morte sans
rapport, et un body de PR rédigé dans le contexte sans avoir jamais été posé.

### 8. Nettoyer après merge

Une fois une PR mergée, sa branche supprimée côté distant et le message de fin de sa session reçu
(`sessions-liees.md`, « Fin de travail »), relever par `get_session` son `worktreePath`, sa
branche `claude/…` et sa `sourceBranch` — le reste de l'étape s'en sert —, puis **archiver la
session d'abord** : `archive_session` sur son `local_…`, sur l'accord demandé à l'étape 2
(`sessions-liees.md`, « Nettoyage »). Il passe dans le tour que le message de fin ouvre :
mesuré le 2026-10-18, deux archivages acceptés dans un tour ouvert par un message de session,
l'accord ayant été donné plus tôt par le mainteneur.
C'est l'archivage qui libère le dossier. Mesuré le 2026-10-18 sur deux enfants jetables :
archivé, `git worktree remove` sort en 0 et le dossier disparaît ; inactif mais non archivé, il
désenregistre le worktree, **efface tout son contenu**, puis échoue sur le dossier racine
(« Permission denied », sortie 255) — un état que la procédure ne décrit nulle part.
L'archivage ne retire ni le worktree ni les branches (`sessions-liees.md`, « Nettoyage ») : le
lead le fait ensuite.

Puis **détacher ce qui n'appartient pas au worktree** : énumérer les liens et jonctions qu'il
contient avec un détecteur qui **prouve d'abord qu'il voit** — le filtre `Where-Object LinkType`
de PowerShell a rendu une liste vide sur une jonction connue du système, et une liste vide
autorise une suppression :

```
python - <chemin du worktree> <<'EOF'
import os, stat, sys
REPARSE = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
def est_lien(p):
    st = os.lstat(p)
    return stat.S_ISLNK(st.st_mode) or (os.name == "nt" and bool(st.st_file_attributes & REPARSE))
temoin = r"C:\Documents and Settings" if os.name == "nt" else "/proc/self/exe"
assert est_lien(temoin), f"témoin non détecté : {temoin} — détecteur aveugle, ne rien supprimer"
liens = []
def illisible(e): sys.exit(f"dossier illisible : {e} — liste incomplète, ne rien supprimer")
for racine, dossiers, fichiers in os.walk(sys.argv[1], onerror=illisible):
    for nom in dossiers + fichiers:
        chemin = os.path.join(racine, nom)
        if est_lien(chemin):
            liens.append(chemin)
    dossiers[:] = [d for d in dossiers if os.path.join(racine, d) not in liens]  # jamais dans un lien
print(f"témoin détecté ; {len(liens)} lien(s) ou jonction(s)", *liens, sep="\n")
EOF
```

Le témoin est une jonction que le système possède toujours ; s'il n'est pas vu, la liste ne vaut
rien. Et **on ne descend jamais dans un lien** : un parcours qui suit une jonction vers la
ressource partagée liste ses liens internes comme « à retirer », et boucle sur une jonction vers
un ancêtre — `Path.rglob` fait les deux, mesuré. Retirer chaque lien trouvé avec la commande qui
supprime **le lien, pas sa cible**
(`cmd /c rmdir <jonction>` sous Windows, `rm <lien>` ailleurs). Une suppression récursive peut
traverser une jonction et vider la ressource partagée qu'elle vise, sans aucun avertissement.
Puis seulement :

```
git worktree remove <worktreePath de la session>
gh pr view <n> --json state,headRefOid   # MERGED, et headRefOid égal à `git rev-parse <branche>`
git branch -D <type>/<slug>
```

`git branch -d` ne satisfait qu'une fusion par commit de merge : rebase et squash réécrivent les
commits, et son contrôle « not fully merged » refuse une branche pourtant dans `main`. La preuve
est celle de la forge — PR `MERGED` et tête identique à la branche locale, donc rien de local non
poussé —, puis `-D`. Tout contrôle qui autorise une suppression se valide d'abord sur un
**témoin positif**, un cas dont la réponse « oui » est connue : `cmd && ok || ko` confond
condition fausse et commande en erreur, et c'est l'outil qu'on suspecte en premier.

**Ce contrôle-ci reste une lecture, et c'est structurel** : il compare la valeur rendue par la
forge à celle d'une référence locale, donc deux outils, ce qu'aucune commande ne porte sans
substitution — refusée par le garde d'une session isolée. Il n'est pas une porte au sens de
`cycle-pr` Étape 7 (« Le go, puis le merge »), où vit le dénombrement de la classe, et ce qu'il
garde est une suppression **locale**, récupérable par le reflog.

Puis l'**échafaudage** `claude/…` relevé avant l'archivage, derrière sa porte d'ancêtre, sa
`sourceBranch` pour `<source>` (`sessions-liees.md`, « Nettoyage »). Puis les **branches
`claude/*` orphelines** : celles qu'aucun worktree n'extrait (`git worktree list`) et qu'aucune
session non archivée ne nomme (`list_sessions`, champ `branch`). Les deux lectures comptent :
après son premier geste, l'échafaudage d'une session vivante n'est plus extrait nulle part (mesuré
le 2026-10-19 sur une session : `git worktree list` ne l'extrait plus, `get_session`
le rend encore pour elle), et seule la seconde le protège — à condition de les lire toutes :
`list_sessions` exclut la session courante et rend 20 lignes par défaut (description de l'outil,
lue le 2026-10-18), donc un `limit` qui couvre la liste, plus la branche du lead lui-même par
`get_session` sur `self`. Chacune passe par la même porte, `<source>` valant `origin/main` quand
on ne la connaît plus ; un refus se remonte au mainteneur avec
`git log --oneline origin/main..<branche>`.

Vérifier ensuite que les ressources partagées répondent encore : le dépôt principal passe sa
commande de fumée (`lint`, étape 3) et, si la ligne `hooks` de la config n'est pas `n/a`, le hook
partagé pointe toujours sur lui — le chemin d'interpréteur figé dans `.git/hooks/pre-commit`
(`grep INSTALL_PYTHON .git/hooks/pre-commit` pour pre-commit) est sous le clone principal, sinon
relancer la commande `hooks` de la config **depuis sa racine**. Un worktree supprimé qui avait
installé les hooks laisse ce chemin mort, et la vague sabote le dépôt qu'elle servait.

Marquer la ligne `⚪ worktree nettoyé` dans le tableau, et sa carte `etat: nettoyee` (étape 4).
Quand tout le lot est nettoyé, retirer le tableau de `PR-PARALLELES.md` (ou l'archiver dans les
notes du projet) et garder son en-tête : la vague suivante y lit son rang (étape 4). Puis
`tableau_de_bord_retirer` (`mcp__tableau-de-bord-sessions__tableau_de_bord_retirer`) sur le
`sujet` de chaque carte que le lead a nourrie et qu'aucune coordinatrice n'a reprise, avec le même
saut silencieux (étape 4).

**Issue en plusieurs lots.** La **branche** mergée d'un lot meurt : sous un trunk fusionné par
rebase ou squash, ses commits réécrits doubleraient dans la PR du lot suivant. Une session
démarrée par `start_session` dans son worktree — par une coordinatrice (étape 5, « Une session
neuve par lot »), ou par le lead, `use_worktree: true` écrit à chaque site — y joue un premier
geste qui part d'`origin/` : la branche morte ne l'atteint pas, et l'ancien worktree se nettoie
comme ci-dessus. Une session que le mainteneur ouvre dans le worktree d'un lot mergé, elle, est
**sur la branche morte** : `git checkout -b` sans
point de départ en emporterait les commits réécrits (mesuré le 2026-10-13 en
relecture — `cycle-pr/references/prompt-lot-suivant.md`), d'où la forme explicite —
`git fetch origin`, puis `git checkout -b <type>/<slug> origin/main` — puis la suppression de la
branche mergée, locale et distante. **Repli**, si la session sortante a disparu : le lead
reconstitue la passation (étape 7, « Session disparue »), puis démarre la session du lot suivant
comme à l'étape 3 — dans un tour du mainteneur, sinon par une carte de proposition
(`initiation: own_initiative`, `use_worktree: true`).

**Bilan de vague.** Compter les issues ouvertes pendant la vague
(`gh issue list --state all --limit 200 --search "created:>=<date de début>"`) et justifier chacune par le
barreau de `contraintes.md` « Création d'issues en cours de cycle » qui a échoué — gabarit,
catégorie et thème vérifiés. Une vague qui ouvre plus d'issues qu'elle n'en ferme est un signal à
remonter au mainteneur, pas un résultat. Vérifier aussi que chaque issue réalisée en plusieurs
lots affiche autant de PR liées que `cycle-pr` Étape 8 en attend (cas découpé) : chaque session a
obéi à « un seul `Closes` », et le trou ne se voit qu'en regardant la population.

**Revue de la règle du sujet, au bilan de la deuxième vague** (`.claude/rules/taille-pr.md`, point 8).
Le lead agrège les lignes « échappements » des bilans de cycle de la vague (`cycle-pr` Étape 8,
« Bilan chiffré du cycle ») par taille de leur PR d'origine, refait l'ajustement du coût d'une PR
— tokens contre lignes de diff, par moindres carrés —, et remonte les deux au mainteneur, qui
revoit la règle. La revue se prolonge au bilan de chaque vague suivante tant que l'échantillon
compte moins de 3 PR de plus de 1 500 lignes.

## Règles

- **Jamais deux sessions sur des zones qui se recouvrent fortement** sans le signaler — c'est la
  première cause de conflits.
- Chaque session suit `cycle-pr` à la lettre (le parallélisme ne dispense d'aucune étape, ni du
  cleanup pass verbatim).
- **Jamais d'auto-merge dans le trunk**, même en parallèle : chaque PR vers le trunk attend son
  « go » humain ; une PR de lot vers sa branche d'intégration suit `cycle-pr` Étape 7, « Le merge
  d'un lot ».
