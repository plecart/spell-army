---
name: triage
description: Trie les issues à travers une machine à états pilotée par des rôles de triage. À utiliser quand l'utilisateur veut créer une issue, trier des issues, examiner les bugs ou demandes de fonctionnalités entrants, préparer des issues pour un agent AFK, ou gérer le workflow des issues.
argument-hint: "[#issue | vide pour ce qui requiert ton attention]"
---

# Triage

Faire progresser les issues sur GitHub (via `gh`) à travers une petite machine à états composée de rôles de triage.

Chaque commentaire ou issue publié sur GitHub pendant le triage (`comment`, `issue create`) **doit** commencer par ce disclaimer — le brief d'agent, qui s'ouvre par `## Brief d'agent` sans quoi `brief write` le refuse, le porte sous ce titre, après une ligne vide ([brief-agent.md](brief-agent.md), « Modèle ») :

```
> *Généré par IA pendant le triage.*
```

## Documents de référence

- [brief-agent.md](brief-agent.md) — comment rédiger des briefs d'agent durables
- [hors-scope.md](hors-scope.md) — comment fonctionne la base de connaissances `.out-of-scope/`
- [themes-milestones.md](themes-milestones.md) — comment regrouper les issues par thème via les milestones GitHub

## Délégation

La session garde le jugement : recommander, rédiger les notes et le brief, décider avec le mainteneur, demander le go. Le reste change de main :

- **`releveur`** — le relevé des cinq catégories (« Collectes »), la lecture de l'issue, des fichiers de `.out-of-scope/` et du code autour des ancres données (« Lectures bornées »), la reproduction d'un bug (« Cases », commandes et attendus donnés), une question de bibliothèque ou une capacité de fournisseur par `context7` (« Questions de documentation ») ; une doc absente de l'index, ou plusieurs candidates, remonte à la session, qui la lit à la source ;
- **`executant`**, en isolation `worktree` — le scratch de compilation de [brief-agent.md](brief-agent.md) (« Artefacts jetables »), le fichier `.out-of-scope/` sur la branche de sa PR, nom et texte donnés par la session ;
- **script** — toute écriture sur une issue ou un thème, par sa sous-commande de `.claude/skills/cycle-pr/scripts/ecriture-relue.py`, appelée par la session elle-même : un geste isolé coûte plus délégué (`CLAUDE.md`, « Orchestration ») ;
- **sessions distinctes** — une session de tri par issue (« Invocation »), l'interrogatoire, la rédaction du brief (étape 5 de « Trier une issue spécifique »), `init-projet` en reconfiguration ; protocole commun : `.claude/skills/cycle-pr/references/sessions-liees.md`.

## Rôles

Deux rôles de **catégorie** :

- `bug` — quelque chose est cassé
- `enhancement` — nouvelle fonctionnalité ou amélioration

Six rôles d'**état** :

- `needs-triage` — le mainteneur doit évaluer
- `needs-info` — en attente d'informations complémentaires **de la part du rapporteur**
- `needs-interrogation` — triée et retenue, mais doit passer l'**interrogatoire** (`/interroge-moi`)
  avant de partir en développement
- `ready-for-agent` — entièrement spécifié, prêt pour un agent AFK
- `ready-for-human` — nécessite une implémentation humaine
- `wontfix` — ne sera pas traité

`needs-info` et `needs-interrogation` ne se confondent pas : le premier attend **quelqu'un d'autre**
(le rapporteur), le second attend **une session avec le mainteneur**. Une issue peut passer par les
deux, dans cet ordre.

Chaque issue **ouverte** triée doit porter exactement un rôle de catégorie et un rôle d'état ; une issue **fermée** n'en porte aucun — `cycle-pr` retire l'état à la clôture (Étape 8), une fermeture manuelle laisse ce geste à faire (`label <N> --remove <état>`), et `wontfix` est le seul rôle qui survit à une fermeture. Si les rôles d'état entrent en conflit, signale-le et demande au mainteneur avant de faire quoi que ce soit d'autre.

