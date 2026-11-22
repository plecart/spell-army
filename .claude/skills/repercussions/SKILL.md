---
name: repercussions
description: À la clôture d'une issue (PR mergée), corrige la planification des autres issues ouvertes que cette clôture a rendues fausses — hypothèses caduques, contrats déplacés, périmètres déjà couverts, ordres de dépendance. Le livrable est une édition de la spec des issues impactées — corps et brief d'agent — jamais un commentaire. Signale aussi ce que le générateur d'une documentation dérivée (le wiki) ne couvre pas. À utiliser juste après un merge qui ferme une issue, ou « vérifie l'impact de cette issue sur les autres ». Aussi au merge d'une PR d'amendement ouverte par `contradiction`. Aussi au merge d'une PR de lot léger intermédiaire, dont l'issue reste en vol et ne s'édite pas.
argument-hint: "[#issue fermée | #PR d'amendement | #PR de lot léger] [bloc d'arrêt et contradiction soldée : <sortie>]"
---

# Répercussions

Mouvement **sortant** de la pipeline, complémentaire de l'auto-challenge **entrant** de `cycle-pr`
(Étape 1, « le terrain a-t-il bougé depuis que l'issue a été écrite ? »).

Ici c'est l'inverse : une issue vient de se **fermer**. Les décisions actées pendant son
développement ont pu rendre **fausse la planification d'autres issues ouvertes**. Le rôle de ce
skill est de les **corriger**, pour que leur description et leur découpage redeviennent exacts.

## Le livrable est une édition, pas un commentaire

C'est la règle qui structure tout le reste.

- **Le corps de l'issue est la spec ; le brief d'agent en est la copie exécutable** — c'est le
  brief que `cycle-pr` lit comme contrat à son briefing. Si l'un ou l'autre est devenu faux, on le
  **réécrit**. Un commentaire ne remplace pas le texte faux — il s'assoit à côté, et l'issue
  continue d'affirmer une chose fausse pendant qu'un commentaire plus bas la contredit. Corriger le
  corps en laissant le brief intact a le même effet : le contrat qu'on exécute reste faux.
- **Ce skill ne commente jamais une issue.** La trace du *pourquoi* tient en une ligne dans le
  « Journal de spec » du corps ; l'historique d'édition GitHub garde le détail ; le récapitulatif
  complet va au mainteneur, à l'étape 6.
- **Pas d'édition formulable = pas de répercussion.** S'il n'y a rien à corriger dans le corps
  d'une issue, il n'y a rien à signaler à son sujet. On se tait. Il n'existe **pas** de catégorie
  « pour information ».
- **Unique exception : l'issue est déjà en cours de développement.** On ne réécrit pas une spec
  sous les pieds d'une session qui l'a déjà lue — on la prévient par un commentaire sur **sa PR
  ouverte**, ou, sans PR entre deux lots légers, par le prompt du lot suivant (étape 5). C'est la
  seule sortie commentée du skill.

**Règle d'or** : ce skill **propose**, il n'écrit jamais en silence. Aucune édition sans **« go »
explicite** du mainteneur.

## Délégation

La session garde le jugement : le delta réel et ses ancres, la confrontation et ses deux
citations, les diffs présentés, le go demandé au mainteneur. Le reste change de main :

- **`releveur`** — la collecte (« Collectes ») : la PR mergée et ses fichiers, `git log`, les
  issues du thème, les matchs d'ancre, les PR ouvertes, le compte d'issues ouvertes d'un
  milestone ; les lectures bornées (« Lectures bornées ») : le corps des issues examinées et leurs
  commentaires filtrés par les ancres données, le brief en entier — contexte des étapes 2 et 3, pas
  le corps ni le brief que l'étape 5 réécrit —, `PR-PARALLELES.md`, l'état d'avant
  (`git show <base>:<fichier>`), les passages des sources de vérité autour des ancres. Ce qui
  compte reste à la session ;
- **script** — toute écriture sur une issue ou une PR, par sa sous-commande de
  `.claude/skills/cycle-pr/scripts/ecriture-relue.py`, appelée par la session elle-même : un geste
  isolé coûte plus délégué (`CLAUDE.md`, « Orchestration ») — le corps
  (`issue edit <n> --body-file`), le brief (`brief write <n> --body-file`), le signalement sur une
  PR en vol (`comment <PR> --body-file`), le retour en `needs-interrogation` (`label`), la
  fermeture en doublon (`issue close`, puis `label`) ;
- **sessions distinctes** — `contradiction` (étape 1), `plan-qa` (étape 7), `bug-vers-issue` ou
  `vers-issues` pour un brouillon (« Ce que ce skill ne fait pas »), chacune démarrée dans le tour
  du mainteneur qui l'accepte, hors de ce tour par une carte de proposition ; protocole commun :
  `.claude/skills/cycle-pr/references/sessions-liees.md`. Une session que celle-ci démarre reçoit
  son propre worktree, `use_worktree: true` : `repercussions` tourne dans la session PR, dont le
  worktree est retiré après le merge, et une session démarrée dans ce dossier y vivrait et serait
  archivée avec elle (description de `start_session`, lue le 2026-10-23). Ces sessions sont les
  enfants de la session qui les démarre, nettoyées au protocole de `sessions-liees.md`
  (« Nettoyage », « Fin de travail »).

## Document de référence

- [references/grille-impact.md](references/grille-impact.md) — les cinq types de répercussion, le
  signal qui les révèle et la correction type.

## Process

### 1. Capturer le delta réel, puis en extraire les ancres

Sans argument, l'issue est la dernière fermée par un merge sur la branche trunk (`<trunk>` :
`.claude/pipeline.config.md`) — `gh` trie les PR par date de création, d'où le tri explicite :
`gh pr list --state merged --base <trunk> --limit 30 --json number,mergedAt,closingIssuesReferences --jq 'map(select(.closingIssuesReferences != [])) | sort_by(.mergedAt) | last'`.

