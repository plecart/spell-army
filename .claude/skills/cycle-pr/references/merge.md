# Avant le merge — détail de `cycle-pr`

Passages déplacés mot pour mot de `cycle-pr/SKILL.md`, chacun sous le titre que
cite son renvoi. Les liens `references/…` qu'ils portent se lisent depuis le dossier du skill,
et leurs renvois de position (« ci-dessous », « plus bas ») depuis l'emplacement du renvoi.

## Une porte est une commande dont le code de sortie porte la condition

**Une porte est une commande dont le code de sortie porte la condition ; `&&` est ce qui la rend
bloquante.** Trois incidents, une seule classe. Une commande qui **imprime** n'est pas une porte,
enchaînée ou non — `git rev-parse main origin/main` a affiché deux SHA différents en sortant en 0,
et la branche a été créée quand même ; `git fetch && git rev-parse origin/main &&
gh pr merge` a affiché une base nouvelle, puis mergé. Et **une lecture suivie d'une
seconde commande n'en est pas une non plus** : la fenêtre entre les deux est exactement là où
l'état change quand plusieurs écrivains visent la même cible. La forme à substitution de
commande — `test "$(git rev-parse origin/<trunk>)" = "<sha>" && …` — est **refusée** par le garde
d'une session isolée en worktree ; `--is-ancestor` est la forme acceptée, et elle vaut l'égalité
parce que le trunk n'avance que vers l'avant. Mesuré le 2026-10-13, témoin de chaque côté : **1**
quand le trunk a avancé, **0** sur deux références égales — table `FRESHNESS_GATE_FORMS` de
`.claude/tests/test_agent_skills.py`. La porte de merge vers le trunk chaîne **deux**
prédicats, chacun par son `&&` : `--is-ancestor` pour le trunk éprouvé, puis
`<répertoire de ce skill>/scripts/porte-merge.py conversation <n>` pour la conversation depuis le
relevé du verdict (`cycle-pr` Étape 7, « Le go, puis le merge » ; table `PORTES_PRESCRITES` du
même fichier).

## Et cinq contrôles restent des lectures, par construction

**Et cinq contrôles de ce skill et de `pr-paralleles` restent des lectures, par construction.**
Une porte n'a de sens que devant **une commande** : les deux auto-vérifications du `relecteur`
(4.2) précèdent une **phase entière** de travail, il n'y a rien à quoi se chaîner ; la
comparaison entre l'état de la forge et une référence locale avant `git branch -D` (`pr-paralleles`
Étape 8) porte sur les valeurs
de **deux outils**, donc exige la substitution que le garde refuse ; et les deux contrôles que la
coordinatrice lit avant d'ouvrir un lot — passation présente, `merge-tree` à 0 — précèdent un
`SendMessage`, un outil et non une commande
([references/coordinatrice.md](references/coordinatrice.md)). Elles se lisent, et elles le disent.
Le dénombrement de la classe, pris avant ces deux derniers — 15 sites, 10 portes, 6 qui fuyaient —
vit dans la docstring de `test_la_porte_de_fraicheur_porte_sa_condition_dans_son_code_de_sortie`,
avec la commande qui le re-dérive et la raison pour laquelle ce motif sous-compte. Re-dérivée le
2026-10-29, cette commande, à la révision `c459f04` qu'elle porte, rend les 17 lignes de la
docstring en 3 fichiers — `relecteur.md` 2, `cycle-pr/SKILL.md` 8, `pr-paralleles/SKILL.md` 7 — :
14 contrôles distincts, plus la porte de merge qu'aucun motif ne voyait, font les 15 sites.
