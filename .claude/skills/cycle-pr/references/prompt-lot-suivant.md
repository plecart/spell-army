# Gabarit — le prompt du lot suivant

Écrit par la **session sortante**, en dernier — après sa passe `repercussions` quand elle en a une
(Étape 8, « Cas découpé ») —, au
chemin fixe de [sessions-liees.md](sessions-liees.md) (« Passation »), et remis par ce chemin à la
coordinatrice, dans le message de fin ([coordinatrice.md](coordinatrice.md)) — sans coordinatrice,
au mainteneur, qui le donne à une session neuve. Pas par le lead : sur une vague de cinq
lots, chaque frontière passée par lui lui coûte un brief relu et un prompt écrit, et son contexte
a grossi jusqu'à devoir être relayé. La session sortante, elle, tient les artefacts de
son lot.

**Ce gabarit ne porte que des pointeurs et des commandes à taper telles quelles.** Jamais une règle
recopiée. Une consigne tirée d'une mémoire de phase, d'une passation ou d'un tableau de bord hérite
des erreurs de son auteur tout en empruntant la crédibilité de la source qu'elle cite : mesuré, un
prompt de relais a énoncé la règle qu'un correctif avait **retirée**, en citant ce correctif par son
SHA, et quatre artefacts en aval l'ont reprise sur trois sessions. Et la première rédaction
de ce gabarit l'a reproduit en petit : « crée ta branche derrière la porte de fraîcheur » recopiait
une règle en perdant sa condition — le point de départ —, et la branche naissait sur celle du lot
mort (mesuré). Un pointeur se relit sur disque au moment où il sert ; un
énoncé, non.

Les crochets sont à remplir ; **tout le reste se recopie tel quel**. Une ligne qu'on ne peut pas
remplir est une ligne qui manque à la passation, pas une ligne à supprimer : la mettre à
« <rien> » est une information.

---

Tu réalises le **lot \<k>/\<n>** de l'issue #\<N> — « \<titre du lot> ». Les lots \<…> sont
mergés ; c'est ton tour.

