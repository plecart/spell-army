# Wizard Army — Game design

État au 2026-11-17. Ce document détaille la section « Combat et calibrage » du
[cadrage](etudes/00-cadrage.md), qui fait foi en cas de désaccord (rang 1 des sources de vérité). Il
remplace l'[étude 05](etudes/05-game-design.md), non retenue.

Statuts, comme au cadrage :

- **Décidé** : tranché par le mainteneur.
- **Proposé** : choix technique de Claude ou valeur de départ, à confirmer ou à régler par simulation.
- **Ouvert** : à trancher plus tard.

Principe directeur : **le simulateur le plus simple possible pour le MVP**. Le combat est calculé hors
ligne ; il produit le script d'une vidéo, qui peut condenser ou romancer.

## 1. Le personnage

| Sujet | Règle | Statut |
|---|---|---|
| Statistiques | Quatre, de 0 à 15 : **Vie**, **Force**, **Magie**, **Vitesse**. Pas de Soin (les soins sont des sorts de Magie), ni défense, ni niveau. | Décidé |
| Total | **30 points exactement** par personnage. | Décidé |
| Classe | Huit classes, à probabilité égale : Magicien, Golem, Guerrier, Nain, Vampire, Druide, Paysan, Fée. Chaque classe fixe une **plage par stat** (annexe A). | Décidé |
| Loterie | L'identifiant tire la répartition à l'intérieur des plages : un magicien peut être excellent (Magie 15) ou mal né (Magie 5). Voulu : on va voir sur le site si son personnage est bon. | Décidé |
| Tirage des stats | Chaque stat part de son minimum ; les points restants sont donnés un par un, au hasard de l'identifiant, aux stats sous leur maximum. Une classe est valide si Σ minimums ≤ 30 ≤ Σ maximums (vérifié par un test). Dés dérivés d'un hachage de l'identifiant, jamais du générateur aléatoire du langage. | Proposé |
| Sort | **Un seul sort par personnage**, tiré **indépendamment de la classe** (contre-emploi assumé). | Décidé |
| Attribution du sort | Tiré **une fois, à l'inscription**, dans la réserve tirable du moment, puis enregistré. Ajouter un sort ne change pas ceux des joueurs inscrits. Le mainteneur peut donner un sort à la main. Classe et stats restent un pur calcul à partir de l'identifiant. | Proposé |
| Personnalisation | Plus tard, hors MVP. Au MVP, chaque personnage reçoit le modèle, le décor et le socle de sa classe ; les changer personnage par personnage, par le MCP, vient plus tard. Aucun choix n'est fait par le joueur ([direction artistique](direction-artistique.md) § 5). | Décidé |

## 2. Les sorts

**Puissance d'un sort lancé par l'armée** (décidé) :

> valeur = coefficient du sort × **stat de l'armée** selon la recette × **efficacité du lanceur**
> efficacité = 50 % + 50 % × stat du lanceur selon la recette / 15

La stat de l'armée est la **somme** de celles de ses personnages : l'armée donne la puissance, le
lanceur l'efficacité. Un chevalier sans magie qui lance une boule de feu fait encore la moitié d'un
magicien parfait.

| Sujet | Règle | Statut |
|---|---|---|
| Recette | La part de chaque stat utilisée (ex. 20 % Force + 80 % Magie). L'efficacité se calcule sur la même recette. | Décidé |
| Formes | **sûr** ; **coûteux** (plus fort, l'armée perd un peu de Vie) ; **conditionnel** (selon les blessures de l'armée, la Vie du monstre, la composition de l'armée) ; **inversé** (l'efficacité monte quand la stat du lanceur est basse). **Ni pari ni critique** : la loterie vient des variables. | Décidé |
| Effets | **dégâts**, **soin**, **vol de vie**. Ni bouclier, ni ralentissement, ni état qui dure. | Décidé |
| Vol de vie | Moins fort qu'un sort de dégâts : la valeur totale d'un sort mixte (dégâts + soin) ne dépasse jamais ×1,0. | Décidé |
| Unicité | Deux sorts n'ont jamais la même combinaison recette + forme + effet (vérifié par un test). | Décidé |
| Rareté | Chaque sort a un **poids de tirage**, égal pour tous par défaut. **Poids 0** : jamais tiré, seulement donné à la main (sort propre à un joueur). | Décidé |
| Stockage | Les sorts vivent en base avec leur **visuel**, gérés par le MCP. | Décidé |
| Réserve de départ | 24 sorts (annexe B). | Proposé |

## 3. Le monstre

