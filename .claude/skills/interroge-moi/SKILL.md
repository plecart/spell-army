---
name: interroge-moi
description: Interroger l'utilisateur sans relâche sur un plan, une issue ou un design jusqu'à atteindre une compréhension partagée, en résolvant chaque branche de l'arbre de décision, puis consigner les décisions tranchées. Passage obligé de la pipeline — c'est ce qui fait sortir une issue de l'état needs-interrogation. À utiliser quand l'utilisateur veut stress-tester un plan, se faire cuisiner sur son design, ou mentionne « interroge-moi » ou « cuisine-moi sur ce plan ».
argument-hint: "[sujet, #issue ou plan à stress-tester]"
---

# Interroge-moi

Interroge l'utilisateur sans relâche sur chaque aspect du plan jusqu'à atteindre une compréhension
partagée. Descends chaque branche de l'arbre de décision, en résolvant les dépendances entre les
décisions une par une.

- **Une question à la fois.** Une question accolée en fin de message — même binaire, même « au
  passage » — n'est pas lue : le lecteur répond à la dernière chose qui a demandé de l'effort, et
  une question secondaire n'est pas une question plus petite, c'est une question invisible. Si
  une décision reste en suspens, elle a droit à son propre tour, et à rien d'autre dans ce tour.
  Ce n'est pas le contraire du groupement des `[V]` de la règle d'or (`contraintes.md`) : le
  groupement porte sur le **moment** — un point d'arrêt, jamais le fil de l'eau —, cette règle sur
  la **forme** — dans ce point d'arrêt, une question par tour, la plus lourde d'abord. Un arrêt
  `[C]` ouvre seul, son pour et son contre déjà pesés ; les `[V]` suivent une fois la `[C]`
  tranchée.
- **Chaque question s'accompagne de ta réponse recommandée** — interroger n'est pas se décharger de
  l'analyse sur l'utilisateur.
- **Si une question peut être résolue en explorant le code, fais explorer le code** plutôt que de
  demander : un `releveur` rend le code autour des ancres que la session lui donne ; la réponse
  reste à la session.

## Délégation

La session garde les questions, ses recommandations et les décisions prises avec le mainteneur.
Le reste change de main :

- **`releveur`** — ses « Lectures bornées » : le code autour des ancres d'une question, et le
  `grep` des sources de vérité sur les ancres de toutes les décisions, en un lot (« Consigner les
  décisions ») ; la mesure d'une porte (« Avant de verrouiller ») ;
- **`executant`**, en isolation `worktree`, jamais dans le dossier partagé où la session a été
  démarrée (`use_worktree: false`) — la contre-épreuve à fabriquer, un de ses « Artefacts
  jetables » : le composant présenté sous une forme que l'outil analyse ; toute écriture de dépôt
  qu'un interrogatoire exige — l'amendement d'un document par `decisions-vs-doc` (« Deux
  sorties ») ou `/contradiction` —, qui part par une PR que la session ouvre, relit et merge au
  go du mainteneur, au déroulé de `triage/hors-scope.md` (« Quand écrire », étapes 5 et 6) ; la
  ligne de « Décisions » qui l'exige ne s'écrit qu'une fois la PR mergée — sans go, le point
  reste une question ouverte ;
- **script** — les décisions écrites dans le corps de l'issue (`issue edit`), les notes de triage
  (`comment`), par `python .claude/skills/cycle-pr/scripts/ecriture-relue.py <sous-commande> …`,
  qui relit ce qu'il écrit ;
- **sessions distinctes** — la session de tri qui rédige le brief (« Consigner les décisions »),
  puis la session PR ; protocole commun : `.claude/skills/cycle-pr/references/sessions-liees.md`.

## Réponse « quelles sont les bonnes pratiques ? »

Cette réponse est le signal d'une question de **voie T** (`.claude/rules/contraintes.md`, règle
d'or) — une question qui ne devait pas être posée : l'interrogatoire ne porte que sur les `[V]`
et les `[C]`, et une `[T]` se tranche avec son cadre sourcé, dans le brief, sans être posée. À la
première réponse de ce type, **reclasser toutes les questions qui restent** avant de continuer.

Quand l'utilisateur répond à une question par « fais selon les bonnes pratiques » (ou équivalent),
il demande le **cadre**, pas une opinion. Répondre en deux temps : (1) l'état de l'art en 3-5
points nommés ; (2) chaque point confronté aux contraintes écrites du projet (rules, cadrage,
décisions closes), avec retenu/écarté. Puis :

