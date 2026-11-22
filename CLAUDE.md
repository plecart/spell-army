# Pipeline de développement

Ce projet suit une pipeline de dev pilotée par les issues. Le cycle de réalisation d'une PR est
décrit dans [CONTRIBUTING.md](CONTRIBUTING.md) et exécutable via le skill `cycle-pr`.

## Règles permanentes (toujours actives)

Les fichiers de `.claude/rules/` — sans frontmatter `paths:`, qui les rendrait conditionnels — sont
chargés à chaque session, au même rang que ce fichier :
`contraintes.md`, `taille-pr.md`, `cleanup-verbatim.md`, `decisions-vs-doc.md`.

## Configuration du projet

`.claude/pipeline.config.md` est la **source unique** pour : le dépôt GitHub, le mapping de labels,
la stack, les **commandes du projet** (test / lint / format / typecheck / build), les seuils de
qualité, les **sources de vérité**, les **domaines**, les **zones sensibles** et les **surfaces
exposées**. Ne jamais deviner une commande ni un label — les lire là. Pour créer ou modifier ce
fichier : skill `init-projet`.

Les **sources de vérité** (documents de référence, puis les issues ouvertes) y sont classées par
**rang de normativité**. C'est cette table que lisent la règle `decisions-vs-doc` et le skill
`contradiction` : une décision qui contredit un rang s'arrête, et soit elle est abandonnée — ou
son effet déplacé hors de ce que le document affirme —, soit le document est amendé par la session
de dialogue qui a décidé (`decisions-vs-doc.md`, « Deux sorties »).

Les **domaines** servent aussi de thèmes (milestones GitHub). Les **surfaces visibles par un
utilisateur** déclenchent la vérif de fumée avant merge et la proposition de campagne QA en fin de
thème — si ce champ est vide, ces deux propositions ne se déclenchent jamais.

## Vocabulaire

