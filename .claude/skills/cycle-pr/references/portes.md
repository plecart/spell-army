# La porte de fraîcheur — détail de `cycle-pr`

Passages déplacés mot pour mot de `cycle-pr/SKILL.md`, chacun sous le titre que
cite son renvoi. Les liens `references/…` qu'ils portent se lisent depuis le dossier du skill,
et leurs renvois de position (« ci-dessous », « plus bas ») depuis l'emplacement du renvoi.

## Deux prédicats, pas un

**Deux prédicats, pas un.** `--is-ancestor` dit « ancêtre **ou égal** » : une seule direction ne
distingue donc pas l'égalité du retard, et la porte laisserait passer l'autre cas. Les deux
ensemble valent l'égalité — `main` ancêtre d'`origin/<trunk>` **et** l'inverse ⇔ même commit.
`git fetch` est **sa propre commande** et précède les deux : c'est lui qui rend `origin/<trunk>`
significatif. Et c'est `&&` qui rend la porte bloquante — une chaîne de trois commandes passe le
garde de permissions, **en worktree isolé compris** (mesuré le 2026-10-13 : ce que le garde refuse
est la **substitution de commande**, pas la longueur de la chaîne). **Non vérifié** :
cette mesure a été prise avec une troisième commande **en lecture** ; la forme écrivante n'a pas
été provoquée, parce qu'elle n'est pas inoffensive. Un refus à cet endroit se reconnaîtrait tout
seul, et la sortie serait de jouer les deux prédicats en une commande chacun, puis l'action — en
acceptant que la porte redevienne alors une lecture, et en le disant.

Les deux directions, mesurées le 2026-10-13 sur un dépôt jetable avec un vrai distant : branche
**en retard**, `--is-ancestor main origin/<trunk>` rend 0 et `--is-ancestor origin/<trunk> main`
rend **1** ; branche **en avance**, c'est l'inverse. Chaque prédicat bloque donc exactement sa
direction, et aucun des deux ne suffit seul.

La forme précédente, `git rev-parse main origin/main`, voyait les deux directions mais
**imprimait** au lieu de garder — c'est un incident mesuré, et la classe entière vit à l'Étape 7,
« Le go, puis le merge ». Une porte à **un** prédicat aurait fermé ce cas en rouvrant l'autre :
c'est tout l'intérêt d'en mettre deux.

## Au blocage

**Au blocage**, laquelle des deux a mordu se lit par `git status -sb`, qui écrit `[ahead n]` /
`[behind n]`. Pas `git status` nu, qui le dit en prose, et **surtout pas**
`git status --porcelain`, **vide** sur une branche en avance (mesuré) — c'est pourquoi la sonde
d'outillage ci-dessus, qui exige un `git status` vide, ne voit pas ce cas et ne peut pas servir de
contrôle compensatoire. Rattrapages : `main` local en avance → demander à l'utilisateur de
pousser, ou l'autorisation de le faire ; `origin/<trunk>` en avance → sur `main`,
`git pull --ff-only`. Dans les deux cas, rejouer la porte.
