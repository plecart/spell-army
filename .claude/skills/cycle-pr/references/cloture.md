# Après le merge — détail de `cycle-pr`

Passages déplacés mot pour mot de `cycle-pr/SKILL.md`, chacun sous le titre que
cite son renvoi. Les liens `references/…` qu'ils portent se lisent depuis le dossier du skill,
et leurs renvois de position (« ci-dessous », « plus bas ») depuis l'emplacement du renvoi.

## Les 5 idées à retenir

1. Tout l'effort de questions se fait **avant** de coder (briefing pré-PR + interrogatoire) — et
   une question technique ne se pose pas : elle se décide et se trace (`[T]`).
2. **La PR draft s'ouvre avant la première ligne de code** (hors voie courte), avec `Closes #N`. C'est ce qui rend le
   travail visible comme *en cours* : sans elle, une autre session réécrira la spec de cette issue
   en croyant que personne ne travaille dessus.
3. Le cycle `modif → test → cleanup → test → commit` s'applique à chaque commit, triviaux
   compris.
4. **Deux filets de cleanup** : un par commit (regard local), un sur la PR entière avant la
   passe finale (4.1, regard global, inter-commits) — et une relecture à contexte vierge
   **par bloc** (une passe pour une PR à un commit de code ; voie courte : un sous-agent), à
   chaque frontière de bloc puis à la fin, jamais par commit, par **une seule session de relecture pour toute la PR**, démarrée au go et réveillée par message, dans son propre
   worktree, avec une passe de plus tant que la dernière trouve un bloquant ou un important. Elle ne se nettoie qu'à
   la fermeture de la boucle : plus tôt, la relance n'a plus de destinataire.
5. La PR n'est **terminée qu'après la passe `repercussions`**, quand elle est due (`cycle-pr`
   Étape 8) : un merge peut bouleverser les
   autres issues — la session PR le vérifie tant qu'elle tient le brief, les Notes et les constats.

## Le contrat d'ecriture-relue.py

Il lit la forge en octets, écrit, puis relit : un label retiré doit s'y relire absent, un texte
écrit s'y compare **entier** à l'attendu — une relecture qui ne compare qu'une ancre ou une
longueur laisse passer une conversion des fins de ligne qui les préserve. Sortie 0 :
écrit et relu, rien à écrire, ou lu (`checkbox next`) ; 1 : refus sans rien écrire, ou
relecture non conforme — motif en une ligne ; 2 : appel mal formé.
**Ce qu'il ne couvre pas** : il ne choisit pas les cases, la session PR les nomme ; il ne compte
pas les PR liées, la requête GraphQL du cas découpé reste. La famille sait aussi créer une
issue, remplacer un corps, publier un brief, poser un label, fermer une issue, rattacher une
issue à un milestone, fermer un milestone, créer les labels d'un dépôt ou créer le dépôt ; son
`--help` en porte le contrat. `triage`,
`interroge-moi`, `vers-prd`, `vers-issues`, `repercussions`, `bug-vers-issue`, `plan-qa`,
`execution-qa` et `init-projet` (`depot create`, `label create`) les nomment. Toute écriture qu'il
ne fait pas reste sous la règle « Écritures sur un artefact distant » de
`.claude/rules/contraintes.md`, relue à la main.

## Les transcripts du bilan et ce que le script rend