Avec une PR d'amendement — une PR mergée par une `contradiction` née d'une décision, sans issue
fermée à l'origine, qui amende une source de vérité ou déplace l'effet d'une décision hors de ce
qu'elle affirme, sans fermer d'issue —, le delta réel est cette PR. Les étapes 2 à 6
s'appliquent ; l'étape 7 est sans objet, aucun thème ne s'étant vidé ; la ligne de journal cite
cette PR, pas une issue fermée (« Réconciliée avec la PR #<m> (amendement du cadrage §9.3 |
déplacement de …), du 26 août 2026 »). En mode amendement, `#<fermée>`, `<issue fermée>` et le
`#47` des exemples se lisent « l'amendement, PR #<m> » — `pr-<m>` dans un chemin : la clé
d'idempotence de l'étape 2 est alors la ligne qui cite cette PR.

Avec une PR de lot léger intermédiaire — mergée vers `<trunk>` avec la ligne `En vol pour #<N> (lot
k/n)` et sans `Closes` (`cycle-pr` Étape 2, « Cas découpé ») ; la passe y est due (`cycle-pr`
Étape 8) —, le delta réel est cette PR. Son issue `#<N>` reste **en vol** même sans PR ouverte, le
lot suivant n'ayant pas encore forcément la sienne : elle se classe en vol à l'étape 2 et ne
s'édite pas (étape 5, « Issues en vol → signaler sur la PR, ne rien éditer »). Les étapes 2 à 6
s'appliquent aux autres issues ouvertes, le thème de `#<N>` tenant lieu de thème de l'issue
fermée ; l'étape 7 est sans objet, aucune issue ne s'étant fermée ; la ligne de journal et la clé
d'idempotence citent cette PR, comme en mode amendement.

Écrire un résumé court de **ce que cette clôture a réellement changé** — pas ce que l'issue
promettait, ce qui a été *fait*. Sources, qu'un `releveur` rend : le **diff mergé**
(`gh pr view <n> --json files,title,body`, `git log`), puis, dans le body de la PR, les
**décisions actées** pendant le développement (scope resserré ou élargi, hypothèse tranchée,
format figé, edge case décidé) et les **follow-ups différés**.
Démarrée avec `contradiction soldée : amendement PR #<m>` ou `document gagne — PR #<m>`, le diff
de la PR #<m> s'ajoute à ces sources : sans lui, les §§ amendés en cascade et le bloc déplacé ne
se confronteraient qu'aux ancres de `#<N>`.