Ce sont les noms de rôles canoniques ; le mapping vers les vrais labels GitHub est dans `.claude/pipeline.config.md` — sinon s'arrêter et proposer une session `init-projet` distincte (`init-projet`, « Note pour les autres skills »).

**Les issues portant un label de nature `prd` sont hors machine à états** : ne pas les lister dans « requiert l'attention », ne jamais leur appliquer rôle d'état ni thème. Ce sont des documents parents que `vers-issues` découpe ; leurs états terminaux n'auraient aucun sens.

## Thèmes (milestones)

En plus des rôles, chaque issue qui avance dans le triage est rattachée à **exactement un thème** —
un regroupement par sujet matérialisé par un **milestone GitHub** (purement thématique, sans date).
C'est **obligatoire pour toute issue triée, sauf celles fermées en `wontfix`**.

Les thèmes ne sont pas une taxonomie à part : ils reprennent **les domaines déclarés dans
`.claude/pipeline.config.md`** (section « Périmètre »). Si aucun domaine ne couvre l'issue, ne pas
créer de thème orphelin — le signaler au mainteneur. Voir
[themes-milestones.md](themes-milestones.md) pour le choix du thème, le nommage et les commandes.

Transitions d'état :

```
(sans label) → needs-triage ─┬→ needs-info ──────────→ (retour needs-triage quand le rapporteur répond)
                             ├→ needs-interrogation ─┬→ ready-for-agent
                             │                       └→ ready-for-human
                             └→ wontfix
```

**`ready-for-agent` et `ready-for-human` ne sont atteignables que depuis `needs-interrogation`.**
Aucune issue ne part en développement sans être passée par l'interrogatoire — c'est le garde-fou
qui empêche une ambiguïté d'être découverte au cinquième commit.

Le mainteneur peut passer outre à tout moment — signale les transitions qui paraissent
inhabituelles et demande avant de continuer. Un passage en force de l'interrogatoire se **trace**
(voir « Changement d'état rapide »), il ne s'oublie pas.

## Invocation

Invoqué **sans argument**, `/triage` est la session de **relevé** : elle montre ce qui requiert l'attention (section « Montrer ce qui requiert l'attention ») et ne trie aucune issue elle-même, hors une transition sans brief ni fichier (« Changement d'état rapide »). Avec un numéro, `/triage <N>` est la session de tri de cette issue — une session de tri par issue, qui ne reçoit que le numéro (« Trier une issue spécifique »). Dans l'une comme dans l'autre, le mainteneur décrit ce qu'il veut en langage naturel : interprète la demande et agis. Exemples :

- « Montre-moi tout ce qui requiert mon attention »
- « Regardons l'issue #42 »
- « Passe l'issue #42 en ready-for-agent »
- « Qu'est-ce qui est prêt à être pris par les agents ? »

## Montrer ce qui requiert l'attention

Un `releveur` relève dans GitHub cinq catégories, des plus anciennes aux plus récentes — numéro, titre, thème et date de chaque issue ; pour `needs-interrogation`, l'état de chaque bloqueur lu dans GitHub. La session les présente :

1. **Sans label** — jamais triées.
2. **`needs-triage`** — évaluation en cours.
3. **`needs-interrogation`** — en attente d'une session `/interroge-moi` avec le mainteneur. C'est la file qui bloque l'alimentation des agents : la signaler explicitement si elle s'allonge. La présenter scindée, d'après l'état des numéros de « Bloquée par » lu dans GitHub : *interrogeables maintenant* (bloqueurs fermés) et *en attente d'un bloqueur* (le nommer) — seule la première vaut une session (étape 4 de « Trier une issue spécifique »).
4. **`needs-info` avec activité du rapporteur depuis les dernières notes de triage** — nécessite une réévaluation.
5. **Fermées portant encore un rôle d'état** — la passe de clôture de `cycle-pr` Étape 8 leur est due (`label <N> --remove <état>`, critères d'acceptation cochés par `checkbox patch`, comme à cette étape) et personne ne l'a faite, typiquement parce que le mainteneur a fermé l'issue lui-même. Seule catégorie portant sur des issues fermées ; `wontfix` en est exclu, c'est le seul rôle qui survit à une fermeture.