Utiliser le glossaire de domaine du projet (`UBIQUITOUS_LANGUAGE.md` s'il existe) dans les
noms de tests, les titres d'issues et de PR. Respecter les ADR de la zone touchée. Les noms de tests
sont à qui les écrit — le `developpeur`, ou la session dans la tranche qu'elle spécifie à
l'`executant` ; les titres d'issues et de PR, à la session de dialogue.

## Documentation des bibliothèques

Pour toute question sur une lib/framework de la stack (API, config, migration de version),
**utiliser en priorité le serveur MCP `context7`** plutôt que la mémoire ou une recherche web :
il renvoie la doc à jour de la lib demandée, ce qui économise des tokens et évite les réponses
périmées. Installé par `init-projet` (`claude mcp list` pour vérifier). La session l'a ; parmi les
rôles, ceux dont la liste `tools:` le porte — `developpeur`, `relecteur`, `releveur` ; un rôle qui
ne l'a pas remonte la question à son appelant.

## Minimalisme (`ponytail`)

Invoquer le skill `ponytail` **avant d'écrire du code** — écriture, ajout, refactor, correctif,
choix d'une dépendance ou d'une lib. Sa description seule ne suffit pas à le déclencher de façon
fiable : c'est cette ligne qui l'active. Aligné sur la doctrine KISS/DRY/YAGNI de
`.claude/rules/contraintes.md`.

Niveau par défaut : `full`. Se change par `/ponytail lite|full|ultra` et persiste jusqu'à la fin
de la session. Un sous-agent ne le charge pas par l'outil Skill : le `developpeur` le lit (`Read`)
au niveau que nomme son brief — le niveau voyage dans le brief —, et la tranche d'un `executant`
arrive déjà minimale de la session qui l'a spécifiée. Ponctuellement : `/ponytail-review`
(relecture anti-sur-ingénierie d'un diff), `/ponytail-audit` (dépôt entier), `/ponytail-debt`
(raccourcis marqués `ponytail:` à reprendre).

**Ce qu'il ne simplifie jamais** : validation aux frontières de confiance, gestion d'erreurs qui
évite une perte de données, sécurité, accessibilité, et tout ce qui est explicitement demandé.
Il raccourcit la solution, jamais la lecture : tracer le flux complet avant de choisir un barreau.

`ponytail` gouverne **ce qu'on construit** ; `.claude/rules/cleanup-verbatim.md` gouverne **la
relecture de ce qui a été construit**. Les deux s'appliquent, à des moments différents — ponytail
en amont de l'écriture, le prompt de relecture après. L'un ne dispense pas de l'autre.

## Observation continue (`task-observer`)

Invoquer le skill `task-observer` **sur demande du mainteneur** — jamais d'office au début d'un
cycle de PR, d'un audit ou d'une passe de spec ; son coût résident se paie à chaque tour.
**Seule une session** l'invoque et tient le plafond ci-dessous ; un sous-agent remonte ses
observations candidates dans son rapport, et la session qui l'a lancé décide de les consigner.

**Seuil de consignation — haut.** Ne consigner que ce qui changerait le comportement d'un skill :
une règle violée de façon répétée, une correction de l'utilisateur qui se généralise, un manque
rencontré sur plusieurs sessions. Une friction isolée ne se consigne pas. **Maximum 3 entrées par
cycle** — une PR, relais compris, la passation de relais portant le compte déjà écrit ; hors PR,
une session. Au-delà, ne garder que les plus fortes. **Plafond de 10 entrées OPEN** dans le
journal : au-delà, la prochaine entrée s'écrit après une revue qui en ferme au moins autant. Une
revue se fait par thème — un skill —, jamais entrée par entrée.

**Ne jamais interrompre pour le journal.** Pas de proposition de revue spontanée, pas de résumé
d'observations en fin de session, pas de relance sur le retard de revue. Le journal ne se surface
que si l'utilisateur le demande explicitement.

Au chargement de **n'importe quel skill**, consulter le journal d'observations pour les entrées
OPEN rattachées à ce skill et en appliquer les enseignements au travail en cours — même si le
fichier du skill n'a pas encore été mis à jour. Un sous-agent ne lit pas le journal : la session qui
le lance met dans son brief les entrées OPEN qui touchent son bloc.

**Emplacement du journal, à ne pas laisser deviner :** `~/.claude/projects/E--Projets-Wizard-Army-v2/skill-observations/log.md`. C'est un
chemin **stable**, hors du dépôt. Ne jamais l'ancrer sur le répertoire courant : `pr-paralleles`
travaille dans des **git worktrees** éphémères, et un journal écrit là disparaît avec le worktree.

## Orchestration — une tâche par session, des équipiers par rôle

**Une tâche par session.** La session de dialogue — la session PR dans un cycle ; hors cycle,
celle de `triage`, d'`interroge-moi` ou de `vers-issues` ; le lead d'une vague, la coordinatrice
d'une issue en lots coordonnés (`.claude/rules/taille-pr.md`, point 4) — garde ce qui demande le
plus de jugement : briefing, planification, arbitrages `decisions-vs-doc`, dialogue avec
l'utilisateur, merge et clôture. Le reste part dans
un contexte neuf qui meurt avec sa tâche : un équipier défini dans `.claude/agents/`, une session
liée, ou un script quand le geste revient à l'identique d'un cycle à l'autre. **Le modèle n'est
pas choisi par tâche, il est choisi par rôle** au moment de créer l'équipier :

| Rôle | Modèle | Confier |
|---|---|---|
| `developpeur` | Opus, effort `high` | l'implémentation TDD d'un bloc borné et sa doc descriptive (`xhigh` à l'appel quand il écrit des tests), la correction de tests rouges |
| `relecteur` | Opus, effort `high` | le protocole de relecture à contexte vierge d'un diff (`cycle-pr` 4.2), suivi par la session de relecture de la PR dans son propre worktree — sous-agent en repli |
| `executant` | Sonnet, effort `high` | codage et commit d'une tranche entièrement spécifiée (`xhigh` à l'appel quand elle écrit des tests), cartographie du code, passes mécaniques, mise en place d'`init-projet` |
| `releveur` | Haiku, effort `medium` | relevés sans décision : tests, lint, format, croisements, édits verbatim, écritures distantes verbatim |
| `verificateur` | Opus, effort `medium` | la vérification d'avant-go d'une PR (`cycle-pr` Étape 7), **éphémère, un par (PR, go)**, sans worktree et sans lancer de commande du projet |

**Trois axes par rôle, chacun dans son frontmatter.** Le **mandat** — ce que le rôle peut
trancher — choisit le modèle : **ce qui rend un rôle éligible au modèle le moins cher, c'est un
mandat sans aucune décision**, pas une tâche qui paraît facile. Chaque rôle dit en tête de son
fichier s'il tranche. L'**effort** (`effort`) est la profondeur de réflexion : un rôle sans
décision peut en porter un élevé, qui paie alors de la vérification et non de l'architecture. La
**liste `tools:`** fixe le plancher. Les chiffres de cette section ont été mesurés sur le projet
d'origine de la graine, pas sur celui-ci : 26 à 31 K de contexte au premier appel pour les quatre rôles
mesurés — `releveur`, `executant`, `developpeur`, `relecteur`, le 2026-10-20, avant que le
`releveur` reçoive ses deux outils `context7` ; lui re-mesuré à 32,3 K le 2026-10-28 —, contre
74,5 K pour `general-purpose` sans liste, sur Haiku (mesuré le 2026-10-19).
Le `releveur`, seul rôle à porter `omitClaudeMd: true`, démarre en outre sans `CLAUDE.md` ni les
règles de `.claude/rules/` (doc des sous-agents, lue le 2026-10-28) : 11,4 K au premier appel
contre 32,1 K sans lui à la même sonde (même définition, 2026-10-28).
Déléguer à un rôle sans
décision suppose que la session ait écrit la tranche entièrement — fichiers, signatures, tests
attendus, comportement — avant l'envoi : si la spécifier demande encore de réfléchir, c'est son
travail. L'effort d'une session PR se fixe à son démarrage — le brief de `start_session`, ou
`/effort` avant le briefing — et ne change plus en cours de session ; la
coordinatrice et le lead ne reçoivent `/effort max` qu'au go, avant tout enfant, quand le barème
le demande (`cycle-pr/references/coordinatrice.md`, « Au go du découpage »).

**Le brief porte ce que l'équipier ne charge pas.** Un sous-agent ne voit jamais la conversation
de sa session : son brief porte le bloc, le niveau `ponytail` (« Minimalisme »)
et les entrées OPEN du journal qui le touchent (« Observation continue ») ; `task-observer` reste
aux sessions.

**Un sous-agent arrêté se reprend par message** — `SendMessage`, avec la réponse, dans son propre
contexte (mesuré le 2026-10-20 sur un `developpeur`) : jamais un équipier
neuf pour une retouche de la même tranche, un neuf au bloc suivant.

**Une commande ponctuelle se lance soi-même, et sous 50 lignes de diff sans module ajouté, la
session code elle-même** (`cycle-pr` 3.1). Un équipier démarre à son plancher ; le déléguer
coûte plus qu'un `git status` ou un test isolé. La délégation ne paie que pour un **bloc de
travail** — une tranche d'issue, une suite à faire passer au vert, une cartographie : à partir de
2 appels pour Haiku ou Sonnet, de 4 pour Opus (calculé ; non mesuré en situation).

**Lire borné.** Session ou sous-agent, localiser d'abord (`grep -n`), puis lire la plage (`Read`
avec `offset` et `limit`) : jamais un fichier entier pour une fonction, une section ou une ligne.
Ce qui est lu reste dans le contexte, relu à chaque appel suivant.

Un rôle ajouté ou modifié dans `.claude/agents/` n'est visible qu'à une session **neuve** : la
reprise d'une conversation garde la liste de son démarrage (mesuré le 2026-10-20), et une
session que l'application démarre dans un de ses worktrees lit les rôles de la copie principale
(mesuré le même jour). Repli : `general-purpose` avec le modèle du rôle, pour un rôle
**sans** liste `tools:` seulement — il rendrait à un rôle à outils réduits tous les outils et un
plancher de 74,5 K sur Haiku ; celui-là se lance depuis une session neuve.

**Sessions liées.** Les équipiers ci-dessus sont des sous-agents d'une session. Une session peut
aussi en démarrer d'autres, complètes, dans l'application de bureau (`start_session`) : le lead
d'une vague `pr-paralleles`, une par issue — à son étape 0 pour la trier et l'interroger, puis
pour la développer ; la coordinatrice d'une issue en lots coordonnés, une par lot et une par
sous-lot — **un sous-lot est un lot** ; la session PR, une session de relecture par PR, au go de son briefing
(`.claude/skills/cycle-pr/references/session-relecture.md`).
Leur protocole — héritage, identité, premier geste, messages, fin de travail, passation,
nettoyage — vit dans `.claude/skills/cycle-pr/references/sessions-liees.md`, seule source.

## Skills de la pipeline

Chaque skill s'invoque par `/<nom>` (`/triage`, `/cycle-pr`, `/plan-qa`…) ou se déclenche
automatiquement sur sa description.

| Commande | Rôle |
|---|---|
| `/init-projet` | Setup et reconfiguration de la pipeline |
| `/vers-prd` | Dialogue → PRD |
| `/vers-issues` | PRD/plan → issues |
| `/triage` | Machine à états + thèmes + brief d'agent |
| `/interroge-moi` | Lever les ambiguïtés d'un plan |
| `/cycle-pr` | Cycle complet d'une PR (TDD → merge) |
| `/contradiction` | Une décision contredit la doc → amende le document, puis propage |
| `/repercussions` | Impact d'un merge sur les sources de vérité (→ `contradiction`) et la documentation dérivée, puis sur les issues ouvertes |
| `/pr-paralleles` | Plusieurs PR en parallèle (worktrees), vague préparée si trop peu d'issues sont prêtes |
| `/plan-qa` | Écrire un plan de QA |
| `/execution-qa` | Dérouler le plan de QA |
| `/bug-vers-issue` | Consigner un bug en issue |
| `/audit-spec-ui` | Audit mécanique d'une spec d'interface ou d'un document normatif |
| `/schema-architecture` | Schéma d'architecture d'un projet en image carrée |