- **S'il a annoncé en ouverture qu'il délègue** (« choisis selon les bonnes pratiques ») → donner
  le cadre pour la traçabilité et **verrouiller la recommandation dans le même tour**, sans
  reposer la question. Consigner la décision comme « déléguée sur reco ».
- **Sinon** → reposer la question une fois. Si la même réponse revient, verrouiller et le dire.
  **Jamais de troisième tour** : une réponse identique à une question reposée n'est pas une
  nouvelle information, c'est le signal que la boucle doit se fermer.

## Une option que l'utilisateur ne peut pas évaluer n'est pas une décision

Avant de poser un arbitrage, vérifier si la décision dépend d'un savoir que l'interlocuteur peut
ne pas avoir — coût récurrent, terme technique, conséquence différée. Si oui : expliciter dans le
corps du message ce que chaque terme veut dire **concrètement**, ce que ça coûte, et ce qui se
passe si on ne fait rien, avant de proposer les options. Bannir les libellés qui supposent le
vocabulaire du domaine, et ne marquer « (Recommandé) » que si l'utilisateur peut évaluer la
recommandation — sinon c'est l'agent qui décide sous couvert de consultation, et l'accord obtenu
n'est qu'un acquiescement à son autorité.

## Avant de verrouiller — mesurer la porte, montrer l'écran

**Une décision qui verrouille une porte bloquante se mesure avant d'être posée** — scanner,
audit, seuil de qualité, règle de lint : un `releveur` lance l'outil sur l'état actuel du dépôt et
rend le résultat chiffré **avec l'inventaire de l'outil** — types de cibles et nombre de
composants analysés —, que la session écrit dans la décision, daté. Un résultat non nul est un
coût à présenter au mainteneur pendant l'interrogatoire — exceptions, alternatives, découpage —,
pas une surprise de l'Étape 1 de `cycle-pr` : une politique de scan verrouillée avec un fichier
d'exceptions « créé vide » a rencontré 37 vulnérabilités sans correctif au premier passage.
Un zéro sur un composant absent de l'inventaire n'est pas une mesure : le
contre-éprouver — un `executant` présente le même composant sous une forme que l'outil analyse,
le `releveur` y relance l'outil, la session compare. Un « 0 vulnérabilité » cachait 31 HIGH dans
des binaires que le scanner n'avait pas ouverts, ce que son journal disait d'une ligne.

**Une économie se cadre sur le poste dominant mesuré**. Une issue dont le critère
d'acceptation est une économie — tokens, temps, minutes de CI — ne se verrouille qu'avec la
répartition mesurée du coût actuel par poste (session et sous-agents, par modèle, par PR), la
commande qui la produit (à écrire si le projet n'en a pas, `cycle-pr/references/briefing.md`,
« Estimation ») et la part du poste visé, écrites dans la décision avant tout découpage. Un poste
visé sous **25 %** du total ne se découpe pas en lots : l'issue tient en une PR, ou s'abandonne
(seuil et motif : `cycle-pr/references/briefing.md`, « Estimation »).

**Une tranche qui façonne un écran (HITL) montre l'écran avant de le verrouiller.** Lister les
décisions héritées des rangs 1-2 (« Sources de vérité » de `.claude/pipeline.config.md`) qui
déterminent ce que l'utilisateur y verra — structure, fixe ou libre, nombres, ordre — et les
soumettre au mainteneur en **une** question `[V]`, avec une esquisse de l'écran (ASCII, ou le
prototype existant) : « toujours voulu tel quel ? ». Une décision écrite avant que quiconque ait vu
son écran est une hypothèse de goût : héritée du cadrage sans avoir été montrée, une structure de
onze blocs fixes a été renversée à l'arrêt visuel, et environ la moitié du lot refaite.
Sur la même esquisse, **chaque élément visible nomme le comportement qui le fait changer** — de
cette tranche ou d'une tranche déjà livrée ; un élément dont le seul comportement arrive avec une
autre issue va dans cette issue-là, en critère, et la tranche courante n'en pose que la donnée :
une colonne d'état figée, faute du worker qui la fait avancer, a coûté une question à l'arrêt
visuel.

## Sa place dans la pipeline

Ce skill n'est pas seulement un outil à la demande : c'est le **garde-fou obligatoire** avant tout
développement.

- `triage` y passe toute issue destinée à `ready-for-agent` ou `ready-for-human` — l'issue porte
  l'état `needs-interrogation` tant que la session n'a pas eu lieu — et démarre cette session sur
  le seul numéro (`/interroge-moi <N>`).