Tu travailles dans \<le clone principal `\<chemin>` | le worktree `\<chemin absolu>` | rien, sous
coordinatrice : le worktree de la session de lot naît à son démarrage>.
`origin/\<trunk>` = `\<SHA complet>` (vérifié à l'instant).

\<Si worktree, sans coordinatrice : tu es sur la branche **mergée** du lot précédent.
`git fetch origin`, puis
`git checkout -b \<type>/\<slug> origin/\<trunk>` — le point de départ est **explicite** : sans lui,
`checkout -b` part de la branche morte et emporte ses commits réécrits (mesuré). Supprime ensuite
cette branche, locale **et** distante ; le pourquoi et le repli sont à `pr-paralleles` Étape 8,
« Issue en plusieurs lots ». Rejoue la commande `install` des piles que ton lot touche si un verrou
a bougé, puis la commande `lint`, fumée de `pr-paralleles` Étape 3, « Provisionner son worktree ».>

\<Si session de lot d'une coordinatrice : ton premier geste, ta base et ton Étape 8 sont à
[coordinatrice.md](coordinatrice.md), « La session de lot ».>

\<Si vague `pr-paralleles` : \<adresse du lead>, et « réponds toujours au `from` de ce message ».
Ce que le lead est, et ce qu'il n'est jamais : `cycle-pr`, « Vague parallèle » en tête du skill, et
`.claude/rules/contraintes.md`, « Jamais d'auto-merge dans le trunk ».>

Ne charge `task-observer` que sur demande du mainteneur (`CLAUDE.md`, « Observation
continue »). Lis `CLAUDE.md` et `.claude/pipeline.config.md`. Puis invoque le skill `cycle-pr`
(outil Skill) avec \<N> : tu portes le cycle complet et délègues le code (`cycle-pr` 3.1), et tu
lances toi-même ton `verificateur` d'avant-go (Étape 7). Ton effort est celui de ton démarrage :
ne le change pas en cours de session (barème de `coordinatrice.md`, « Au go du découpage »).

**Ton brief est le bloc « \<titre du lot> » du corps de #\<N>**, plus le brief d'agent en
commentaire (`gh issue view \<N> --comments`). Lequel l'emporte quand ils divergent : `cycle-pr`
Étape 1, « Auto-challenge du plan ». \<Si lot intermédiaire : la forme du corps de PR d'un lot qui
ne ferme pas l'issue est à `cycle-pr` Étape 2, « Cas découpé ».>

Ta session de relecture se démarre à ton go, dans ta fenêtre : c'est toi qui la démarres, la
réveilles et la nettoies (`cycle-pr/references/session-relecture.md`) ; le sous-agent `relecteur`
n'en est que le repli.

**Ce que mon lot a payé et que le tien n'a pas à re-dériver** — un point par ligne, chacun avec
l'artefact qui le porte, jamais l'énoncé seul :

- \<pièges d'outillage payés, chacun avec le § de skill ou la ligne de `pipeline.config.md` qui le
  consigne désormais — un piège consigné nulle part est une ligne à ajouter là-bas, pas ici>
- \<chiffres du bilan, avec la ligne du « Journal de spec » de l'issue qui dit en quelle grandeur
  ils se comparent d'un lot à l'autre>
- \<ambiguïtés de critère levées, chacune avec la ligne du « Journal de spec » qui la porte>
- \<état du seed à ton entrée, avec le critère du corps qui fixe sa population et son dénombrement>

**Ce que je n'ai pas fait, et pourquoi** : \<chaque point tranché, avec la décision qui le laisse —
jamais un point encore ouvert | rien>. \<Ce qui concerne d'autres branches ou
d'autres lots : section Notes de la PR #\<M>, lignes « Fichiers croisés » et « Non vérifié » du
verdict d'avant-go — le pointeur, jamais leur résumé.>

Préviens \<la coordinatrice | le mainteneur | le lead> quand tu as fini, ou si tu trouves un
bloquant qui dépasse ton périmètre — message de fin : `sessions-liees.md`, « Fin de travail ».

---

## Variante — relais en cours de lot

Écrite par la session dont le contexte se remplit avant la fin de son cycle (`cycle-pr` Étape 8,
« Relais en cours de cycle »), et remise comme le prompt ci-dessus. Elle en garde
les lignes « Tu travailles dans… », « Charge le skill… », « Ton brief… » et « Préviens… » ;
elle remplace la première ligne par la suivante, et ajoute les quatre d'après.

Tu **reprends** le lot \<k>/\<n> de l'issue #\<N> en relais de la session `\<uuid>`, dont le
contexte s'est rempli à l'Étape \<x> de `cycle-pr`. La PR #\<M> est ouverte (\<draft | ready>),
tête `\<SHA complet>` ; reprends à \<l'étape et au commit qui suivent>.

Bilan de la session sortante, déposé hors du dépôt :
`retrospectives/\<date>-\<issue>-relais-\<k>.txt` (dossier voisin du journal, chemin dans
`CLAUDE.md`) — ce qu'en fait ton Étape 8 : `cycle-pr` Étape 8, « Bilan chiffré du cycle ».

Entrées du journal d'observations déjà écrites pour ce cycle : \<numéros | aucune> — plafond :
`CLAUDE.md`, « Observation continue ».

Ta session de relecture : `\<local_…>`, démarrée par la session sortante — tu la réveilles par
message, et elle répond à l'émetteur du réveil ; ses notes de fin de tour vont à son parent, la
session sortante : envoie chaque réveil avec `notify_when_idle: true` (`session-relecture.md`,
« Réveil »).

\<Si vague `pr-paralleles` : \<adresse du lead> ; ton premier message au lead : `pr-paralleles`
Étape 5, « Session relayée ».>