Restituer sous `## 📦 Delta réel` : des faits courts et vérifiables.

Puis en extraire les **ancres** — les chaînes recherchables que d'autres issues pourraient
mentionner :

- noms de types, de fonctions, de champs publics touchés ;
- routes, endpoints, clés de payload, formats de données ;
- noms de modules / domaines déplacés, créés ou supprimés ;
- termes métier dont le sens a été tranché.

Chaque ancre doit provenir du diff ou d'une décision écrite. **Une ancre qu'on ne peut pas
rattacher à un fait du delta n'est pas une ancre.**

#### Confronter le delta à la documentation dérivée

Jouée à **chaque** passe, avant l'arrêt possible de la sous-section suivante, sur tout le delta :
celui de `#<N>`, plus, à une reprise dont la ligne `contradiction soldée` nomme une PR `#<m>`, le
diff de celle-ci, ajouté aux sources ci-dessus — un amendement du game design est une source du
wiki. La passe qu'une contradiction interrompt s'arrête avant l'étape 2 et n'écrit rien : c'est la
reprise, qui rejoue cette confrontation entière, qui range les vides ; un vide dont le critère
figure déjà dans l'issue qui le possède (ligne « Complétée après #<N> ») ne s'ajoute pas une
seconde fois.

La section « Documentation dérivée » de `.claude/pipeline.config.md` liste ce que des commandes du
dépôt génèrent depuis les sources — le wiki du jeu. Ce n'est **pas** une source de vérité : un
écart entre elle et le delta n'est jamais une contradiction `decisions-vs-doc`, et ce skill ne
l'écrit jamais. Pour chaque documentation dérivée dont le delta touche une source :

- **le générateur couvre déjà ce que le delta change** — une valeur, une ligne de tableau, un sort
  d'une forme et d'un effet connus → rien à faire : sa publication la régénère ;
- **le delta ajoute ce que le générateur ignore** — nouvelle classe, nouvelle forme ou nouvel effet
  de sort, nouveau type de contenu (un bestiaire) → c'est un **vide** à combler, rangé par
  « Création d'issues en cours de cycle » (`.claude/rules/contraintes.md`) : critère d'une issue
  ouverte qui possède le sujet, sinon brouillon montré au mainteneur.

#### Confronter d'abord le delta aux sources de vérité

Les issues sont le **dernier rang** de la table « Sources de vérité » de
`.claude/pipeline.config.md` : elles dérivent des rangs supérieurs. Avant de les corriger, vérifier que le delta n'a pas rendu faux un
**§ d'un document de référence** — sinon on aligne les issues sur une doc qui est elle-même à
amender, et la cascade se fait dans le mauvais sens.

C'est un `grep` des ancres sur les fichiers des rangs supérieurs, rien de plus : un `releveur` le
passe et rend les passages autour des ancres ; le verdict reste à la session. Même seuil que pour
les issues : **deux citations ou rien** — la ligne exacte du §, et le fait du delta qui la
falsifie. Un document **muet** sur le point (le cadrage décrit le serveur, le delta touche le poste
de dev) n'est pas contredit. Une contradiction déjà portée par une issue ouverte — l'échappatoire
de `decisions-vs-doc` — est déjà tracée : ne pas la signaler une seconde fois.

**Démarrée avec une ligne `contradiction soldée : <sortie>`** — celle que `contradiction` ajoute au
bloc d'arrêt à son étape 5 —, la session tient cet arrêt pour soldé : il ne se lève pas une
seconde fois. Avec `document gagne`, suivi ou non de `— PR #<m>`, l'effet mergé qui contredit le
document est un **vide à tracer** (`.claude/rules/contraintes.md`, « Création d'issues en cours de
cycle ») — la complétion `[complétion]` d'une issue ouverte qui possède le sujet, sinon un
brouillon, par le chemin de « Ce que ce skill ne fait pas » —, sauf si une issue ouverte le porte
déjà (« Une contradiction déjà portée par une issue ouverte », ci-dessus) ; puis les étapes 2 à 7
suivent. Avec `amendement PR #<m>`, `amendement reporté — #<k>`, que `#<k>` porte déjà, ou
`écartée — <raison>`, elles suivent directement.

