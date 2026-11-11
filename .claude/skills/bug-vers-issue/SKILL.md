---
name: bug-vers-issue
description: "À utiliser lorsqu'un bug fait surface et doit être consigné comme une issue GitHub avec le contexte QA / implémentation / PRD attaché. Déclencheurs : « ouvre une issue pour ce bug », « consigne ça comme un bug », « c'est cassé, logue-le », tout échec surfacé par execution-qa que l'utilisateur veut capturer, et les rapports libres de bug en dehors d'un plan QA actif (« ce truc est faux, logue-le »). Qualifie d'abord l'échec : attendu faux, environnement et correctif évident ne deviennent pas une issue. Montre toujours un brouillon et demande confirmation avant de publier."
argument-hint: "[description du bug | #<plan-qa> <ancre de la case> <chemin ou URL de l'intake>]"
---

# Bug vers issue

Capturer un bug — découvert soit pendant l'exécution d'un plan QA, soit lors de tests libres — le qualifier et, défaut à étudier, le consigner comme une issue GitHub durable et centrée sur l'utilisateur, avec des liens explicites vers le plan QA (s'il y en a un), les issues d'implémentation, le PRD et les commits à l'origine. Montre toujours un brouillon au mainteneur et confirme avant de publier.

## Principe fondamental

L'issue de bug doit être **durable** (encore lisible après des refactos majeures), **centrée sur l'utilisateur** (décrit un comportement, pas du code), **traçable** (renvoie vers le plan / le PRD / le commit) et **sans doublon** (ne consigne pas à nouveau pour une case déjà liée à un `🔴 BUG #N`) — et elle n'existe que pour un défaut à étudier : l'échec se qualifie d'abord (étape 1). Toujours pré-publier, ne jamais publier en silence.

## Délégation

La session garde le jugement : la classe de l'échec, les questions de clarification, le choix des issues et des commits coupables, le propriétaire du sujet, issue unique ou découpage, la rédaction, le go. Le reste change de main :

- **`releveur`** — les collectes (« Collectes ») : doublons et propriétaire du sujet par `gh issue list --search` sur les mots-clés que donne la session, issues récemment fermées touchant la zone, `git log` ; les lectures bornées (« Lectures bornées ») : l'intake d'échec écrit, le corps du plan QA autour de la case — contexte des étapes 2 et 3, pas le corps que l'étape 7 patche —, l'issue d'implémentation et son PRD, le glossaire et `CLAUDE.md`, les fichiers d'automatisation qui pourraient posséder le sujet ; le retest d'un échec d'environnement (étape 1), l'action rejouée telle qu'écrite, rendue OK ou KO avec sa sortie brute. Ce qui compte reste à la session ;
- **script** — toute écriture sur la forge, par sa sous-commande de `.claude/skills/cycle-pr/scripts/ecriture-relue.py`, appelée par la session elle-même : un geste isolé coûte plus délégué (`CLAUDE.md`, « Orchestration ») — le commentaire sur une issue existante (`comment`, étape 3), la création (`issue create`, étape 6), le patch du plan QA (`issue edit --body-file`, étape 7), la réécriture d'une case ou de son marqueur (`checkbox patch --paires`, étape 1) ;
- **sessions distinctes** — cette session peut être démarrée par une autre : la session de QA (`execution-qa`), qui reprend la QA dans sa propre session, `repercussions` pour un brouillon, ou une session qui applique « Création d'issues en cours de cycle » (`.claude/rules/contraintes.md`) ; elle démarre la session `cycle-pr` de la petite PR d'un correctif évident (étape 1) ; protocole commun : `.claude/skills/cycle-pr/references/sessions-liees.md`.

## Deux points d'entrée

Le mode se lit dans l'argument :

1. **Piloté par un plan** — un numéro d'issue `qa-plan`, suivi de l'ancre de la case qui échoue et de l'intake d'échec écrit : un chemin de fichier, ou l'URL d'un commentaire de l'issue du plan. La session de QA démarre ce mode, avec l'intake qu'elle a écrit (`execution-qa`, §4).
2. **Libre** — une description du bug, rencontré en utilisant l'application. Aucun plan QA à lier.

Sans argument, la session s'arrête et demande la description ou la case.

## Procédure

### 1. Lire l'entrée, qualifier l'échec

- **Piloté par un plan** — l'intake écrit est la source : aucune question, sauf pour un champ manquant.
- **Libre** — la description de l'argument, et au plus 2 ou 3 courtes questions au mainteneur, dans cette session, centrées sur :
  - ce qu'il attendait vs ce qui s'est réellement passé ;
  - les étapes pour reproduire, si elles ne sont pas évidentes ;
  - si c'est systématique ou intermittent.

