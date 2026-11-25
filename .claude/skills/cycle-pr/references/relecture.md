# La relecture indépendante — détail de `cycle-pr`

Passages déplacés mot pour mot de `cycle-pr/SKILL.md`, chacun sous le titre que
cite son renvoi. Les liens `references/…` qu'ils portent se lisent depuis le dossier du skill,
et leurs renvois de position (« ci-dessous », « plus bas ») depuis l'emplacement du renvoi.

## Ces portes sont additives

Ces portes sont **additives**. Aucune ne remplace le prompt de
`.claude/rules/cleanup-verbatim.md`, que la règle exige mot pour mot, ni la relecture à contexte
vierge : elles retirent du plateau du relecteur ce qu'un outil sait trouver, pour qu'il dépense
son contexte sur ce qu'aucun outil ne voit — les hypothèses qui ont produit le code et les
affirmations attachées au code. Mesuré sur le delta de cette PR : la relecture mécanique a rendu
**un** défaut de correction que les deux passes à contexte vierge n'avaient pas vu, et **zéro**
constat sur la prose de protocole, où vivaient leurs neuf constats. Une porte neuve s'inscrit dans
la config avec ses deux populations — ce qu'elle couvre, ce qu'elle rate — avant d'être rendue
obligatoire.

## Un worktree de relecture par PR, jamais l'arbre de la session PR

**Un worktree de relecture par PR, jamais l'arbre de la session PR.** Éprouver un test
sérieusement, c'est casser la garde qu'il protège et la voir rougir — donc **modifier le code de
production**, puis le restaurer ; dans l'arbre partagé, cela gèlerait la session PR et ses
équipiers pendant toute la passe, sur un arbre qui bouge. Ils continuent ici pendant ce temps,
sans rien attendre. Une session de relecture qui commit ou pousse depuis ce worktree a dépassé
son rôle. Son worktree est celui de l'application, né à son démarrage et nettoyé par la session
PR à son Étape 8 ; celui du sous-agent de repli a ses trois gestes — naissance, réutilisation,
retrait — au même fichier, « Repli ».

## Le contrat du harnais de mutation et ses pièges

Son `--help` porte le contrat complet — le JSON `{targets, reporter, label, stack, mutations}`,
les trois verdicts `ROUGE` / `VERT` / `PANNE`, le témoin joué **une seule fois** sur l'arbre
propre avant toute mutation, les fins de ligne du fichier muté appliquées à `old`, la
restauration octet pour octet. Il l'imprime en **sortant en 2** : le lire seul, jamais enchaîné
derrière un `&&`. Ni 4.2 ni `relecteur.md` ne le redécrivent : un harnais décrit est un harnais
réécrit, et celui-ci l'a été **sept fois**, deux fois faux dans le sens qui mente.

Deux réglages tiennent tout l'écart de coût : `targets` reçoit le **fichier de test visé**, pas
la suite entière, et `file` est indépendant de `targets` — muter un fichier en lançant le test
d'un autre ne demande donc aucune cérémonie, ce qui rend bon marché la preuve d'un épinglage
inter-fichiers. Trois pièges d'usage, payés : une ancre `old` se relit dans le fichier
**formaté** (une ancre tapée avant la commande de format rend `PANNE`) ; un `expect` qui nomme
un test absent des `targets` rend « apparie 0 tests de la suite témoin » — ce n'est pas une faute
de frappe, c'est une mauvaise cible ; et une ancre se choisit **dans le code**, jamais dans la
prose qui le cite — le harnais vérifie qu'elle est unique, pas qu'elle est du code. Prise dans un
commentaire, l'ancre mute le commentaire et rend `VERT` sans rien prouver — seul le cas où elle
ne mute rien du tout est refusé en `PANNE` par le harnais.

Un couple **VERT sur arbre propre, ROUGE avec une sonde plantée** n'est pas un échec du harnais :
c'est la mesure qu'un invariant *non gardé* est *gardable*, donc le signal qu'il faut écrire le
test.

## Le cliquet — dénombrer avant de corriger, pas après