| Sujet | Règle | Statut |
|---|---|---|
| Statistiques | Les mêmes quatre : Vie, Force, Magie, Vitesse. Pas de classe. | Décidé |
| Attaques | **2 à 4 attaques nommées**, propres à lui, chacune avec sa recette (Force et Magie du monstre) et son coefficient. | Décidé |
| Choix de l'attaque | **Au hasard parmi ses attaques**, comme l'armée tire parmi ses personnages : le monstre est « une petite armée de sorts ». | Décidé |
| Tirage sans remise | Comme pour l'armée : chaque attaque sort une fois avant qu'une autre ne ressorte (pas quatre souffles d'affilée). | Proposé |
| Puissance d'une attaque | Coefficient × stat du monstre selon la recette, **sans efficacité** (le monstre n'a pas de lanceur). Coefficient moyen des attaques d'un monstre : **×0,78**, dans l'unité de l'annexe B (§ 6, « Équilibre »). | Décidé |
| Particularité | Une par monstre : résiste à la magie de X %, faible contre une classe, se régénère… Effets détaillés plus tard. | Décidé (effets ouverts) |
| Profil | Chaque monstre répartit son budget à sa façon (un golem de lave : beaucoup de Vie, peu de Vitesse), sans changer sa difficulté (§ 6). Des multiplicateurs de moyenne 1 n'y suffisent pas (mesuré : golem de lave, Vie ×1,5 et Vitesse ×0,5, laisse 100 % de victoire à budget égal) : chaque profil reçoit un **facteur d'échelle** trouvé une fois par simulation, pour que le monstre égal à l'armée lui laisse 50 % (golem de lave : ×1,165). | Proposé |
| Pas d'éléments | Aucun système feu / eau / … au MVP. | Décidé |

## 4. Le combat

| Sujet | Règle | Statut |
|---|---|---|
| Action de l'armée | On tire un personnage, il lance **son** sort avec la puissance de l'armée (§ 2). | Décidé |
| Tirage | **Jamais deux fois le même personnage** dans un combat tant que tous n'ont pas joué. | Décidé |
| Initiative | Rapport R = Vitesse de l'armée / Vitesse du monstre. Le monstre joue une fois par tour ; l'armée cumule R actions par tour et joue chaque fois que son compteur passe 1, le reste étant gardé (R = 1,25 → 5 actions pour 4). Égalité : l'armée d'abord. Une vitesse totale de 0 compte pour 1. Le compteur part de **0,5** : parti de 0, il retirait sa première action à l'armée dès que le monstre est un peu plus rapide (mesuré : monstre 2 % plus fort, victoire de 51 % à 7 % ; avec 0,5, 35 %). | Décidé (délégué à Claude) |
| Fin | Victoire quand la Vie du monstre tombe à 0 ; défaite quand celle de l'armée tombe à 0. **Pas de limite de durée** : un long combat se raconte en ellipse. | Décidé |
| Garde-fou | Au-delà d'environ 10 000 actions, défaite « par épuisement », signalée au journal. Sécurité du programme, pas règle du jeu. | Proposé |
| Soin | Ne dépasse pas la Vie maximale de l'armée. | Proposé |
| Déterminisme | Graine du combat = hachage (saison, chapitre, tentative) ; chaque dé en dérive. Même graine, mêmes entrées → même combat (ADR 0001). | Proposé |

**Selon la taille de l'armée.** Tout est une somme et le monstre est dimensionné sur l'armée : un
combat équilibré dure à peu près le même nombre d'actions à 1 qu'à 100 000 joueurs, seuls les
chiffres grossissent.

| Armée | Qui joue | Particularité |
|---|---|---|
| 1 (jour 1) | le mainteneur, à chaque action | un duel |
| 10 (jour 2) | chacun environ une fois | tout le monde est nommé |
| 1 000 | une dizaine de tirés, tous différents | la loterie du tirage fait les héros |
| 100 000 | idem | les chiffres sont énormes, les rapports restent proches de 1 |

## 5. Le trucage

| Sujet | Règle | Statut |
|---|---|---|
| Qui | Autant de personnages forcés que voulu (en pratique peu), choisis pour une raison **extérieure au jeu** (commentaire, partenaire), jamais sur leurs stats. | Décidé |
| Position | Option par forcé : **premier**, **dernier** ou **au hasard au milieu**. | Décidé |
| Traduction | Premier : les premières actions de l'armée. Dernier : la première action de l'armée en phase finale (un camp sous 25 % de sa Vie). Milieu : position tirée par la graine entre la 2e et la 10e action. Un forcé que le combat n'a pas atteint est signalé au journal. | Proposé |
| Honnêteté | Le combat est calculé **une fois**, après le choix des forcés, jamais relancé parce que l'issue déplaît. Un forcé remplace un tiré : avec le plancher de 50 %, il déplace les dégâts de quelques pourcents, sans biais en moyenne. Le journal dit qui était forcé. | Proposé |