Ne sur-interroge pas. Si la description est assez claire pour qualifier, passe à la suite.

**Qualifier.** La session elle-même, jamais un équipier, range l'échec dans **une** classe, preuve à l'appui, et la montre au mainteneur avec ce qu'elle écrira, avant toute écriture — même go qu'un brouillon. **Dans le doute : défaut à étudier.** Piloté par un plan, une sortie qui touche la case s'écrit en une seule paire — l'ancienne ligne lue par la session elle-même dans le corps courant, comme à l'étape 7 —, appliquée par `python .claude/skills/cycle-pr/scripts/ecriture-relue.py checkbox patch <plan> --paires <fichier>`.

- **Attendu faux** — preuve : la source que la case cite (critère `C<k>`, spec, texte même de la case) donne l'observé. Piloté par un plan : la ligne de la case réécrite par une paire, attendu corrigé et ` 🔴 needs-issue — …` retiré ; la session de QA la rejoue à sa reprise, où `checkbox next` la retrouve. Libre : dire au mainteneur pourquoi l'observé est juste. Aucune issue.
- **Environnement** — preuve : l'intake ou un relevé nomme une cause hors du produit — outil introuvable, service arrêté, fichier verrouillé, réseau (`cycle-pr/references/tests.md`, « Échec d'outillage ≠ échec de code »). La cause levée, par le mainteneur s'il le faut, un `releveur` rejoue l'action de l'intake telle qu'écrite — le mainteneur, pour une case **Observation**. Reproduit : défaut à étudier. Non reproduit : aucune issue ; piloté par un plan, ` 🔴 needs-issue — …` retiré par une paire, et la case se rejoue à la reprise.
- **Correctif évident** — visible à la lecture des lignes, sans décision de comportement : l'attendu est déjà écrit (critère, spec, case) et le code le contredit lisiblement. La PR du parent encore ouverte, et le correctif y tient en moins d'un commit (« Création d'issues en cours de cycle », barreau 1) : il lui retourne, par le message de fin. Sinon, avant toute petite PR, la recherche du propriétaire de l'étape 3, collecte du `releveur` : si une issue ouverte possède le sujet, l'échec devient un défaut à étudier et suit les étapes 2 à 7, où l'étape 3 montre la correspondance au mainteneur. Une issue fermée n'est pas un propriétaire ; une automatisation qui possède le sujet se répare par la petite PR. Sans issue ouverte qui le possède, une petite PR par la voie courte de `cycle-pr` (barreau 3), dans sa propre session : `start_session`, `initiation: user_asked` dans un tour où le mainteneur la demande, sinon une carte de proposition, `initiation: own_initiative` ; `context: fresh`, `use_worktree: true`, le prompt décrivant le correctif et, piloté par un plan, le plan et l'ancre de la case. Aucune issue ; piloté par un plan, ` 🔴 needs-issue — …` devient ` 🔴 correctif évident — <résumé>` par une paire.
- **Défaut à étudier** — tout le reste : les étapes 2 à 7, jusqu'à l'issue.

Hors défaut à étudier, la procédure s'arrête après cette sortie et, pour une session démarrée par une autre, son message de fin (après l'étape 7).

### 2. Rassembler le contexte environnant

Utilise `references/collecte-contexte.md` comme liste de contrôle. Ses lectures et ses `git log` partent au `releveur` (« Délégation ») ; le choix du ou des coupables reste à la session. En résumé :

- **L'argument et l'intake écrit** — la description passée en argument, ou l'intake que le `releveur` rend tel quel (fichier, ou commentaire par son URL), plus les réponses du mainteneur à l'étape 1.
- **Lien vers le plan QA** (mode piloté par un plan) — numéro de l'issue, texte exact de la case qui échoue, nom de la phase / du bloc par issue.
- **Issue(s) d'implémentation** — la ou les issues qui ont introduit le comportement défaillant. En mode piloté par un plan, dérive-les du bloc par issue. En mode libre, cherche les issues récemment fusionnées touchant la zone concernée.
- **PRD** — récupère-le s'il est connu depuis l'issue d'implémentation ou le plan QA.
- **Commit(s) à l'origine** — `git log --grep="#<issue-impl>" --oneline -20` et `git log -- <chemins pertinents> --oneline -20`. Choisis le ou les coupables les plus probables ; liste-les en SHA court + message.
- **Langage métier** — lis `UBIQUITOUS_LANGUAGE.md`, `CLAUDE.md`, ou parcours la zone du code pour apprendre les termes du projet. Utilise-les dans le titre et le corps de l'issue. N'utilise pas les noms de modules internes.