**Le cliquet — dénombrer avant de corriger, pas après.** Un constat de relecture est un
échantillon, jamais un inventaire : dès qu'un correctif ferme **un chemin** d'une classe (voir le
déclencheur de `cleanup-verbatim.md`), le dénombrement des chemins de cette classe s'écrit
**avant** le premier correctif, et il part de la **source de la population** — le bloc, les
décisions verrouillées, la liste des sites d'une règle —, jamais des constats : sur une PR, le
dénombrement recopiait les 9 invariants cités par le relecteur, et la passe suivante en a trouvé
4 de plus, dont 2 sites sans garde. Il s'écrit dans la **docstring du test paramétré**
qui les éprouve, qui nomme cette source — « une entrée par point du bloc X et par décision Y » — et
rend N recensés, k fuyaient ; la relance reçoit la source et le dénombrement, avec la consigne de
chercher celui qui manque. Écrit après, il se fait par morceaux : trois correctifs de suite sur
une même classe, chacun rouvert par la relecture suivante, et le dénombrement rendu à la
quatrième — par le relecteur. Le cliquet est ce qui empêche la classe de se re-payer.

## Quand une garde imite un analyseur, c'est l'analyseur qui la corrige

**Quand une garde imite un analyseur, c'est l'analyseur qui la corrige.** Si une passe renvoie
**plusieurs** formes qui échappent à une garde lisant un format structuré par motif — YAML, TOML,
Dockerfile, HTML, prose —, ne pas élargir le motif : lire le fichier avec l'analyseur du format,
ou avec la règle exacte de l'outil que la garde protège, et comparer les décomptes des deux
lectures. Un élargissement par constat est un correctif de symptôme, et chacun introduit sa
régression — mesuré : trois tours, une vingtaine de formes, des décomptes cassés par
l'élargissement précédent. La classe n'est pas « le motif est trop étroit », c'est « le motif
n'est pas l'analyseur ». Quand aucun analyseur ne s'applique, la sortie est le **retrait** de la
garde, sa population explicitement bornée dans sa docstring, jamais un motif de plus.
Le déclencheur est la **structure** du correctif, jamais sa direction : tout correctif qui
**change la population appariée** par un motif — l'élargir comme la rétrécir — relève de ce
paragraphe, et une mutation de **chaque** occurrence réelle de la classe doit rester `ROUGE`
après lui. Le **rejeu des mutations déjà jouées** est la seule mesure qui distingue un correctif
d'un défaut déplacé : sur un lot, un ancrage ajouté pour fermer un faux positif tuait la
détection de la seule occurrence réelle, et seul ce rejeu l'a vu.

## Une lentille navigateur, dès qu'un script client entre dans le delta

**Une lentille navigateur, dès qu'un script client entre dans le delta.** Un comportement vérifié
« à l'écran » l'est sur le parcours où il a été conçu ; ses défauts vivent sur les autres. La
lentille est un **script de navigateur rejouable** — la commande `e2e ciblé` de
`.claude/pipeline.config.md`, cache HTTP désactivé, données jetables —, jamais une démonstration
regardée : un parcours joué à la main ne se rejoue pas au commit suivant, et c'est la session de
relecture qui le lance, dans son worktree, parce que la session PR l'a déjà fait vérifier sur le
chemin qu'elle a choisi. Si la ligne `e2e ciblé` vaut `n/a`, la lentille se rapporte comme non
jouée, avec le motif de la ligne. Matrice minimale, quatre points :

1. chaque geste sur l'écran **renvoyé en erreur par le serveur** ;
2. chaque geste **combiné aux gestionnaires que le framework pose sur les mêmes éléments** ;
3. les combinaisons de gestes qui atteignent le même état final **par des chemins différents** ;
4. la **console**.

Mesuré : quatre bloquants sortis de cette seule matrice, tous hors du parcours nominal, sur un
script que l'auteur avait vérifié à l'écran et le mainteneur validé à l'arrêt visuel — et dont un
correctif de lot précédent s'était déclaré clos sur le geste nominal.