## 6. Le calibrage

**Le combat décide, sur les statistiques** (décidé). Pas de moral, pas de verdict tiré à part : si le
monstre est trop fort, c'est un objectif à passer ; trop faible, le suivant grossit.

**Règle d'origine du mainteneur**, reprise telle quelle : jour 1, le mainteneur seul contre un monstre
de sa force ; jour 2, un monstre prévu pour 10 ; ensuite, l'armée actuelle + environ 70 % des recrues
de la veille, fixé 24 h avant le combat de minuit ; après une défaite, même monstre ; il ne grossit
qu'après une victoire ; pourcentage revu tous les 3 jours, à la baisse après 2 défaites de suite.

Sans hasard, cette règle revient à : **l'armée gagne si elle recrute aujourd'hui au moins 70 % de ce
qu'elle a recruté hier.** Elle mesure l'élan, pas la taille. La revanche presque gagnée d'avance est
voulue : on ne perd pas plusieurs fois de suite contre le même monstre.

| Cassure | Correction | Statut |
|---|---|---|
| Dimensionner sur le nombre de têtes ignore le hasard de la composition (une armée tombée sur beaucoup de fées). | Dimensionner sur les **stats réelles** de l'armée (sommes). | Décidé |
| Un pic viral d'un jour fixe un monstre énorme et la traîne ne le rattrape pas (simulé : 19 défaites d'affilée après 5 000 recrues). | Recrues de référence = **médiane des 3 derniers jours**. Le cadrage est amendé en ce sens. | Décidé |
| « Baisser le pourcentage après 2 défaites » n'agit pas : le monstre en cours est déjà fixé. | À la 2e défaite, puis à chaque nouvelle paire de défaites de suite, le même monstre est **recalculé avec p baissé**, depuis son budget d'origine. Il ne peut que rétrécir. | Décidé |
| À grande échelle, une armée qui croît lentement voit l'écart de recrues (≤ 1 %) écrasé par le hasard du tirage. | **Assumé**, conséquence de « le combat décide ». L'absence de pari et de critique réduit ce hasard. La vidéo ne dit pas « il manquait des recrues » quand ce n'est pas vrai. | Décidé (limite connue) |

**Calcul du prochain monstre** (décidé), fixé juste après le combat précédent :

> budget = stats réelles de l'armée + p × recrues de référence × recrue moyenne
> monstre = budget × profil du monstre

| Variable | Valeur de départ | Statut |
|---|---|---|
| p | 70 % | Décidé |
| Recrues de référence | médiane des 3 derniers jours | Décidé |
| Recrue moyenne | moyenne par stat tirée des tables de classes : Vie 7,6, Force 7,6, Magie 7,5, Vitesse 7,3 (annexe A) | Décidé |
| Équilibre | réglé une fois par simulation : un monstre égal à l'armée lui laisse **50 %** de chances (« de sa force »). Réglé par le coefficient moyen des attaques du monstre, ×0,78 : 51 % à 1 000 et à 100 000 personnages, 56 % à 10 ; un combat équilibré dure 9 actions de l'armée en médiane (7 à 12 pour 80 % des combats). Équilibre raide : ×0,79 donne 44 %, un monstre 5 % plus faible 89 à 90 %, 5 % plus fort 12 à 13 %. | Décidé |
| Jour 2 | budget = 10 × recrue moyenne (mesuré : 52 % contre 10 personnages tirés) | Proposé |
| Baisse de p à la 2e défaite | 10 points (p de départ : 70 % → 60 %) à la 2e défaite de suite ; le monstre en cours est recalculé depuis son budget d'origine. La baisse reste pour les monstres suivants. Nouvelle baisse de 10 points, avec un nouveau recalcul, à chaque nouvelle paire de défaites de suite (4e, 6e…). p ne descend jamais sous 0. p ne remonte jamais seul : une victoire le laisse tel quel, il ne remonte qu'à la revue des 3 jours du mainteneur, par le MCP. | Décidé |

Tous ces réglages vivent en base, modifiables par le MCP.

## 7. Saison et histoire

