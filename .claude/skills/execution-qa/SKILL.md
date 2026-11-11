---
name: execution-qa
description: "À utiliser pour dérouler un plan de QA créé par plan-qa — généralement une issue GitHub étiquetée `qa-plan` (ou un fichier de repli `docs/qa/qa-plan-*.md`). Déclencheurs : « lance la QA », « continue la phase QA », « déroule le plan de QA », « valide la checklist QA », « reprends la campagne QA », « faisons la QA de #N », ou toute session où l'utilisateur veut parcourir un plan en phases avec l'agent."
argument-hint: "[#issue du plan de QA]"
---

# Compagnon d'exécution QA

Accompagne l'utilisateur à travers un plan de QA existant, phase par phase, en cochant les cases directement dans le corps de l'issue du plan de QA à mesure qu'elles passent, et en routant les échecs vers `bug-vers-issue` uniquement avec une confirmation explicite de l'utilisateur. Le plan EST la trace — il n'y a pas de fichier de trace séparé.

## Principe fondamental

Chaque case basculée en `[x]` doit reposer sur une preuve observée. Chaque échec offre à l'utilisateur trois options explicites (consigner, reporter, faire corriger). Ne jamais auto-invoquer `bug-vers-issue`. **Ne jamais fusionner deux surfaces en un seul verdict** quand une seule a été réellement testée — « le service répond » ne dit rien de ce que l'utilisateur voit.

## Délégation

La session garde le jugement : le dialogue avec le mainteneur — les cases **Observation** —, le verdict de chaque case, les décisions de politique, le choix entre les options d'un échec, la rédaction de l'intake et du commentaire de phase, le démarrage des sessions. Le reste change de main :

- **`releveur`** — les cases **Commande** : la commande exacte et l'attendu du plan, tapés tels qu'écrits, la sortie lue brute, sans résumeur — la forme « test brut » de `.claude/pipeline.config.md` quand le poste en a une. Tapée telle qu'écrite, elle suit la règle des commandes que la prose fait taper (`cycle-pr/references/tests.md`, « Frontières tierces : on vérifie, on ne suppose pas »). Il rend OK ou KO par case, le code de sortie, la sortie brute si KO, et s'arrête au premier KO, qui remonte ; plusieurs cases d'un bloc partent dans un seul brief (§3, étape 2). Lui reviennent aussi l'état de l'arbre et les fichiers que les cases du bloc nomment (§2), l'état des issues des cases `🔴 BUG #N` et des PR des cases `🔴 PR #<M>` à la reprise (§2), le recoupement BD / logs (« Patrons par surface »), les commandes finales (§6) et la preuve lourde, rassemblée dans un fichier (§3, étape 6). Le verdict de la case reste à la session ;
- **script** — la prochaine case (`checkbox next`, §2), le patch des cases (`checkbox patch --paires`, §3, étape 5), le commentaire de phase et l'intake (`comment`, §3, étape 6, et §4), par `python .claude/skills/cycle-pr/scripts/ecriture-relue.py`, appelé par la session elle-même : un geste isolé coûte plus délégué (`CLAUDE.md`, « Orchestration ») ;
- **sessions distinctes** — la consignation d'un échec (`bug-vers-issue`, §4, option (a)), sa correction (`cycle-pr`, option (c)), et la reprise de la case corrigée : une session de QA neuve, démarrée sur le numéro du plan une fois la correction mergée, dont le §2 trouve la case — jamais la suite du contexte qui a corrigé ; protocole commun : `.claude/skills/cycle-pr/references/sessions-liees.md`.

## Processus

### 1. Localiser le plan de QA

Par ordre de priorité :

1. **Argument fourni** — `/execution-qa #142` → utiliser l'issue 142.
2. **L'argument est un chemin** — `/execution-qa docs/qa/qa-plan-x.md` → utiliser le fichier (mode de repli markdown).
3. **Pas d'argument** — `gh issue list --label qa-plan --state open --json number,title,createdAt --limit 20`. S'il existe exactement une issue `qa-plan` ouverte, l'utiliser. S'il y en a plusieurs, les lister et demander. S'il n'y en a aucune, chercher `docs/qa/qa-plan-*.md`. S'il n'y en a toujours aucune, dire à l'utilisateur d'exécuter `plan-qa` d'abord et s'arrêter.

