---
name: vers-prd
description: Transforme le contexte de la conversation actuelle — le dialogue avec le mainteneur dans cette session — en PRD et le publie sur le dépôt GitHub du projet. À utiliser lorsque l'utilisateur veut créer un PRD à partir de ce dialogue.
argument-hint: "[périmètre du PRD — vide pour tout le contexte courant]"
---

Ce skill prend le contexte de la conversation actuelle — le dialogue avec le mainteneur dans cette session — ainsi que la compréhension de la base de code et produit un PRD — sur le périmètre passé en argument, ou sur tout le contexte courant sans argument. Ne pas interroger l'utilisateur sur le **contenu produit** — c'est une synthèse de ce qui est déjà su. Le **seul** point de validation est celui de l'étape 2 (liste des modules et périmètre de tests), présenté **en une fois**, avec une recommandation par question. Si le contexte est un corpus documentaire clos, les interprétations posées (là où deux documents semblent diverger) font partie de cette validation unique.

Le dépôt GitHub et le mapping de labels doivent être dans `.claude/pipeline.config.md` — sinon s'arrêter et proposer une session `init-projet` distincte (`init-projet`, « Note pour les autres skills »).

## Délégation

La session garde la synthèse, la rédaction du PRD et la validation unique de l'étape 2. Le reste change de main :

- **`releveur`** — la lecture du dépôt (étape 1, « Lectures bornées ») et toute question de bibliothèque par `context7`, rendue en passage cité : l'étape 2 cite ce qui a été vérifié ;
- **`executant`**, en isolation `worktree` — le fichier d'archive non normatif (« Règle de rédaction ») ;
- **script** — la publication, par `python .claude/skills/cycle-pr/scripts/ecriture-relue.py <sous-commande> …` (`issue create`), qui relit ce qu'il écrit ;
- **session distincte** — `vers-issues` (étape 4) ; protocole commun : `.claude/skills/cycle-pr/references/sessions-liees.md`.

## Process

1. Si ce n'est pas déjà fait, un `releveur` rend les modules, le glossaire et les ADR de la zone, sur les ancres que la session lui donne ; la session en tire l'état actuel du codebase. Utilise le vocabulaire du glossaire métier du projet tout au long du PRD, et respecte les ADR existants dans la zone que tu modifies.

2. Esquisse les principaux modules que tu devras construire ou modifier pour mener à bien l'implémentation. Cherche activement les opportunités d'extraire des modules profonds (deep modules) qui peuvent être testés de manière isolée.

Un module profond (par opposition à un module superficiel) est un module qui encapsule beaucoup de fonctionnalités derrière une interface simple, testable et qui change rarement.

Vérifie avec l'utilisateur que ces modules correspondent à ses attentes. Vérifie avec l'utilisateur pour quels modules il souhaite que des tests soient écrits. La question de validation nomme la session que sa réponse démarrera (étape 4).

Toute recommandation dont l'argument repose sur *ce que fait* une bibliothèque ou un outil (« le rendu côté front insère de l'HTML, donc… ») est vérifiée contre sa documentation à jour — un `releveur` la lit par `context7` et rend le passage cité — **avant** d'être présentée, et la ligne de reco cite ce qui a été vérifié (« vérifié : X rend des éléments, sans insertion d'HTML »). Une reco fondée sur la sécurité n'y échappe pas : c'est celle qu'on conteste le moins, donc celle qui trompe le plus longtemps.

3. Rédige le PRD en utilisant le template ci-dessous, puis publie-le sur le dépôt GitHub du projet : `issue create --title <titre> --body-file <fichier> --label <label>`, dont la ligne de sortie porte le numéro du PRD. Le label est celui de nature `prd` (mapping dans `.claude/pipeline.config.md`) — **ni rôle d'état, ni thème** : un PRD est un document parent que `vers-issues` découpe sans jamais le modifier ni le fermer ; la machine à états de `triage` est conçue pour des unités de travail (un état, un thème) et ne sait pas le faire avancer. Un PRD étiqueté `needs-triage` resterait indéfiniment dans la file « requiert l'attention ».

**Règle de rédaction — l'état courant seul.** Un PRD est lu par des agents, et un agent n'a pas de mémoire de lecture : tout ce qui figure dans le document est vrai au même titre. Écrire chaque section à la voix affirmative, sans date de révision, sans bloc « Avant / Après », sans mention de ce qui a été envisagé puis abandonné. Quand une révision est intégrée plus tard, réécrire le passage **comme s'il avait toujours été ainsi**, et chercher toutes les occurrences de la valeur révisée avant de clore. Le raisonnement et l'historique vivent dans un fichier d'archive séparé, marqué non normatif : le fichier d'archive s'écrit par une PR — un `executant` l'écrit sur une branche, puis la session ouvre la PR, la relit et la merge au go du mainteneur, au déroulé de `triage/hors-scope.md` (« Quand écrire », étapes 5 et 6) ; rien n'attend ce merge, pas même la publication du PRD ; jamais un commit direct sur le trunk. Une justification garde sa place tant qu'elle explique pourquoi la règle actuelle est celle-là ; elle part dès qu'elle explique pourquoi elle a changé.

4. **Passer la main.** `vers-issues` part du PRD publié, dans sa propre session : dans le tour où le mainteneur valide l'étape 2, une fois la publication relue, `start_session`, `initiation: user_asked`, `context: fresh`, `use_worktree: false`, `title: <préfixe> › vers-issues #<n>` (`sessions-liees.md`, « Identité », une racine se nomme d'abord), prompt `/vers-issues #<n>` — `<n>` le numéro du PRD.

<prd-template>

## Énoncé du problème

Le problème auquel l'utilisateur est confronté, du point de vue de l'utilisateur.

## Solution

La solution au problème, du point de vue de l'utilisateur.

## User Stories

Une LONGUE liste numérotée de user stories. Chaque user story doit être au format :

1. En tant que <acteur>, je veux <fonctionnalité>, afin de <bénéfice>

<user-story-example>
1. En tant que client mobile d'une banque, je veux voir le solde de mes comptes, afin de prendre de meilleures décisions concernant mes dépenses
</user-story-example>

Cette liste de user stories doit être extrêmement exhaustive et couvrir tous les aspects de la fonctionnalité.

## Décisions d'implémentation

Une liste des décisions d'implémentation qui ont été prises. Cela peut inclure :

- Les modules qui seront construits/modifiés
- Les interfaces de ces modules qui seront modifiées
- Les clarifications techniques apportées par le développeur
- Les décisions architecturales
- Les changements de schéma
- Les contrats d'API
- Les interactions spécifiques

N'inclus PAS de chemins de fichiers spécifiques ni d'extraits de code. Ils risquent de devenir obsolètes très rapidement.

## Décisions de test

Une liste des décisions de test qui ont été prises. Inclus :

- Une description de ce qui fait un bon test (ne tester que le comportement externe, pas les détails d'implémentation)
- Quels modules seront testés
- Les exemples existants sur lesquels s'appuyer (c.-à-d. des types de tests similaires dans la base de code)

## Hors périmètre

Une description de ce qui est hors périmètre pour ce PRD.

## Notes complémentaires

Toute note complémentaire concernant la fonctionnalité.

</prd-template>