| Sujet | Règle | Statut |
|---|---|---|
| Format | Un feuilleton : « Jour X — recruter une armée assez forte pour affronter Y ». | Décidé |
| Y | Le 30e monstre, grand méchant annoncé dès le jour 1 : son nom et son histoire, **pas ses stats** (calibré comme les autres). Les 29 premiers sont ses lieutenants. | Proposé |
| Avancée | L'histoire avance à la **victoire** : une défaite rejoue le chapitre. Compteur « chapitre 12/30 — jour 14 ». | Proposé |
| Fin de saison | Record à battre : « Y est tombé au jour 34 ». Saison 2 : nouveau bestiaire, **même armée** (rien à remettre à zéro). | Proposé |
| Contenu | Les 30 monstres, leurs attaques, leurs particularités, l'histoire. | Ouvert |

## 8. La prédiction

| Sujet | Règle | Statut |
|---|---|---|
| L'afficher ? | Pas au MVP : le site y est l'annuaire seul ([cadrage](etudes/00-cadrage.md), « Combat et calibrage », ligne « Site »). Après le MVP, le mainteneur doute encore que ce soit constructif. | Ouvert |
| Si affichée | « Si on combattait maintenant » : le combat de minuit simulé quelques milliers de fois avec l'armée du moment. Un fait, pas une projection ; il monte à chaque recrue ; aucun objectif de recrues affiché. | Proposé |

## 9. Le journal du combat

Un JSON par combat, seule source du script vidéo et des statistiques du site (proposé).

| Bloc | Contenu |
|---|---|
| En-tête | version des règles et de la réserve ; saison, chapitre, jour, tentative ; graine ; monstre (stats, profil, attaques, particularité) ; armée (effectif, sommes des stats, part de chaque classe) ; p et recrues de référence ; forcés (identifiant, position, motif) |
| Par action | numéro ; camp ; acteur (identifiant, classe) ou attaque du monstre ; sort ; recette ; stat de l'armée ; efficacité ; valeur ; Vie des deux camps avant → après ; forcé ou non |
| Moments | repérés automatiquement, chacun avec un score : COUP_DÉCISIF, CONTRE_EMPLOI (efficacité ≤ 60 %), SPÉCIALISTE (≥ 95 %), PLUS_GROS_COUP, SURSAUT (sort conditionnel au-delà de ×1,5), RETOURNEMENT (le vainqueur est passé sous 25 %), SOIN_GÂCHÉ (armée intacte), FORCÉ, FORCÉ_NON_JOUÉ, ÉPUISEMENT |
| Bilan | issue ; nombre d'actions ; Vie restante ; liste des tirés |

Le montage retient les moments au meilleur score ; les longs passages se condensent. Les
commentaires de la vidéo précédente relèvent de la phase 2, hors journal.

## 10. Points ouverts et écarts avec le cadrage