Affiche les décomptes et un résumé d'une ligne par issue, en indiquant le thème (milestone) de chaque issue quand il y en a un. Si le mainteneur le demande, regroupe l'affichage par thème. Laisse le mainteneur choisir : la question nomme les sessions que sa réponse démarrera. Chaque issue retenue reçoit sa session de tri, démarrée **dans ce tour** — `start_session` est refusé hors d'un tour humain — avec `initiation: user_asked`, `context: fresh`, `use_worktree: false` écrit en clair — elle lit le code dans le dossier de la session de relevé, qui n'y écrit rien —, `title: <préfixe> › #<N>` (`sessions-liees.md`, « Identité », une racine se nomme d'abord), et pour prompt `/triage <N>` et rien d'autre. Une issue `bug` reçoit au contraire son propre worktree, `use_worktree: true`, les autres paramètres inchangés : sa reproduction (étape 3) lance des commandes du projet ; son provisionnement, son archivage et son nettoyage suivent `pr-paralleles` Étape 0, « Une issue `bug` ».

## Trier une issue spécifique

C'est la tâche de la session de tri de l'issue (« Invocation »).

1. **Rassembler le contexte.** Un `releveur` rend l'issue complète (corps, commentaires, labels, milestone, rapporteur, dates), ses notes de triage antérieures, les concepts de `.out-of-scope/*.md` avec leur raison, les **domaines** de `.claude/pipeline.config.md` et les **thèmes (milestones) existants**, et l'exploration bornée du code sur les ancres que la session lui donne — glossaire métier, ADR du domaine concerné. La session en tire le reste : les questions déjà résolues, à ne pas reposer ; tout rejet antérieur ressemblant à cette issue, rapproché par concept ([hors-scope.md](hors-scope.md)) ; le domaine où rattacher l'issue plutôt que de créer un thème en double ([themes-milestones.md](themes-milestones.md)).

2. **Recommander.** Indique au mainteneur ta recommandation de catégorie, d'état et de **thème** (un milestone existant qui colle, ou un nouveau thème à créer) avec ton raisonnement, ainsi qu'un bref résumé du code pertinent pour l'issue. Attends ses instructions.

   **Plancher** (`.claude/rules/taille-pr.md`, point 2 ; même plancher que `vers-issues` §3). Une issue estimée sous ~300 lignes ne fait pas une PR à elle seule : la recommandation nomme l'issue voisine du même domaine, prête en même temps, où elle entre comme critère, sous deux gardes — (a) elle n'y apporte aucune décision ouverte ; (b) elle en ressort si l'hôte se bloque. Le correctif évident (voie courte de `cycle-pr`) et l'urgence restent hors plancher. Le mainteneur tranche ; accepté, le critère entre dans le corps et le brief de l'hôte avec sa ligne au « Journal de spec », et la petite issue se ferme sur un renvoi à l'hôte, par le déroulé de `repercussions`, « Fermer en doublon ».

3. **Reproduire (bugs uniquement).** Avant tout interrogatoire, tente de reproduire, dans le worktree de la session provisionné comme le dit `pr-paralleles` Étape 0, « Une issue `bug` » : lis les étapes du rapporteur, trace le code concerné, écris les commandes de reproduction et l'attendu de chacune ; un `releveur` les joue et rend verdict et sortie. La conclusion reste à la session — reproduction réussie avec le chemin de code, reproduction échouée, ou détails insuffisants (un fort signal de `needs-info`). Une reproduction confirmée permet un brief d'agent bien plus solide.

4. **Interroger — systématiquement.** Toute issue destinée à `ready-for-agent` ou `ready-for-human` passe par l'interrogatoire, sans exception. Ce n'est pas conditionné à ton impression que « l'issue a l'air claire » : c'est précisément quand elle en a l'air que les hypothèses tacites passent.

   - **Déjà interrogée** — en `needs-interrogation`, son corps porte la section « Décisions » ; ou, interrogée avant que la section « Décisions » existe, ses « Décisions verrouillées » consignées en commentaire — d'un brief d'agent ou d'un interrogatoire —, où la session qui rédige le brief les lit : c'est le cas « rédiger le brief », à l'étape 5. Un brief marqué `**⚠️ Non interrogée au triage**` ne compte jamais : ses « Décisions verrouillées » n'ont pas été interrogées. Des notes de triage seules ne valent jamais interrogatoire : l'étape 5 en poste à toute issue mise en `needs-interrogation`.
   - Applique `needs-interrogation` comme à l'étape 5 — thème, `label`, notes de triage. Puis, si **tous les bloqueurs de « Bloquée par » sont fermés** et que le mainteneur est disponible tout de suite, **démarre la session d'interrogatoire** dans le tour où il l'accepte : `start_session`, `initiation: user_asked`, `context: fresh`, `use_worktree: false` — elle lit le code et n'écrit que dans GitHub —, `title: <préfixe> › interrogatoire` (`sessions-liees.md`, « Identité », une racine se nomme d'abord), prompt `/interroge-moi <N>`. La tâche de la session de tri est alors finie : jamais l'interrogatoire dans la session de tri. Une session dont le brief enchaîne elle-même tri et interrogatoire — la préparation de vague, `pr-paralleles` Étape 0 — suit son brief. L'état de chaque bloqueur se lit dans GitHub (`gh issue view <n|url> --json state` — l'URL pour un bloqueur d'un autre dépôt), jamais dans la mémoire de la session.
   - **Un bloqueur encore ouvert → pas d'interrogatoire.** L'issue reste en `needs-interrogation`, annoncée *en attente de #N* : au merge de #N, `repercussions` réécrit son corps, et un interrogatoire mené avant serait à refaire sur une spec qui n'existe plus — payé deux fois, sur deux issues.
   - Si le mainteneur n'est pas disponible, **laisse l'issue en `needs-interrogation` et arrête-toi là** — elle attendra sa session. Ne la promeus pas « en attendant ».
   - **Le résultat se consigne dans l'issue**, sinon le garde-fou n'est que décoratif : la session d'interrogatoire écrit les points tranchés dans la section « Décisions » du corps par `issue edit` (`interroge-moi`, « Consigner les décisions »), les questions restées ouvertes en notes de triage par `comment`. *Une interrogation dont les conclusions ne sont pas écrites n'a pas eu lieu* — c'est `cycle-pr` qui les relira, des jours plus tard, sans accès à la session qui les a tranchées.

5. **Appliquer le résultat**, chaque écriture par sa sous-commande de `.claude/skills/cycle-pr/scripts/ecriture-relue.py`, qui la relit ; une sortie 1 — refus, ou relecture non conforme — arrête l'application et se rapporte au mainteneur :

   Sauf pour `wontfix`, **rattache l'issue à son thème** avant tout autre changement :
   `milestone attach <N> --title <Domaine> --description <périmètre du domaine>` réutilise le
   milestone du domaine, ou le crée au nom exact du domaine s'il n'existe pas encore (annonce alors
   le thème créé au mainteneur). Si aucun domaine ne couvre l'issue, arrête-toi et
   demande. Voir [themes-milestones.md](themes-milestones.md).

   - `needs-interrogation` — `label`, et les notes de triage de ce qui est déjà établi par `comment`. L'issue attend sa session d'interrogatoire ; ne rédige pas encore de brief d'agent.
   - `ready-for-agent` et `ready-for-human` — ne se posent que sur une issue déjà interrogée (étape 4) — hors passage en force (« Changement d'état rapide ») : c'est le cas « rédiger le brief » de la session de tri. Le brief reprend ses décisions ([brief-agent.md](brief-agent.md)) ; au go du mainteneur, dans sa fenêtre, `brief write` **puis** `label` — une issue n'est jamais prête sans son brief.
   - `ready-for-human` — son brief a la même structure qu'un brief d'agent, mais précise pourquoi cela ne peut pas être délégué (jugements à porter, accès externe, décisions de conception, tests manuels). Pour une issue « comptes et services tiers » : lister les capacités du fournisseur que les critères supposent, et **vérifier chacune à la source** — un `releveur` par `context7`, la session à défaut (« Délégation ») — avant de rendre la main (voir [brief-agent.md](brief-agent.md), « décisions verrouillées »).
   - `needs-info` — notes de triage (modèle ci-dessous) par `comment`, puis `label`.
   - `wontfix` (bug) — explication polie par `comment`, puis `label <N> --add wontfix --remove <état>` et `issue close <N> --reason not_planned`.
   - `wontfix` (enhancement) — `.out-of-scope/` s'écrit par une PR, que la session ouvre, relit et merge au go du mainteneur ; puis seulement `comment`, `label` et `issue close` — l'issue ne se ferme jamais sur un fichier absent du trunk. Déroulé : [hors-scope.md](hors-scope.md), « Quand écrire dans `.out-of-scope/` ».
   - `needs-triage` — `label`. Commentaire optionnel (`comment`) s'il y a un avancement partiel.

## Changement d'état rapide

Si le mainteneur dit « passe l'issue #42 en ready-for-agent », fais-lui confiance sur le **fond**. Confirme ce que tu t'apprêtes à faire (changements de rôle, commentaire, fermeture), puis agis. Dans la session de relevé, une transition sans brief ni fichier — `needs-triage`, `needs-info`, `wontfix` d'un bug — s'applique sur place, par `label`, `comment` et `issue close` comme à l'étape 5 de « Trier une issue spécifique » ; une transition vers `needs-interrogation`, `ready-for-agent` ou `ready-for-human`, ou un `wontfix` d'enhancement, part à la session de tri de l'issue (« Montrer ce qui requiert l'attention »).

**L'interrogatoire reste dû**, même en mode rapide. Trois cas :

- L'issue est déjà interrogée (étape 4) → la session de tri rédige le brief, puis applique l'état (étape 5).
- Elle n'y est pas passée → dis-le et propose la session d'interrogatoire — si ses bloqueurs sont fermés ; sinon, annonce-la *en attente de #N* (étape 4 de « Trier une issue spécifique »).
- Le mainteneur veut passer outre malgré tout → **note explicitement dans le brief d'agent que l'issue n'a pas été interrogée**, sous un titre `**⚠️ Non interrogée au triage**`, et publie-le (`brief write`) avant d'appliquer `ready-for-agent` (`label`). C'est ce qui permet à `cycle-pr` de rattraper le coup à l'Étape 1 au lieu de partir sur des hypothèses tacites.

Même en mode rapide, si l'état cible n'est pas `wontfix` et que l'issue n'a pas encore de thème, rattache-la au thème de son domaine dans la même opération, par `milestone attach`, qui le crée s'il manque ([themes-milestones.md](themes-milestones.md)).

## Modèle needs-info

```markdown
## Notes de triage

**Ce que nous avons établi jusqu'ici :**

- point 1
- point 2

**Ce dont nous avons encore besoin de ta part (@rapporteur) :**

- question 1
- question 2
```

Consigne tout ce qui a été résolu pendant l'interrogatoire sous « établi jusqu'ici » afin que le travail ne soit pas perdu. Les questions doivent être précises et actionnables, pas « merci de fournir plus d'informations ».

## Reprendre une session précédente

Si des notes de triage antérieures existent sur l'issue, lis-les, vérifie si le rapporteur a répondu à des questions en suspens, et présente un état des lieux actualisé avant de continuer. Ne repose pas les questions déjà résolues.