L'état du plan est la forge : aucune copie locale du corps. La prochaine case se lit par le script, le bloc courant dans le corps (§2), et chaque mise à jour est un fichier de paires que le script applique au corps courant, puis relit (`references/patch-checkbox-gh.md`). En mode de repli markdown, le fichier du plan est l'état, lu et édité en place (même référence, « Mode de repli markdown »).

### 2. Établir l'état courant

- **La prochaine case** — `python .claude/skills/cycle-pr/scripts/ecriture-relue.py checkbox next <plan>` rend le titre de son bloc, puis sa ligne : la première case `- [ ]` qui ne porte ni `🔴`, ni ` — BLOQUÉ`, ni ` — accepté` (§3, étape 4, et §4). En mode de repli markdown, la première case `- [ ]` du fichier qui ne porte aucune de ces marques, lue par `Read`. Sans case en attente, passer au §6.
- **Le bloc courant** — la session le lit elle-même dans le corps, une fois par bloc, borné : ses titres par `gh issue view <plan> --json body -q .body | grep -n "^## "`, puis sa plage par `gh issue view <plan> --json body -q .body | sed -n "<début>,<fin>p"`. Elle y lit chaque case, son type — **Commande** ou **Observation**, écrit dans le plan (`plan-qa/references/gabarit-plan-qa.md`, « Types de case ») — et son état.
- **L'état de l'arbre** — au `releveur` (« Délégation »), une fois par bloc, pas une fois par case : `git status --short`, `git log -10 --oneline`, et les fichiers que les cases du bloc nomment — `CLAUDE.md`, `Makefile`, `docker-compose*.yml`, routes, composants, fixtures —, rendus tels quels. Préserver les changements de l'utilisateur ; ne jamais annuler du travail sans rapport.
- **La reprise** — les cases `🔴 BUG #N` dont l'issue est fermée par une PR (`closedByPullRequestsReferences` non vide) se rejouent (§4, option (c)) ; une issue fermée sans PR — wontfix, doublon — ne se rejoue pas. Les cases `🔴 PR #<M>` — la petite PR d'un correctif évident (§4) — se rejouent une fois leur PR mergée. La session les trouve dans le corps (`gh issue view <plan> --json body -q .body | grep -nE "🔴 (BUG|PR) #"`) ; l'état de chaque issue, et la PR qui l'a fermée, sont un relevé du `releveur` (`gh issue view <N> --json state,closedByPullRequestsReferences`), comme l'état de chaque petite PR (`gh pr view <M> --json state,mergedAt`). Passée, la ligne entière devient `- [x] <texte de la case> — corrigé par #<PR>, <date>`, **sans** `🔴 BUG #N` ni `🔴 PR #<M>`.

Résumer brièvement à l'utilisateur : quel plan, quelle phase / quel bloc est le suivant, quelle est la règle d'arrêt, quelle sera la première action.

### 3. Boucle d'exécution phase / bloc

Pour chaque phase ou chaque bloc par issue, répéter :

1. **Expliquer le bloc** en 2-3 lignes : objectif, préconditions, surfaces concernées (parmi celles que le projet possède), règle d'arrêt.

2. **Donner l'action suivante**, selon le type de la case :
   - **Commande** — au `releveur` (« Délégation ») : les cases Commande qui se suivent dans le bloc partent dans un seul brief.
   - **Observation** — le dialogue avec le mainteneur : les clics UI ou l'action exacts, l'attendu énoncé avant qu'il ne les exécute, des blocs assez petits pour qu'il examine les résultats entre les actions.

3. **Examiner les résultats observés** — le relevé du `releveur`, ou ce que rapporte le mainteneur. Comparer à l'attendu. Si quelque chose manque qui changerait la décision, le demander (code de statut, extrait de corps, ligne de console, nombre de lignes en BD). Ne pas demander de preuve qui ne change pas la décision.