Une contradiction avérée → **s'arrêter avant l'étape 2** et présenter l'arrêt de
`.claude/rules/decisions-vs-doc.md` (bloc `## ⚠️ Contradiction`). Dans le tour où le mainteneur
l'accepte, démarrer la session `contradiction` : `start_session`, `initiation: user_asked`,
`context: fresh`, `use_worktree: true`, `title: <préfixe> › contradiction` (`sessions-liees.md`,
« Identité », une racine se nomme d'abord), prompt `/contradiction` suivi du bloc d'arrêt — ses
deux citations — et de
`origine : #<N>` ; hors d'un tour du mainteneur, une carte de proposition
(`initiation: own_initiative`, `context: fresh`, `use_worktree: true`, même titre et même prompt). Quelle que soit sa sortie — amendement, document gagnant ou arrêt
écarté —, elle redémarre `repercussions` sur `#<N>` avec la ligne `contradiction soldée` qui la
nomme (`contradiction`, étape 5) : la passe reprend, les étapes 2 à 7 suivent, QA comprise.
Démarrée par une autre, cette session-ci prévient alors son parent (étape 6). Ce skill **n'amende
jamais un document lui-même**.

### 2. Sélectionner les issues à examiner

Sur le dépôt de `.claude/pipeline.config.md`, un `releveur` rend les trois sélections
(« Collectes », « Lectures bornées ») :

1. **Même thème** — `gh issue list --state open --milestone "<thème de l'issue fermée>"`.
2. **Match d'ancre** — pour chaque ancre : `gh issue list --state open --search "<ancre>"`.
3. **Match d'ancre dans les briefs** — la recherche GitHub ne fouille que le corps ; le brief
   d'agent est un **commentaire**, invisible pour elle. Pour chaque issue ouverte qui porte un brief
   (au minimum les `ready-for-agent`), le `releveur` rend ses commentaires
   (`gh issue view <n> --json comments --jq '.comments[].body'`) filtrés par les mêmes ancres, le
   brief en entier — une réconciliation qui ne vit que dans un brief conclurait sinon « aucune » à
   tort.

L'union des trois constitue le périmètre d'examen. **Le reste du backlog n'est pas examiné.**

Annoncer les décomptes sans rien masquer : « 4 issues du thème + 3 issues matchant une ancre = 6
issues examinées (une en commun) ; 22 autres issues ouvertes non examinées. » Si l'issue fermée n'a
pas de thème, ou si le merge ne ferme aucune issue, le périmètre se réduit aux matchs d'ancre.

**Ignorer les issues déjà réconciliées** avec cette issue fermée (voir le Journal de spec, étape 5)
— c'est ce qui rend le skill relançable sans retravail.

#### Marquer les issues « en vol »

Une issue **dormante** (planifiée, personne ne travaille dessus) peut voir son corps réécrit sans
risque. Une issue **en vol** est en cours de développement : une session a **déjà lu son corps** à
son briefing pré-PR et ne le relira pas. Réécrire sa spec sous elle ne la préviendrait de rien —
c'est le pire des cas, elle continuerait sur une spec périmée en croyant être à jour.

Repérer les issues en vol avant toute chose — un `releveur` rend la liste :

```bash
# PR ouvertes, drafts comprises, et ce qu'elles ferment ("Closes #N" / "Fixes #N" / "Resolves #N")
gh pr list --state open --json number,title,body,isDraft,headRefName
```

`cycle-pr` ouvre sa **PR draft à l'Étape 2, avant la première ligne de code**, avec `Closes #N`
dans le body. Une issue en cours de développement a donc **toujours** une PR ouverte qui la
référence — sauf l'issue d'un lot léger intermédiaire mergé, en vol sans PR (étape 1), que ce
relevé ne voit pas. C'est ce qui rend cette détection fiable plutôt qu'approximative. Les drafts
comptent autant que les autres : c'est même leur seule raison d'exister ici.

**Lire aussi la ligne `En vol pour #<N> (lot k/n)`** en tête de body, au même titre que `Closes` :
une PR découpée en lots ne porte `Closes` que sur son **dernier** lot, et ce marqueur est ce qui
signale l'issue en vol pendant les lots précédents.

Le `releveur` rend aussi le tableau de bord **`PR-PARALLELES.md`** s'il existe — hors dépôt, dans
le dossier du projet qui porte `skill-observations/` (`pr-paralleles`, étape 4) : toute ligne qui
n'est pas `⚪ worktree nettoyé` désigne une issue en vol. Il sert de filet si une session a sauté
l'Étape 2.

Classer chaque issue impactée **dormante** ou **en vol**. Le traitement diffère radicalement
(étape 5) — dans le doute, considérer l'issue en vol : prévenir à tort coûte un commentaire, éditer
à tort coûte une PR construite sur une spec fausse.

### 3. Confronter — deux citations obligatoires

Pour chaque issue examinée, lire corps + brief d'agent, que le `releveur` rend, et chercher ce qui
est devenu **faux**. La confrontation porte sur les **deux supports** : une ligne fausse du brief
est une répercussion au même titre qu'une ligne fausse du corps — et la même affirmation fausse
vit souvent dans les deux.

Une répercussion n'est retenue que si l'on peut produire **les deux citations**, la première
nommant son support :

```
Citation issue : « <la ligne exacte devenue fausse> » (corps | brief | les deux)
Citation delta : « <le fait exact du delta réel qui la falsifie> »
```

**Si l'une des deux manque, il n'y a pas de répercussion — ne pas la formuler.** Une impression
(« ça pourrait interagir avec… », « il faudra peut-être vérifier… ») n'est pas une citation. C'est
exactement ce qui noie le rapport et rend indécidable ce qui est vrai.

**Troisième condition — la causalité.** La ligne citée de l'issue doit avoir été **vraie juste
avant le merge** : relire l'état d'avant, que le `releveur` rend (`git show <base>:<fichier>`,
corps de la PR), et vérifier que c'est bien **ce** delta qui la falsifie. « X est faux » et « ce
changement a rendu X faux » sont deux affirmations différentes, et seule la seconde est une
répercussion. Une tension préexistante appartient à la clôture qui l'a introduite, ou à personne —
l'attribuer au merge courant fait perdre au mainteneur le seul repère qui rend le rapport
actionnable.

Deux niveaux, et deux seulement :

- **bloquant** — la spec est fausse sur un point structurant ; développer l'issue en l'état
  produirait du travail à jeter.
- **à ajuster** — la spec reste globalement valable, une référence ou un périmètre doit être repris.

### 4. Présenter les corrections sous forme de diff

Sous `## 🔭 Répercussions`, **uniquement les issues impactées**, groupées par niveau :

```
#52 — Export CSV des factures                        [bloquant] [dormante]
  Type   : contrat déplacé
  Issue  : « le total est exprimé en euros dans `Invoice.total` »
  Delta  : « `Invoice.total` est passé en centimes (entier) »
  ── correction proposée dans le corps ──
  - le total est exprimé en euros dans `Invoice.total`
  + le total est exprimé en centimes (entier) dans `Invoice.total` (voir #47)

#58 — Relances de paiement                    [bloquant] [EN VOL → PR #61]
  Type   : contrat déplacé
  Issue  : « comparer `Invoice.total` au seuil en euros »
  Delta  : « `Invoice.total` est passé en centimes (entier) »
  ── corps NON modifié — signalement sur la PR #61 ──
  La session développe déjà contre l'ancien contrat.
```

Toujours afficher le marqueur **[dormante]** ou **[EN VOL → PR #n]**, et **[EN VOL → lot
suivant]** pour l'issue d'un lot léger intermédiaire mergé, sans PR (étape 1) : c'est lui qui dit
au mainteneur si une session est en train de partir dans le mur. Chaque bloc de correction nomme
son support — « dans le corps », « dans le brief », ou les deux blocs l'un sous l'autre.

Montrer les **lignes** avant/après, pas une prose qui décrit le changement : un diff se juge en
deux secondes, un paragraphe demande de raisonner.

Si aucune issue n'est impactée, le dire en une ligne — « Aucune répercussion : la clôture de #47 ne
rend fausse la planification d'aucune issue examinée. » — et passer à l'étape 6, l'étape 7 restant
due : la QA d'un thème vidé ne dépend pas des issues impactées.

### 5. Appliquer — sur « go » explicite

Après le « go » (global, ou issue par issue si le mainteneur préfère trier).

#### Issues dormantes → éditer la spec, sur ses deux supports

**Éditer le corps** de chaque issue retenue par `issue edit <n> --body-file <fichier>` : le corps
courant, lu par la session elle-même juste avant d'écrire, dans ce même `<fichier>`
(`gh api repos/{owner}/{repo}/issues/<n> --jq .body`, sans le LF final que `--jq` ajoute) — il ne
passe par le rapport d'aucun équipier, qui pourrait en convertir les fins de ligne ou les
espaces —, exactement le diff présenté appliqué **par remplacements ancrés en mémoire** sur ce
texte, puis le tout écrit tel quel dans le fichier — ses fins de ligne gardées : le script relit
contre ce fichier et ne voit pas une conversion. La ligne de journal (« Transitions
et fermetures ») part dans le même fichier, et l'appel attend les deux contrôles ci-dessous. Ne
jamais profiter de l'édition pour reformuler autre chose.

**Amender le brief d'agent dans le même geste** quand la ligne fausse y figure aussi, par
`brief write <n> --body-file <fichier>`, qui édite en place le seul brief, jamais un second brief
concurrent : même lecture, par la session elle-même, du commentaire qui s'ouvre par
`## Brief d'agent`, relu par
`gh api --paginate repos/{owner}/{repo}/issues/<n>/comments --jq '.[] | select(.body | startswith("## Brief d'"'"'agent")) | .body'`,
sans le LF final que `--jq` ajoute (mesuré sous Git Bash le 2026-10-23, une page :
octet pour octet le `.body` de son brief lu seul) — sans `--paginate`, la première page seule. Le
journal de spec vit dans le corps, mais le contrat que `cycle-pr` exécute est le brief : un
correctif appliqué au seul corps laisse le contrat faux.

**Vérification avant l'appel**, sur une issue portant un brief : chercher dans le fichier chaque
« citation issue » marquée `brief` — **zéro occurrence attendue** — et l'ancre du contenu voulu —
**présente** : un fichier vidé passe le contrôle des citations haut la main. Le script relit
ensuite la forge en entier contre ce fichier. Une citation encore présente signale un support
oublié, pas une passe terminée.

**Relire le corps — et le brief — juste avant d'écrire** : c'est la lecture de la session
ci-dessus, faite au moment d'écrire. S'ils ont changé depuis la présentation du diff — une autre
passe de répercussions a pu passer entre-temps, ou le mainteneur a édité — ne pas écrire
par-dessus : re-présenter le diff recalculé. Deux merges rapprochés font tourner deux passes qui
peuvent viser la même issue.

#### Issues en vol → signaler sur la PR, ne rien éditer

Pour une issue en vol, **le corps et le brief restent intacts** et **aucun label ne change**. La
session qui la développe les a déjà lus ; les modifier ne l'atteindrait pas, et la repasser en
`needs-interrogation` alors qu'une PR est ouverte n'a pas de sens.

Le signalement va **en commentaire sur la PR ouverte**, par `comment <PR> --body-file <fichier>`,
que le script relit en entier — c'est la seule sortie GitHub commentée de ce skill, et elle est
justifiée : `cycle-pr` traite déjà les commentaires de PR à son Étape 6, en bouclant jusqu'à
review vide. Le message atterrit donc exactement là où la session le lira. Sans PR ouverte —
`#<N>`, l'issue d'un lot léger intermédiaire mergé (étape 1) —, il va dans le prompt du lot
suivant, que la session sortante écrit après cette passe (`cycle-pr/references/cloture.md`, « Cas
découpé : la frontière de lot se franchit par la session sortante ») : c'est lui que la session du
lot suivant lit en premier.

```markdown
> *Généré par IA — répercussion de la clôture de #47.*

**⚠️ Répercussion bloquante sur la spec de cette PR**

L'issue #58 affirme : « comparer `Invoice.total` au seuil en euros ».
La clôture de #47 a acté : « `Invoice.total` est passé en centimes (entier) ».

Le corps de l'issue **n'a pas été modifié** (développement en cours). À intégrer dans cette PR,
ou à remonter au mainteneur si cela change le périmètre.
```

Un signalement **bloquant** sur une issue en vol se remonte **en tête du récapitulatif** (étape 6) :
c'est une session en train de construire quelque chose de faux, et le mainteneur doit décider s'il
la met en pause.

#### Transitions et fermetures (issues dormantes uniquement)

**Ajouter la ligne de journal**, en bas du corps :

```markdown
<!-- repercussions -->
### Journal de spec
- Réconciliée avec #47 — `Invoice.total` passé en centimes.
```

Une ligne par issue fermée réconciliée. C'est la **clé d'idempotence** de l'étape 2. Au-delà de
cinq lignes, compacter les plus anciennes en une seule (« Réconciliée avec #12, #19, #23 »).

**Repasser en `needs-interrogation`** toute issue `ready-for-agent` ou `ready-for-human` dont
l'édition touche le **périmètre** ou une **décision verrouillée**, par
`label <n> --add needs-interrogation --remove <ready-for-agent | ready-for-human>` (labels réels :
mapping de `.claude/pipeline.config.md`) : son interrogatoire portait sur une spec qui n'existe
plus, il doit être refait. Une simple mise à jour de référence ne déclenche pas ce retour en
arrière.

**Fermer en doublon** — seul cas où ce skill ferme quelque chose. Exige un recouvrement **total et
non ambigu**, et un **« go » nommément sur cette issue** (un « go » global ne suffit pas à fermer).
D'abord la ligne de journal « Fermée en doublon de #<M> après #<fermée> », dans le corps
(`issue edit --body-file`, lu par la session elle-même comme à « Éditer le corps ») — le skill ne
commente jamais une issue —, puis `issue close <n> --reason not_planned`, puis
`label <n> --remove <état>` — l'état que l'issue porte, lu sur elle, sous son label réel
(mapping de `.claude/pipeline.config.md`) : une issue fermée n'en porte aucun (`triage`,
« Rôles »). Recouvrement partiel → on réduit le périmètre dans le corps, on ne ferme pas.

Au moindre cas ambigu — re-découpage non trivial, conflit de conception, fermeture incertaine —
**ne pas trancher seul** : le poser au mainteneur et laisser l'issue intacte.

### 6. Récapituler au mainteneur

**En tête : les signalements bloquants sur issues en vol** — sessions qui développent contre une
spec devenue fausse, avec la recommandation (poursuivre en intégrant la correction, ou mettre en
pause). C'est la seule information de ce rapport qui est urgente.

Puis : ce qui a été édité, ce qui est repassé en `needs-interrogation`, ce qui a été fermé, les
points laissés à l'arbitrage, et le nombre d'issues non examinées.

**Session démarrée par une autre** — une session `contradiction` (son prompt système nomme le
parent, `.claude/skills/cycle-pr/references/sessions-liees.md`, « Identité ») : la passe finie —
après l'étape 7, ou à l'arrêt de l'étape 1 —, prévenir le parent par le message de fin de la même
référence (« Fin de travail ») — la fin du tour ne le prévient pas.

### 7. Le thème est-il terminé ? — proposer la campagne de QA

L'issue fermée appartenait à un **thème** (milestone). Vérifier s'il en reste des issues ouvertes —
un `releveur` rend la liste :

```bash
gh issue list --state open --milestone "<thème de l'issue fermée>" --json number
```

**S'il n'en reste aucune, le thème vient de se terminer.** C'est la seule frontière de lot que
cette pipeline produise naturellement — et donc le bon moment, et le seul, pour proposer une
campagne de QA :

> « Le thème **Facturation** n'a plus d'issue ouverte (7 fermées). Lancer `/plan-qa` dessus ? »

Conditions pour proposer :

- le milestone est vide d'issues ouvertes ;
- **et** au moins une de ses issues touchait une surface visible du projet (surfaces déclarées dans
  `.claude/pipeline.config.md`). Un thème purement interne — refacto, outillage, dette — n'a rien à
  faire recetter à la main : ne rien proposer ;
- **et** une seule fois par thème : si le milestone porte déjà une issue `qa-plan`, se taire. Une
  proposition qu'on décline neuf fois sur dix devient un bruit qu'on apprend à ignorer — c'est
  précisément ce qu'on cherche à éviter en ne la déclenchant qu'ici.

**Proposer, puis démarrer sur accord.** La proposition reste une question au mainteneur ; sur son
accord, dans ce tour, démarrer la session : `start_session`, `initiation: user_asked`,
`context: fresh`, `use_worktree: true`, `title: <préfixe> › plan-qa <thème>` (`sessions-liees.md`,
« Identité », une racine se nomme d'abord), prompt `/plan-qa "<thème>"`.

## Ce que ce skill ne fait pas

- **Il ne commente aucune issue.** Unique exception, décrite à l'étape 5 : un commentaire sur une
  **PR ouverte** quand l'issue qu'elle développe est impactée — parce que c'est le seul canal que
  la session en cours lira.
- **Il ne crée aucune issue.** Un besoin non couvert révélé par la clôture n'est pas une
  répercussion, c'est du travail neuf — et il suit `.claude/rules/contraintes.md`,
  « Création d'issues en cours de cycle ». Si une issue ouverte possède le sujet, ce skill y
  **ajoute le critère dans la même passe** — bloc marqué `[complétion]` à l'étape 4, appliqué sur
  le même « go » par `issue edit --body-file` (et `brief write` si le brief porte les critères),
  corps et brief lus par la session elle-même comme à l'étape 5 (« Éditer le corps »), ligne de
  journal « Complétée après #<fermée> — <le vide, d'où il vient> ». Sinon, un brouillon
  dans sa propre session, démarrée dans le tour où le mainteneur l'accepte — `start_session`,
  `initiation: user_asked`, `context: fresh`, `use_worktree: true` : pour un défaut,
  `bug-vers-issue` avec la description en argument (`title: <préfixe> › bug` (`sessions-liees.md`,
  « Identité », une racine se nomme d'abord), prompt `/bug-vers-issue <description>`) ; pour du
  travail neuf, `vers-issues` sur un fichier de plan
  que la session écrit hors du dépôt, `plans/<date>-<issue fermée>.md` dans le dossier voisin du
  journal d'observations (chemin dans `CLAUDE.md`), les deux citations du vide dedans
  (`title: <préfixe> › vers-issues` (`sessions-liees.md`, « Identité », une racine se nomme
  d'abord), prompt
  `/vers-issues <chemin>`). La session de brouillon le montre au
  mainteneur, qui décide (`.claude/rules/contraintes.md`, « Création d'issues en cours de cycle »,
  barreau 4). Hors du dépôt, parce que `vers-issues` exige une source écrite en argument et qu'un
  fichier non suivi dans le worktree de la session PR salirait son arbre. Le vide relevé par une
  clôture a presque toujours un propriétaire ouvert.
- **Il ne re-trie pas.** Les seules transitions d'état qu'il applique sont le retour en
  `needs-interrogation` décrit ci-dessus et le retrait de l'état d'une issue qu'il ferme en
  doublon, par `label` (« Délégation ») ; tout autre changement d'état passe par `triage`.
- **Il ne relit pas le code.** Il confronte des specs à un delta, il n'audite pas la codebase.
- **Il n'amende aucun document de référence.** Il détecte qu'un § est falsifié (étape 1) et passe
  la main à `contradiction`, seul à écrire dans les documents de référence.

## Les 5 idées à retenir

1. **Le livrable est une spec corrigée — corps et brief d'agent.** Aucun commentaire d'issue — un
   commentaire laisse le texte faux en place, et un corps corrigé sans son brief aussi : c'est le
   brief que `cycle-pr` exécute.
2. **Deux citations ou rien.** La ligne devenue fausse et le fait qui la falsifie. Sans les deux,
   la répercussion n'existe pas.
3. **Dormante ou en vol.** On réécrit la spec d'une issue que personne ne développe ; on **prévient
   sur sa PR** celle qui est en chantier, ou par le prompt du lot suivant entre deux lots légers.
   Éditer sous les pieds d'une session en cours est le seul dégât irrattrapable que ce skill puisse
   causer.
4. **Périmètre mécanique** (thème + ancres) et **idempotence** (journal de spec) : le skill se
   relance après chaque merge sans re-brasser le backlog.
5. **Les documents avant les issues.** Un delta qui falsifie un § de référence passe par
   `contradiction` d'abord ; les issues se corrigent contre la doc, amendée ou non, jamais
   l'inverse.