- Une session PR qui trouve son issue non interrogée — aucune trace d'interrogatoire, ou brief
  marqué `⚠️ Non interrogée au triage` — s'arrête à son Étape 1 et propose une session
  d'interrogatoire sur le numéro, jamais dans la session PR. Une demande directe sans issue n'y
  échappe pas : ses décisions vont dans le briefing pré-PR.

## Consigner les décisions — l'étape qui n'est pas optionnelle

**Une interrogation dont les conclusions ne sont pas écrites n'a pas eu lieu.** Ce qui est tranché
ici sera relu des jours plus tard, par une autre session, sans aucun accès à cette conversation
avec le mainteneur.

À la fin de la session, écrire, chaque écriture par sa sous-commande (« Délégation ») :

- **Les points tranchés** → si la session part d'une issue, dans la section « Décisions » du corps
  de l'issue, chaque ligne datée, par `issue edit <N> --body-file` : le corps courant relu en
  octets (`gh api repos/{owner}/{repo}/issues/<N> --jq .body`), la section ajoutée ou complétée, sans le LF final que `--jq` ajoute,
  dans un fichier qui garde les fins de ligne lues — le script relit contre ce fichier et ne voit
  pas une conversion —, le corps entier réécrit, que le script relit en entier ; dans
  le briefing pré-PR sinon. Le brief d'agent les reprendra : la session de tri le rédige
  (`triage/brief-agent.md`).
- **Les questions restées ouvertes** → en notes de triage sur l'issue, par `comment`, pour que la
  prochaine session sache ce qui manque encore.

**Chaque décision nomme son propriétaire avant d'être écrite** — le bon endroit est celui que lira
la session qui *réalisera* le point, pas celle qui l'a discuté :

1. **L'issue interrogée**, si c'est elle qui réalise le point.
2. **Une autre issue ouverte**, si c'est elle qui le réalisera → amender **son corps**, par
   `issue edit <M> --body-file`, pas seulement la section « Décisions » de l'issue interrogée.
3. **Aucune issue n'existe encore** → la story du PRD reçoit un rappel daté, par
   `issue edit <PRD> --body-file`, que `vers-issues` retrouvera ; à défaut de PRD, le document de
   rang supérieur, par une PR (« Délégation »).

Dans les deux derniers cas, la section « Décisions » garde une ligne « porté par #N » pour la
traçabilité. Une décision consignée au mauvais endroit est perdue au même titre qu'une décision
non écrite.

**Chaque décision qui affirme un fait sur l'existant est confrontée aux sources avant d'être
écrite.** Une valeur, une composition, un comportement de spec : un `releveur` passe le `grep`
des sources de vérité (`.claude/pipeline.config.md`, « Sources de vérité ») sur deux ou trois
ancres par décision — toutes les décisions en un lot, ancres données, lignes rendues — **avant**
que le verrou s'écrive ; le verdict reste à la session, et l'ancre vérifiée est notée dans la
décision (« §1.2 muet », « §1.2 conforme ») ; une décision sans ancre porte `⚠️ non confrontée`.
Le verrou est un point d'écriture au sens de `decisions-vs-doc` : une contradiction qui le
traverse ne se découvre qu'au briefing d'une session ultérieure, en arrêt de chantier.
L'amendement qu'un arrêt décide part par une PR, et la décision attend son merge (« Délégation »).

Puis, si la session partait d'une issue en `needs-interrogation`, dire au mainteneur que l'issue
peut passer à `ready-for-agent` (ou `ready-for-human`) — la transition et le brief appartiennent à
`triage`. Dans le tour où il l'accepte, démarrer la **session de tri qui rédige le brief** :
`start_session`, `initiation: user_asked`, `context: fresh`, `use_worktree: false`,
`title: <préfixe> › tri` (`sessions-liees.md`, « Identité », une racine se nomme d'abord),
prompt `/triage <N>` et rien
d'autre — elle trouve la section « Décisions » :
cas « rédiger le brief » de `triage`, étape 5. Une session dont le brief enchaîne elle-même
interrogatoire et tri — la préparation de vague, `pr-paralleles` Étape 0 — suit son brief.

**Session démarrée par une autre** (son prompt système nomme le parent,
`.claude/skills/cycle-pr/references/sessions-liees.md`, « Identité ») : une fois les décisions
écrites et la transition proposée, prévenir le parent par le message de fin de la même référence
(« Fin de travail ») — la fin du tour ne le prévient pas.