| # | Sujet | Ce qu'il faut |
|---|---|---|
| 1 | Prédiction : le cadrage, ligne « Site », la sort du MVP le 2026-11-16, avec les statistiques du monstre. Reste à savoir si elle revient après le MVP. | Trancher après le MVP ; amender le cadrage si on la retire tout à fait. |
| 2 | Cadrage, « Conception de l'import », point 2 (Proposé) et ADR 0001 / 0003 : « le personnage est un calcul à partir de l'identifiant ». Ce document stocke le sort à l'inscription. Classe et stats restent calculées ; le tirage du sort reste une fonction pure (identifiant, réserve), écrite une fois, ce que l'import idempotent permet. | Préciser l'ADR 0003 au moment de l'implémenter. |
| 3 | Plages des classes, coefficients des sorts et des attaques, équilibre, recrue moyenne : **réglés le 2026-11-16** (annexes A et B, § 3, § 4, § 6). Deux écarts mesurés, **assumés le 2026-11-17** sans correction. Retirer toute une classe déplace la victoire de −4 (Golem) à +5 points (Magicien) : une armée réelle ne perd jamais toute une classe, et le monstre suit les stats réelles de l'armée (§ 6). En duel (armée de 1), un sort de soin pur (6 sur 24, annexe B) ne peut pas gagner, et le combat finit souvent au garde-fou : seul le duel du jour 1 est concerné, son issue se connaît d'avance (sort tiré à l'inscription), et une défaite reste permise. Sensibilité à p : sous 2 % de recrues par jour, victoire de 51 à 60 % quel que soit p ; à 10 %, 85 / 70 / 58 % pour p = 0,5 / 0,7 / 0,9. | Revoir si une classe ou un sort est ajouté : un nouveau sort se mesure contre la réserve avant d'y entrer. |
| 4 | Effets des particularités des monstres ; contenu des 30 monstres et de l'histoire de la saison 1. | Après le MVP du moteur. |

## Annexe A — Plages des classes

Mesuré le 2026-11-16 par simulation (simulateur jetable hors dépôt, armées de 1 à 100 000 personnages, 800 à 6 000 combats par cas) : chaque stat vaut en moyenne près de 7,5 (Vie 7,6, Force 7,6, Magie 7,5, Vitesse 7,3 ; le premier jet donnait 8,5 / 7,7 / 7,5 / 6,3), et aucune classe ne domine.

| Classe | Vie | Force | Magie | Vitesse |
|---|---|---|---|---|
| Magicien | 0–8 | 0–10 | 5–15 | 0–8 |
| Golem | 7–14 | 8–15 | 0–3 | 0–3 |
| Guerrier | 4–11 | 8–15 | 0–5 | 4–11 |
| Nain | 6–13 | 5–12 | 0–8 | 0–8 |
| Vampire | 3–10 | 3–10 | 5–12 | 5–12 |
| Druide | 3–10 | 0–5 | 5–12 | 5–12 |
| Paysan | 0–15 | 0–15 | 0–15 | 0–15 |
| Fée | 0–5 | 0–3 | 8–15 | 8–15 |

## Annexe B — Réserve de départ (24 sorts)

Mesuré le 2026-11-16 par simulation (simulateur jetable hors dépôt, armées de 1 à 100 000 personnages, 800 à 6 000 combats par cas) : chaque sort, retiré de la réserve, déplace la victoire de moins de 4 points (Météore : 12 points avant réglage).

×1,0 = un coup normal, soit un coefficient de **0,2** dans la formule du § 2. « Meilleure stat » : celle du lanceur où il est le plus fort.

| # | Sort | Recette | Forme | Effet |
|---|---|---|---|---|
| 1 | Coup d'épée | 100 % Force | sûr | dégâts ×1,0 |
| 2 | Lancer de rocher | 60 % Force + 40 % Vie | sûr | dégâts ×1,0 |
| 3 | Charge | 50 % Force + 50 % Vitesse | coûteux | dégâts ×1,15 ; l'armée perd 10 % des dégâts infligés |
| 4 | Coup de marteau | 100 % Force | selon la Vie du monstre | dégâts ×1,4 (monstre intact) → ×0,4 (monstre à bout) |
| 5 | Coup vampirique | 100 % Force | sûr | vol de vie : dégâts ×0,5 + soin ×0,5 |
| 6 | Boule de feu | 100 % Magie | sûr | dégâts ×1,0 |
| 7 | Météore | 100 % Magie | coûteux | dégâts ×1,2 ; l'armée perd 15 % des dégâts infligés |
| 8 | Éclair | 70 % Magie + 30 % Vitesse | sûr | dégâts ×1,0 |
| 9 | Drain de vie | 100 % Magie | sûr | vol de vie : dégâts ×0,5 + soin ×0,5 |
| 10 | Tornade | 100 % Vitesse | sûr | dégâts ×1,0 |
| 11 | Soin | 100 % Magie | sûr | soin ×1,2 |
| 12 | Prière | 20 % Force + 80 % Magie | sûr | soin ×0,6 + dégâts ×0,4 |
| 13 | Soin des blessés graves | 100 % Magie | selon les blessures de l'armée | soin ×0,6 (armée intacte) → ×1,6 (armée presque morte) |
| 14 | Cri de ralliement | 100 % Vie | sûr | soin de 20 % de la Vie maximale de l'armée |
| 15 | Rage du désespoir | 100 % Force | selon les blessures de l'armée | dégâts ×0,5 → ×1,5 |
| 16 | Le Barbare ignorant | 100 % Magie | inversé | dégâts ×1,0 |
| 17 | Les golems se relèvent | 100 % Vie | selon la part de golems | soin ×(0,6 + 4 × part de golems) |
| 18 | Appel du clan | meilleure stat | selon la part de la classe du lanceur | dégâts ×(0,4 + 3,5 × part de sa classe) |
| 19 | Talent caché | meilleure stat | sûr | dégâts ×0,85 |
| 20 | Vengeance | dernier coup reçu (efficacité sur la Vie) | sûr | dégâts = 140 % du dernier coup du monstre |
| 21 | Le Poids plume | 100 % Force | inversé | dégâts ×1,0 |
| 22 | Le Rebouteux | 100 % Magie | inversé | soin ×1,2 |
| 23 | Le Coup lent | 100 % Vitesse | inversé | dégâts ×1,0 |
| 24 | Le Sacrifice | 100 % Vie | inversé | soin ×1,1 |