Les transcripts vivent sous `~/.claude/projects/<projet>/<uuid de session>.jsonl` — l'uuid est
celui du répertoire scratchpad de la session. **Un cycle qui a rempli un contexte en a
plusieurs** : les donner tous, relais compris, dans n'importe quel ordre ; un bilan à un seul
transcript manque la moitié du cycle, et c'est la moitié la plus chère. Un transcript introuvable
se dit en tête de sortie — « transcripts demandés N, lus M — absents : … » — au lieu de rendre un
bilan partiel muet : le harnais a le droit de libérer un transcript entre deux sessions,
et le relevé que la session sortante a déposé avant de passer la main (« Relais en cours de
cycle », plus bas) s'additionne alors à la main. Le script rend la durée,
l'attente **scindée** en réactivité et absences — celle du mainteneur comme celle d'un pair, un
écart entre deux transcripts compris —, le temps des sous-agents et des
workflows, le temps d'agent seul, le cache que chaque sous-agent a lu et écrit **contact par
contact** — lu dans son propre transcript, sous `<uuid>/subagents/`, reprises et agents au premier
plan compris ; pas sa sortie, que ce transcript sous-compte —, les points de contact humains et
les appels d'outils ; puis le **profil de contexte** de chaque session : cache lu par quart des
appels, première porte de relecture et part du cache lu après elle, composition en caractères.
**La session de relecture, quand la PR en a une, se donne par `--relecture`**, une option par
transcript, ses relais compris : ses jetons, ses sous-agents et son profil se rendent, sans
entrer dans la durée, les attentes ni le temps des sous-agents — fusionnée avec la session PR,
elle en fermerait les attentes (docstring de `waits`).
Son transcript vit sous le dossier de projet de son propre worktree, et le script lit les
sous-agents rangés sous le dossier de chaque transcript (`subagents`).

## La ligne de comparaison au cycle précédent porte l'attente hors absences

**La ligne de comparaison au cycle précédent porte l'attente hors absences**, jamais l'agrégat.
Les deux n'ont ni la même cause ni le même remède : la réactivité relève de la pipeline —
questions groupées, arrêt au bon moment —, une absence relève du calendrier, et un cycle lancé le
soir rencontre une nuit. Une absence se commente **à part**, en disant ce que l'agent n'avait
plus d'indépendant à faire à ce moment-là. Mêlées, elles font lire un succès comme un échec.
Un bilan pris par une version antérieure de `bilan-session.py` ne se compare pas tel quel : les attentes closes par un pair, les
commandes tapées et les écarts entre transcripts y comptaient en travail d'agent ; la durée d'un
outil suivi d'un message y comptait en attente, et les commandes tapées, les injections
`isMeta` et les chargements de skill citant une balise de pair y changeaient le compte des
contacts humains et des pairs. Re-mesurer le cycle précédent avec le script courant, si ses
transcripts existent encore, ou le dire sur la ligne de comparaison.

## Cas découpé : la frontière de lot se franchit par la session sortante

**Cas découpé : la frontière de lot se franchit par la session sortante.** Sur un lot
intermédiaire, écrire le prompt du lot suivant depuis
[references/prompt-lot-suivant.md](references/prompt-lot-suivant.md), au chemin fixe de
[references/sessions-liees.md](references/sessions-liees.md) (« Passation »), et le remettre par ce
chemin, dans le message de fin. En lot léger, le défaut (`.claude/rules/taille-pr.md`, point 4),
ou en repli, **après** la passe `repercussions` quand elle est due — toujours sur un lot léger,
qui porte `En vol pour #N` vers `main` (`cycle-pr` Étape 8) —, au **mainteneur**, qui démarre
la session neuve par la carte que la session sortante lui propose (`cycle-pr` 3.5) et lui donne le
prompt. Sous une coordinatrice, **à la coordinatrice**, qui ouvre la session du lot suivant sur ce
pointeur — une session de lot coordonné l'écrit sans passe `repercussions`, qui tourne au merge de
la PR d'intégration ([references/coordinatrice.md](references/coordinatrice.md)). Pas le lead :
sur une vague de cinq lots, chaque frontière passée par lui lui coûte un brief relu et un prompt écrit, et son contexte a grossi jusqu'à devoir être relayé
lui-même. La session sortante tient les artefacts de son lot ; le lead connaît la vague,
et c'est ce
qu'il garde — croisement des fichiers après merge, tableau de bord, vigilance de vague. Quand la
session sortante a disparu, deux replis de `pr-paralleles` : Étape 7, « Session disparue », pour
reconstituer ce qu'elle n'a pas remis, et Étape 8, « Issue en plusieurs lots », où c'est le lead
qui démarre la session du lot suivant.

## La passation s'écrit en dernier, depuis les artefacts