4. **Décider de la case** — chaque verdict s'écrit en paire dans un fichier que le script n'a pas encore appliqué (étape 5), sauf l'échec, dont la paire part seule (§4, étape 1) :
   - **Passe** → basculer `- [ ]` en `- [x]` et ajouter une courte annotation en ligne : ` — <résumé de preuve sur une ligne, date ISO>`. Exemple : `- [x] L'utilisateur A liste ses propres ressources — 200, 3 lignes, 2026-05-08`.
   - **Passe avec décision** → basculer en `- [x]` et ajouter ` — Décision : <politique choisie>, <date>`. Enregistrer le choix de l'utilisateur ; s'il nécessite un changement de code, c'est une tâche séparée.
   - **Accepté** → un écart observé que le mainteneur accepte : laisser `- [ ]`, ajouter ` — accepté : <décision>, <date>`. La case ne passe pas, elle est réglée : `checkbox next` ne la rend plus.
   - **Échec** → voir le §4 ci-dessous (gestion des échecs).
   - **N/A** → basculer en `- [x]` et ajouter ` — N/A : <raison>`.
   - **Bloqué** → laisser `- [ ]`, ajouter ` — BLOQUÉ : <raison>`. Dire à l'utilisateur ce qui le débloque.

5. **Patcher le plan** à la fin du bloc (ou après un sous-groupe significatif au sein d'un bloc long) : une paire par case décidée, dans un fichier, appliquée par `python .claude/skills/cycle-pr/scripts/ecriture-relue.py checkbox patch <plan> --paires <fichier>` (`references/patch-checkbox-gh.md`). Un fichier par application : une paire appliquée ne se rejoue pas, et les verdicts suivants vont dans un fichier neuf. Un refus sur une ancienne ligne introuvable ou en double est une édition concurrente : rien n'est écrit — s'arrêter et le dire au mainteneur, avec la ligne la plus proche que le script nomme.

6. **Décider du statut global du bloc** et publier un commentaire de synthèse de phase quand il y a une preuve plus lourde à joindre (extraits de logs, sortie de requête BD, captures d'écran), rassemblée dans un fichier par le `releveur` : la session le rédige (`references/gabarit-commentaire-phase.md`) et le publie elle-même par `python .claude/skills/cycle-pr/scripts/ecriture-relue.py comment <plan> --body-file <fichier>`. Ces deux fichiers, la preuve et le commentaire, s'écrivent dans le scratchpad de la session, jamais dans l'arbre de la campagne : le §2 en préserve le `git status`. Sauter le commentaire pour les blocs verts triviaux.

### 4. Gérer une case en échec

Ne jamais basculer une case en échec en `[x]`. Ne jamais auto-invoquer `bug-vers-issue`. À la place :

1. Annoter la ligne ` 🔴 needs-issue — <résumé sur une ligne>`, par une paire appliquée tout de suite, seule dans son propre fichier — celui des autres verdicts attend la fin du bloc (§3, étape 5) —, pour que l'échec soit visible sur l'issue.
2. **Écrire** l'intake de l'échec avec `references/gabarit-intake-echec.md` — les champs sans contenu supprimés, pas laissés vides —, dans un fichier du scratchpad de la session, jamais dans l'arbre de la campagne (§3, étape 6), et le publier en commentaire de l'issue du plan : `python .claude/skills/cycle-pr/scripts/ecriture-relue.py comment <plan> --body-file <intake>`. Son URL se compose de l'`id` que rend la sortie : `https://github.com/<owner>/<repo>/issues/<plan>#issuecomment-<id>`. En mode de repli markdown, l'intake est un fichier hors de l'arbre de la campagne et de tout worktree éphémère, et son chemin tient lieu d'URL.
3. Offrir à l'utilisateur trois options explicites :
   - **(a) Consigner maintenant** — dans une session `bug-vers-issue` distincte, que cette session démarre dans le tour où le mainteneur choisit (a) : `start_session`, `initiation: user_asked`, `context: fresh`, `use_worktree: false` — elle lit le code de la campagne et n'écrit que dans GitHub —, `title: <préfixe> › bug` (`sessions-liees.md`, « Identité », une racine se nomme d'abord), prompt `/bug-vers-issue #<plan> <ancre de la case> <URL de l'intake>`, la forme de son `argument-hint`. Hors d'un tour du mainteneur, une carte de proposition (`initiation: own_initiative`, `context: fresh`, `use_worktree: false`, même titre et même prompt). Elle qualifie d'abord l'échec (son étape 1) : une issue ne part que pour un défaut à étudier. Le marqueur `🔴 BUG #N` et l'Index des constats, ou la case que réécrit une autre classe, la session `bug-vers-issue` les patche elle-même (ses étapes 1 et 7) : cette session ne les écrit pas, un seul auteur. La QA reprend dans cette session sur son message « terminé — <livrable> » (`sessions-liees.md`, « Fin de travail »), jamais sur sa fin de tour. Mise en avant par défaut.
   - **(b) Reporter** — laisser `🔴 needs-issue`, continuer la QA, consigner plus tard en lot.
   - **(c) Faire corriger** — la correction n'a jamais lieu dans cette session : (a) d'abord, qui qualifie ; elle passe ensuite par `cycle-pr`, dans sa propre session — une petite PR sans issue pour un correctif évident — la case marquée ` 🔴 correctif évident — …` par `bug-vers-issue`, puis ` 🔴 PR #<M>` par la session de la petite PR à sa draft (`cycle-pr` Étape 2) —, l'issue consignée pour un défaut à étudier (`references/standard-correction-bug.md`) ; la case se rejoue à la reprise (§2), jamais dans la suite du contexte qui a corrigé.

### 5. Règles d'arrêt et passation entre phases

- Respecter chaque règle d'arrêt du plan. Si une règle d'arrêt se déclenche, ne pas démarrer la phase / le bloc dépendant suivant. Dire à l'utilisateur ce qui bloque et ce qui débloquerait.
- Après que chaque phase / bloc atteint un état terminal, résumer : « Phase X — passée / partielle / bloquée. Backend : <état>. Frontend : <état>. BD / logs : <état>. Suivant : <phase Y>. »
- Ne jamais fusionner deux surfaces en un seul verdict quand une seule a été testée.

### 6. Définition du Terminé

La phase finale du plan est la Définition du Terminé explicite. En l'approchant :

- Vérifier que chaque case requise de Phase 0 / Phase 1 / par issue / Phase R est `[x]` (ou explicitement ` — N/A : <raison>`), ou laissée `[ ]` avec ` — accepté : <décision>, <date>`.
- Vérifier que chaque constat bloquant a un lien `🔴 BUG #N` (consigné) ou `🔴 PR #<M>` (petite PR), un ` — corrigé par #<PR>, <date>` (repris, §2) ou une annotation ` — accepté : <décision>, <date>`.
- Faire relancer par le `releveur` les commandes finales listées dans le plan, après toute correction mergée.
- Appliquer les dernières paires, dans un fichier neuf (§3, étape 5) : aucune décision ne reste hors de l'issue.
- Dire à l'utilisateur que la campagne est terminée et résumer l'index des constats.

## Patrons par surface

Les deux patrons ci-dessous ne s'appliquent qu'aux **surfaces que le projet possède réellement**
(déduites de `.claude/pipeline.config.md`, sections Stack et Périmètre — le plan de QA les a déjà
tranchées). Sur un projet sans interface, le patron frontend ne s'applique pas ; sur une lib sans
persistance, les vérifications de ligne non plus. Ne pas dérouler un patron pour une surface
absente, et ne pas inventer de commandes pour une couche qui n'existe pas.

### Patron service / API / CLI

- Utiliser un `$QA_RUN` frais et isolé (horodatage). Créer des utilisateurs distincts pour les tests de propriété.
- Stocker les IDs dans des variables d'environnement (`$USER_A_TOKEN`, `$DOC_A_ID`) pour que les commandes suivantes soient copiables-collables.
- Pour chaque ressource liée à un utilisateur : lecture par le propriétaire, lecture inter-locataires, jeton manquant, jeton invalide.
- Pour chaque persistance : vérification de ligne (FK propriétaire, statut, horodatages, champs d'erreur).
- Pour chaque upload : le chemin de stockage existe, la taille correspond, les originaux sont préservés.
- Pour chaque job asynchrone : état terminal (succès et échec), logs du worker bornés.
- Un 500 inexpliqué est au minimum majeur.

### Patron interface

- Indiquer à l'utilisateur l'URL, le compte et l'état du navigateur à utiliser (« vider localStorage et recharger », « activer preserve log dans DevTools »).
- Toujours demander les observations Console + Réseau.
- Vérifier l'ensemble des états : vide / chargement / succès / erreur / échoué.
- Vérifier que le détail d'erreur backend est visible, pas remplacé par un wrapper générique.
- Vérifier que les boutons sont désactivés pendant l'attente.
- Vérifier que le polling s'arrête sur les états terminaux.
- Vérifier que le rafraîchissement / la persistance du contexte se comporte comme le plan l'indique.
- Recouper BD / logs après les opérations UI.

## Décisions de politique

Quand le comportement est réellement ambigu :

1. Énoncer le comportement actuel (d'après le code).
2. Énoncer le risque.
3. Recommander une politique.
4. Demander à l'utilisateur de décider.
5. Enregistrer la décision en ligne sur la case concernée : ` — Décision : <politique choisie>, <date>` si la case passe, ` — accepté : <décision>, <date>` si l'écart est accepté sans qu'elle passe (§3, étape 4).
6. Un changement de code qu'exige la politique choisie ne se fait jamais dans cette session : c'est une tâche séparée — consignée (§4, option (a)), corrigée par `cycle-pr` —, pas une partie du cochage de la case.

## Passe finale avant de déclarer une phase terminée

Avant de répondre « phase X passée » :

- [ ] Chaque case de la phase / du bloc est `[x]` ou porte une annotation explicite de non-passage (` — N/A`, ` — BLOQUÉ`, `🔴`, ` — accepté`).
- [ ] Chaque surface **existante** du projet (service/API/CLI, interface, persistance, traitements asynchrones, artefacts) est marquée individuellement là où c'est pertinent — jamais fusionnée en un verdict unique.
- [ ] La preuve plus lourde (logs / lignes BD / captures d'écran), rassemblée par le `releveur`, est dans un commentaire de synthèse de phase publié par `comment`, pas entassée en ligne.
- [ ] Chaque échec a un lien `🔴 BUG #N` ou `🔴 PR #<M>`, un ` — corrigé par #<PR>`, OU une annotation reporté / accepté.
- [ ] Le patch du bloc est appliqué et relu par le script ; aucune paire ne reste à appliquer.
- [ ] L'Index des constats, qu'écrivent les sessions `bug-vers-issue`, porte chaque bug consigné dans cette phase.
- [ ] Aucune nouvelle erreur console / réseau / log sur les surfaces antérieures (vérification de régression).

## Erreurs courantes

| Erreur | Correction |
|---|---|
| Basculer `[x]` sans preuve observée | Toujours exiger : commande exécutée, statut / corps / ligne / log vu. |
| Fusionner deux surfaces en une seule affirmation de passage | Suivre chaque surface indépendamment, et ne rien affirmer d'une surface non testée. |
| Auto-invoquer bug-vers-issue sur un échec | Toujours proposer les trois options d'abord. Mise en avant par défaut = (a) consigner. |
| Maintenir un fichier de trace séparé | Non. Le corps du plan et ses commentaires SONT la trace. |
| Déverser d'énormes logs dans le corps du plan | Les commentaires de synthèse de phase reçoivent la preuve lourde. Le corps garde les annotations en ligne courtes. |
| Patcher le corps à la main, ou depuis une copie locale | Une paire par case, appliquée au corps courant par `checkbox patch --paires` — voir `references/patch-checkbox-gh.md`. |
| Écrire `🔴 BUG #N` ou l'Index des constats depuis cette session | La session `bug-vers-issue` les écrit, seule (§4, option (a)). |
| Démarrer la phase suivante alors qu'une règle d'arrêt est active | Respecter la règle d'arrêt jusqu'à ce que l'utilisateur accepte explicitement l'exception. |
| Corriger un bug dans la session de QA | Jamais : (a) qualifie ; la correction passe par `cycle-pr`, dans sa propre session, en petite PR ou sur l'issue consignée (c). |
