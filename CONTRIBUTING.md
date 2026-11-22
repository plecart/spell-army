# La pipeline de développement

Ce dépôt est un projet personnel : il n'accepte pas de contributions extérieures.
Ce document décrit comment il est développé, par un humain et des agents IA ; faire tourner le
projet en local est dans [`docs/exploitation.md`](docs/exploitation.md).

Le développement suit une pipeline pilotée par les issues. **La source de vérité du process n'est
pas ce fichier** : c'est le skill `cycle-pr` (déroulé pas à pas) et les règles permanentes dans
[.claude/rules/](.claude/rules/). Ce document n'en donne que la carte.

Chaque étape ci-dessous s'invoque par le nom de son skill (`/triage`, `/cycle-pr`…) — voir
[.claude/skills/](.claude/skills/).

## Le flux en une page

Chaque maillon nomme qui l'exécute ; la répartition des rôles est dans `CLAUDE.md`,
« Orchestration ».

0. **Configurer** — `init-projet`, dans une session de dialogue, écrit `.claude/pipeline.config.md`
   (dépôt, sources de vérité, labels, stack, commandes, domaines, surfaces). À relancer dès qu'une
   de ces valeurs change.
1. **Planifier** — `vers-prd` (dialogue avec le mainteneur → PRD) → `vers-issues` (dans sa
   propre session, `#issue-prd` en argument → une issue par sujet) → `triage` (relevé, puis une session
   de tri par issue, numéro en argument : machine à états, rattachement au thème, « agent brief »),
   chacun dans une session de dialogue avec le mainteneur.
2. **Interroger** — `interroge-moi`, **obligatoire**, dans une session de dialogue — la sienne,
   numéro de l'issue en argument : `ready-for-agent` et `ready-for-human` ne s'atteignent que via
   l'état `needs-interrogation`. Les décisions tranchées sont écrites dans le corps de l'issue,
   section « Décisions », que le brief reprend — pas laissées dans une conversation.
3. **Implémenter** — `cycle-pr`, porté par la session PR, qui orchestre et délègue : briefing
   pré-PR (relevés au `releveur`, cartographie à l'`executant`) → **PR draft ouverte avant tout
   code** → un `developpeur` neuf par bloc de plus de ~50 lignes : TDD red-green-refactor, cycle
   `modif → test → cleanup → test → commit` (relecture à contexte vierge à chaque bloc, par la session
   de relecture que la session PR démarre à son go) → cleanup holistique par un `developpeur`
   neuf au-delà de 3 commits ou 150 lignes → relecture à contexte vierge finale, par la même
   session → `gh pr ready` → CI → vérif de fumée → vérification d'avant-go par le `verificateur`,
   que la session PR lance quand la PR ferme une issue ou croise une branche en vol → merge.
   Plusieurs PR en parallèle : `pr-paralleles` (la session lead démarre une session par issue,
   chacune dans un worktree de l'application, et tient le tableau
   de bord — le go reste humain, dans la fenêtre de la PR). Trop peu d'issues prêtes : son étape 0
   ouvre d'abord une session de triage et d'interrogatoire par issue, puis se termine sur la liste
   des issues prêtes et une carte « démarrer la vague » : un lead neuf la conduit — préparer et
   conduire sont deux sessions. Correctif évident (`contraintes.md`, barreau 3) : la **voie
   courte** de `cycle-pr`, sans issue ni draft, une passe de relecture, un go.
3bis. **Amender** — `contradiction`, lancé par la session de dialogue dès qu'une de ses décisions
   contredit une source de vérité (section « Sources de vérité » de
   `.claude/pipeline.config.md`) : le document est amendé par la session de dialogue qui a décidé,
   ou la décision est abandonnée — ou son effet déplacé hors de ce que le document affirme.
   Déclenché par la règle `decisions-vs-doc`, à n'importe quel moment.
4. **Répercuter** — `repercussions` après chaque merge qui la rend due (`cycle-pr` Étape 8) :
   confronte d'abord le delta à la documentation dérivée (ce que son générateur ignore → un vide)
   et aux sources de vérité (un § falsifié → `contradiction`), puis corrige la spec — corps et
   brief d'agent — des issues dont la planification est devenue fausse. Porté par la session PR en fin de
   `cycle-pr` — collecte au `releveur`, go d'édition au mainteneur dans sa fenêtre ; pour une issue
   en lots coordonnés, par la coordinatrice au merge de la PR d'intégration.
5. **Valider** — `plan-qa` → `execution-qa` → `bug-vers-issue`, chacun dans une session de
   dialogue, proposé quand un **thème se vide** de ses issues ouvertes. La QA ne re-teste jamais
   ce que la CI couvre déjà.

## Les règles qui ne se négocient pas

Voir [.claude/rules/](.claude/rules/) (chargées automatiquement à chaque session) :

- **Aucun commit cassé**, jamais d'auto-merge dans le trunk, jamais de force-push — `contraintes.md`
- **Cleanup pass verbatim** à chaque relecture (DRY / KISS / YAGNI) — `cleanup-verbatim.md`
- **Format des commits** : `type(scope): description`, préfixe EN + description FR (bots de
  dépendances exemptés de la description) ; un sujet = une issue = une PR, sans limite de lignes
  ni de fichiers, et découper exige un motif écrit avec son coût — `taille-pr.md`
- **Aucune décision ne contredit la doc en silence** : deux citations, arrêt, puis amendement ou
  abandon — `decisions-vs-doc.md`
- **Toute question a une voie** : technique, elle se tranche selon les bonnes pratiques et se
  trace ; vision, elle attend le mainteneur, groupée ; contradiction, elle arrête — `contraintes.md`

## Deux choses qui surprennent au début

- **La PR existe avant le code.** Elle est ouverte en draft dès le départ, avec `Closes #N`. C'est
  ce qui signale qu'une issue est en cours de développement — sans quoi une autre session pourrait
  réécrire sa spec en croyant que personne n'y travaille.
- **Une PR en draft n'a aucun run de CI.** Le premier part quand elle sort du draft
  (`gh pr ready`), puis chaque push en lance un. Une draft sans check n'est donc pas une CI
  cassée.