### 3. Vérifier les doublons — et le propriétaire du sujet

Avant de rédiger, chercher **qui possède déjà ce sujet** : une automatisation déclarée (bot de
dépendances, workflow planifié, hook), une issue ouverte dont c'est le critère, une PR fermée qui
le portait. Si un mécanisme existe, la question devient « pourquoi n'a-t-il pas agi ? » — souvent
parce qu'on l'a fait taire — et c'est *ça* qu'on corrige. Un ticket est la façon de confier un
problème à un humain ; vérifier d'abord qu'il n'est pas déjà confié à une machine. La recherche est
une collecte du `releveur` ; la conclusion — qui possède le sujet — reste à la session. Puis :

- Si piloté par un plan, cherche dans le corps du plan QA un marqueur `🔴 BUG #<N>` près de la case qui échoue. S'il en existe un pour cette case précise, signale-le au mainteneur — ne consigne pas en silence :
  - l'issue liée est **ouverte** : la commenter (`comment <N> --body-file <fichier>`), sur son accord ;
  - elle est **fermée** : créer une issue sœur qui la cite (`issue create`, étape 6) — une issue fermée ne porte aucun rôle d'état (`triage`, « Rôles ») ; rouverte, elle serait hors de toute file de tri, et `ecriture-relue.py` n'a pas de réouverture.
- Cherche dans les issues récentes : `gh issue list --search "<termes clés>" --state all --limit 10`. Montre au mainteneur les correspondances proches avant de rédiger.

### 4. Décider : issue unique vs découpage

Privilégie l'**issue unique**. Ne découpe que lorsque :

- L'utilisateur rapporte des symptômes avec des causes racines clairement séparables que différentes personnes pourraient corriger en parallèle.
- Ou bien les corriger ensemble produirait une PR pire que de les corriger individuellement.

Sinon, consigne une seule issue. Le gabarit d'issue unique se trouve dans `references/gabarit-issue-bug.md`. Le gabarit de découpage se trouve dans `references/gabarit-issue-decoupage.md`. En mode découpage, consigne une issue parente de suivi plus des issues enfants, dans l'ordre des dépendances, pour que les bloqueurs soient référencés par de vrais numéros.

### 5. Rédiger le corps

Utilise le gabarit pertinent dans `references/`. Remplis :

- **Titre** — court, en langage métier, décrit le problème visible par l'utilisateur (pas le chemin de code). Moins de ~70 caractères.
- **Ce qui s'est passé** — comportement observé, en langage clair.
- **Ce que j'attendais** — comportement attendu.
- **Étapes pour reproduire** — concrètes, numérotées, copiables-collables.
- **Découvert pendant** — lien vers l'issue du plan QA + phase / bloc + texte exact de la case (piloté par un plan) OU « QA libre / signalé par l'utilisateur » (libre).
- **Issue(s) d'implémentation** — liens vers la ou les issues qui ont introduit le comportement.
- **PRD** — lien si connu.
- **Commit(s) à l'origine** — SHA courts + messages.
- **Preuves de l'échec** — les champs renseignés de l'intake d'échec. Supprime les champs vides, ne les laisse jamais en `<vide>`.
- **Gravité** — bloquant / majeur / mineur avec une justification d'une ligne.
- **Zone de correction suggérée** — uniquement si elle est évidente d'après l'exploration ; sinon, omets-la.

Règles pour le corps :

- Pas de chemins de fichiers, pas de numéros de ligne — ils deviennent obsolètes.
- Langage métier, pas de noms de modules internes.
- Un développeur doit pouvoir lire l'issue en 30 secondes et reproduire en 2 minutes.

### 6. Montrer le brouillon, confirmer, puis publier

Montre toujours au mainteneur le brouillon complet (titre + corps + labels) et demande : **« On le publie tel quel, on l'édite, ou on annule ? »**

Après approbation, publie :

```bash
python .claude/skills/cycle-pr/scripts/ecriture-relue.py issue create --title "<titre>" --body-file <brouillon> --label <qa-finding> --label <needs-triage>
```

`<qa-finding>` et `<needs-triage>` sont les labels réels du mapping (« Labels ») ; la sortie porte le numéro créé.

En cas de découpage : le parent d'abord, puis les enfants un par un, dans l'ordre des dépendances, chacun par son `issue create` — le corps de chaque enfant porte son parent (`## Parent`) et ses bloqueurs (`## Bloqué par`) sous les numéros que les créations précédentes ont rendus (`references/gabarit-issue-decoupage.md`).

### 7. Après la publication