**La passation s'écrit en dernier, depuis les artefacts** — SHA, PR, brief, constats —, jamais de
mémoire de code. Chaque point encore ouvert du lot — question au
mainteneur, correctif, message en attente — se pose d'abord, en une fois, puis se fait ou se laisse
sur une décision explicite : la passation ne part qu'avec une liste vide ou arbitrée. Mesuré : un
prompt remis à côté de trois questions ouvertes a fait démarrer le lot suivant aussitôt, et deux de
ses lignes sont devenues fausses à la réponse.

Le gabarit ne porte que des **pointeurs** vers les artefacts, jamais une règle recopiée : un énoncé
recopié hérite des erreurs de son auteur en empruntant la crédibilité de la source qu'il cite.

## Une session neuve par lot

**Une session neuve par lot.** Le lot suivant ne se déroule pas dans cette session, même si son
contexte le permettrait — un sous-lot né d'un re-découpage non plus (3.5) : un lot a livré
ses deux sous-lots dans une même session, le cycle le plus cher mesuré (107 M de jetons relus,
relevé le 2026-10-19). Deux raisons :

- le contexte d'un lot porte les **hypothèses** qui l'ont produit, et les relire au lot suivant,
  c'est se priver du seul regard neuf gratuit du cycle — le même argument qui fonde la relecture à
  contexte vierge de 4.2 ;
- **mesuré** : un lot **seul** a rempli un contexte en plein Étape 4 et a dû être relayé, ce qui a
  coûté deux artefacts — `bilan-session.py` accepte N transcripts, `pr-paralleles` Étape 5 a son
  paragraphe « Session relayée ». Une session qui *entame* un lot avec un contexte à
  moitié plein part donc plus près de cette limite. Ce second point est une déduction de la
  mesure, pas une mesure : aucun cycle n'a enchaîné deux lots dans une session, précisément parce
  que la règle l'interdit.

Avec une coordinatrice, chaque lot a aussi son worktree neuf : la branche mergée d'un lot n'est
jamais un point de départ ([references/coordinatrice.md](references/coordinatrice.md), « La
session de lot »).

C'est aussi pourquoi le prompt du lot suivant est un **artefact remis**, et pas une consigne qu'on
se donne à soi-même.

## Relais en cours de cycle — la session sortante passe ce qu'elle seule possède

**Relais en cours de cycle — la session sortante passe ce qu'elle seule possède.** Un cycle peut
remplir un contexte avant son Étape 8, et une session neuve reprend alors le même lot — la roue de
secours depuis que la session PR délègue son code. La session sortante écrit sa
passation, depuis les artefacts, dans la variante « relais » de
[references/prompt-lot-suivant.md](references/prompt-lot-suivant.md), au chemin fixe de
[references/sessions-liees.md](references/sessions-liees.md) (« Passation »), et la remet par ce
chemin à la coordinatrice pour une session de lot coordonné
([references/coordinatrice.md](references/coordinatrice.md), « Relais en cours de lot »), sinon au
mainteneur.
Trois choses que le relais ne peut pas reconstituer, chacune payée :

- **son bilan, déposé avant de rendre la main** — `bilan-session.py` sur son propre transcript,
  sortie écrite dans `retrospectives/<date>-<issue>-relais-<k>.txt`, **hors du dépôt** (dossier
  voisin du journal, chemin dans `CLAUDE.md`) : un relevé écrit dans un worktree part avec lui.
  Le harnais a libéré le transcript d'une session sortante 50 minutes avant que son relais ne
  commence ; ses marqueurs de libération ne visent que des transcripts de session — 15
  sur 15 au 2026-10-14, et `retrospectives/` garde ses fichiers depuis le 2026-09-26. Que le
  harnais ne libère jamais un fichier déposé n'est écrit nulle part : c'est un constat, pas une
  garantie ;
- **les numéros des entrées du journal d'observations déjà écrites pour ce cycle** — le plafond
  de `CLAUDE.md` se compte par cycle, relais compris, et un relais qui ignore le compte le
  recommence : un lot, sur trois sessions, a versé sept entrées sous un plafond de
  trois par session ;
- en vague, **l'adresse du lead**, à qui la session sortante demande le relais et à qui le relais
  envoie son état (`pr-paralleles` Étape 5, « Session relayée ») : c'est la session sortante qui
  sait que son contexte se remplit, pas le lead.