- Affiche l'URL de chaque issue créée.
- Si piloté par un plan, patche le corps de l'issue du plan QA — `🔴 needs-issue` → `🔴 BUG #<nouveau-numéro>` sur la case qui échoue, et une entrée à l'**Index des constats** en bas du corps — par `issue edit <plan> --body-file <fichier>` :
  - la session lit elle-même le corps courant, juste avant le patch, dans ce même `<fichier>` (`gh api repos/{owner}/{repo}/issues/<plan> --jq .body`, sans le LF final que `--jq` ajoute) ; il ne passe par le rapport d'aucun équipier, qui pourrait en convertir les fins de ligne ou les espaces ;
  - les remplacements se font en mémoire, par correspondance exacte de ligne complète, chaque ancienne ligne trouvée une seule fois, sinon s'arrêter et le dire au mainteneur (`execution-qa/references/patch-checkbox-gh.md`, « Correspondance par ligne complète » et « Détecter les éditions concurrentes » — leurs règles de correspondance seules : sa lecture et son push sont ceux de cette étape) ;
  - l'entrée s'insère après la dernière ligne de l'Index des constats, ancrée sur sa ligne de titre, trouvée de même une seule fois ;
  - le résultat est écrit tel quel dans le fichier, ses fins de ligne gardées : le script relit contre ce fichier et ne voit pas une conversion.
- Dis au mainteneur que le bug est consigné et que le plan a été mis à jour.

**Session démarrée par une autre** (son prompt système nomme le parent, `.claude/skills/cycle-pr/references/sessions-liees.md`, « Identité ») : la sortie de sa classe faite — issue publiée ou commentée et plan patché en mode piloté, case réécrite, marqueur retiré ou remplacé, petite PR proposée —, prévenir le parent par le message de fin de la même référence (« Fin de travail »), « terminé — <livrable> », le livrable nommant la classe : « BUG #<N> consigné », « attendu faux, case réécrite », « environnement, case à rejouer », « correctif évident, petite PR proposée » ou « correctif évident, rendu à ta PR : <correctif> » — la fin du tour ne le prévient pas. Quand le parent est la session de QA, la QA reprend dans sa session, sur ce message.

## Règles du corps d'issue (tous les modes)

- **Pas de chemins de fichiers ni de numéros de ligne.**
- **Langage métier uniquement.**
- **Des comportements, pas du code** — « l'envoi de connaissance accepte un fichier de 30 Mo alors qu'il devrait le rejeter » et non « uploadHandler.ts validateSize() renvoie true à la ligne 42 ».
- **Étapes de reproduction obligatoires.** Si tu ne peux pas les déterminer, demande au mainteneur avant de rédiger.
- **Concis.** Un développeur le lit en 30 secondes et le reproduit en 2 minutes.
- **Gravité indiquée** avec une justification d'une ligne.

## Labels

- Toujours les rôles `qa-finding` et `needs-triage`. Les labels réels se lisent dans le mapping de `.claude/pipeline.config.md` : `qa-finding` y figure.
- N'applique jamais d'autres labels en silence. Si le mainteneur veut `priority/high` ou similaire, il peut l'ajouter pendant le tri.

Si l'un d'eux manque au dépôt, `issue create` refuse en le nommant : s'arrêter et le dire au mainteneur ; `init-projet`, en reconfiguration, le pose (étape 6, « Créer les labels manquants dans GitHub »).

## Erreurs courantes

| Erreur | Correctif |
|---|---|
| Consigner sans qualifier l'échec | Une classe prouvée d'abord (étape 1) : seul le défaut à étudier devient une issue ; dans le doute, défaut à étudier. |
| Consigner sans montrer le brouillon | Toujours montrer + demander « on le publie ? ». Aucune exception. |
| Consigner un doublon pour une case déjà liée | Parcours d'abord le corps du plan pour repérer `🔴 BUG #N` près de la case. |
| Inclure des chemins de fichiers et des numéros de ligne dans le corps | Ils deviennent obsolètes. Utilise le langage métier et les comportements. |
| Oublier de mettre à jour le plan QA après avoir consigné | Remplace `🔴 needs-issue` par `🔴 BUG #N` et ajoute à l'Index des constats, par `issue edit --body-file` (étape 7). |
| Découper alors qu'une seule issue suffirait | Privilégie l'unique. Découpe uniquement pour des causes racines séparables. |
| Sauter les liens vers l'issue d'implémentation / le PRD / le commit | Ce sont la trace durable. Inclus-les toujours quand ils sont connus. |
| Appliquer automatiquement de nombreux labels | Seulement `qa-finding` + `needs-triage`. Le tri ajoute le reste. |
| Rédiger sans relire l'intake d'échec écrit | Le bloc d'intake est l'entrée de la plus haute qualité dont tu disposes. Utilise-le tel quel. |
