# Étude 05 — Système de jeu de Wizard Army

> Étude préliminaire du 2026-11-11. Chiffres issus d'un calcul et d'une simulation Monte Carlo jetable
> (8 000 à 30 000 combats par point) : des ordres de grandeur pour calibrer, pas des valeurs figées.

## 1. Critique de l'ébauche

**1. La somme des stats est une unité, pas une mécanique.** Par la loi des grands nombres, la somme d'une
stat ≈ 5,5 × N. Normaliser le monstre sur cette somme revient à diviser N par N : la taille de l'armée n'a
plus aucun effet, contre la promesse « recrute pour renforcer l'armée ». → Supprimer la somme ; garder
N sous forme de **rangs** (bonus logarithmique, borné).

**2. La variance est au mauvais endroit.** Un multiplicateur de 20 % à 150 % porté par une stat cachée
donne un écart-type relatif de 54 % par tirage. Le spectateur ne voit pas « 2 en force » : il voit un coup mou
inexpliqué. L'aléa doit venir de ce qui se nomme à l'écran (« Météore… raté ! »). → Compresser à
60 %–150 % (écart-type 22 % par tirage, 8 % par combat) et loger le hasard dans les sorts.

**3. Le sorcier à l'épée est un ressort, pas un défaut**, s'il reste lisible et non punitif : 20 % des
tirages sont des contre-emplois (affinité ≤ 3), un gag gratuit ; le plancher ×0,6 évite le tour nul.

**4. Être tiré est une loterie, et les escouades n'y changent rien.** Sur une saison (~35 combats × 7
tirages), un abonné a 22 % de chances d'être tiré à 1 000 abonnés, 0,5 % à 50 000 ; d'être **nommé en
vidéo**, 13 % et 0,3 %. Le goulot est la narration : 45 secondes nomment 4 personnes. Leviers réels :
pondérer par l'engagement, laisser la communauté désigner un héros, faire **exister** chaque
personnage hors tirage (fiche consultable).

**5. « Chaque abonné » repose sur une donnée probablement inaccessible.** L'API officielle donne
vraisemblablement le nombre d'abonnés, pas leur liste (à confirmer par l'étude Instagram) ; les
commentaires livrent des identifiants. Le jeu doit tourner avec des **enrôlés** (vus au moins une fois
en commentaire), ce qui règle aussi le consentement : on ne nomme que qui s'est manifesté.

**6. Une issue jouée d'avance tue l'événement ; une défaite punitive tue l'envie.** → Défaite possible
(environ une par semaine), jamais bloquante : le monstre revient le lendemain avec ses PV restants.

**7. Le trucage n'est pas neutre.** Sur un jour type à 82 % : un soin inutile forcé au tour 1 le fait
tomber à 71 %, une boule de feu de spécialiste le monte à 92 % ; trois forcés couvrent 56 % à 100 %.
→ Des règles d'honnêteté (§ 3), pas une illusion de neutralité.

**8. La durée du combat n'a pas à égaler celle de la vidéo.** L'ellipse est dans le concept : on fixe
le **montage** (4 plans), pas le nombre de tours.

**9. La progression est un piège d'état.** Niveaux et XP imposent une base, des migrations, un
rééquilibrage permanent. Une rareté cosmétique dérivée du seed ne coûte aucun état et se voit.

## 2. Proposition v0

### 2.1 Stats et formule

Quatre stats d'affinité, de 1 à 10 : **FOR** (physique), **MAG** (arcanes), **ESP** (soin,
protection), **RUS** (fourberie, malus). Ni PV, ni attaque, ni défense individuels : seule l'armée
encaisse.

- **m = 0,5 + stat / 10** (×0,6 à ×1,5) : le chevalier de l'ébauche garde ses 150 %, le sorcier à 2
  en force passe de 20 % à 70 %.
- **Effet = base du sort × m × T × 2 si critique** (10 %) ; T = bonus de rang (§ 2.5).
- Statuts **à un coup**, sans durée : bouclier (prochaine attaque du monstre), bonus (prochain dégât
  de l'armée), malus (prochaine attaque du monstre), étourdi (le monstre passe son tour). Sans cumul.

### 2.2 Classes

Base de 14 points plus 8 répartis par le seed (plafond 10) : 22 pour tous, spécialisés, jamais
meilleurs.

| Classe | FOR | MAG | ESP | RUS | Identité à l'écran |
|---|---|---|---|---|---|
| Chevalier | 6 | 1 | 4 | 3 | Le pilier, solide partout sauf en magie |
| Golem | 8 | 2 | 3 | 1 | Frappe fort ; hilarant avec un soin |
| Sorcier | 1 | 8 | 3 | 2 | Canon de verre, catastrophique à l'épée |
| Elfe | 2 | 5 | 2 | 5 | Agile : magie et ruse |
| Clerc | 2 | 3 | 8 | 1 | Le soigneur |
| Gobelin | 3 | 2 | 1 | 8 | Fourbe, roi du critique |
| Barde | 1 | 3 | 6 | 4 | Soutien et malus |
| Paysan | 4 | 3 | 4 | 3 | Ni fort ni faible : l'imprévisible |

### 2.3 Dérivation depuis le seed

h = SHA-256(`wizard-army:v1:` + identifiant en minuscules, sans `@`), préfixe immuable. Chaque dé
est un hachage dérivé, `de(h, rôle, i)`, jamais le générateur aléatoire du langage, dont la suite
n'est pas garantie d'une version à l'autre.

| Attribut | Règle |
|---|---|
| Classe | octet 0 de h, modulo 8 (1/8 chacune) |
| Stats | 8 points, chacun vers l'une des 4 stats, plafond 10 |
| Sort | hachage par rendez-vous : le sort qui maximise SHA-256(identifiant + nom du sort) ; un sort ajouté ne réaffecte qu'~1/(n+1) des personnages, contre presque tous avec un modulo |
| Cosmétique | teinte (12), accessoire (10), épithète (« la Distraite », 32) |
| Rareté | « doré » si le dé tombe sous 2 % : purement visuel, ≈ 1 doré dès 50 abonnés |

### 2.4 Réserve de sorts (16)

Valeurs avant ×m × T ; chaque sort produit un plan reconnaissable.

| Sort | Aff. | Effet | Moment vidéo |
|---|---|---|---|
| Coup d'épée | FOR | 10 dégâts | Le classique |
| Charge | FOR | 15 dégâts, 4 de contrecoup à l'armée | « … et s'écrase avec » |
| Coup de bouclier | FOR | 5 dégâts + bouclier 8 | Attaque et parade |
| Lancer de rocher | FOR | 2 à 20 dégâts | Le pari |
| Boule de feu | MAG | 12 dégâts | Explosion |
| Météore | MAG | 25 dégâts, 30 % de raté total | Coup de grâce ou pire raté |
| Bouclier arcanique | MAG | bouclier 18 | Sauvetage |
| Métamorphose | MAG | étourdit, 40 % × m (max 60 %) | Le dragon changé en poule |
| Soin | ESP | soin 15 | Sauvetage, ou gâché à PV pleins |
| Prière | ESP | 6 dégâts + soin 6 | Hybride |
| Bénédiction | ESP | bonus +60 % × m | Prépare le coup suivant |
| Lumière aveuglante | ESP | malus −50 % × m (max −75 %) | Le monstre frappe à côté |
| Dague dans le dos | RUS | 8 dégâts, critique 35 % | Le critique |
| Lancer de poulet | RUS | 1 à 25 dégâts | Le gag |
| Croc-en-jambe | RUS | étourdit, 40 % × m | Chute du monstre |
| Poudre à éternuer | RUS | 4 dégâts + malus −40 % × m | Éternuement géant |

### 2.5 Armée, taille et normalisation

- **100 PV**, remis à plein chaque jour, **affichés en soldats** (« le souffle fauche 14 % de
  l'armée : 140 blessés ») : N se voit sans peser sur la mécanique.
- **Rang** = nombre de chiffres de N − 2 (minimum 0) : Bande (< 100), Compagnie, Légion (1 000+),
  Horde, Empire (100 000+). **T = 1 + 0,1 × rang.**
- Courbe des monstres recalibrée au rang de **début de saison** (PV × T) : grandir en cours de saison
  aide et se fête (« la Compagnie devient Légion ! ») ; la saison suivante retrouve la tension.

| Abonnés | 50 | 1 000 | 50 000 |
|---|---|---|---|
| Ébauche : Σ FOR de l'armée | 275 | 5 500 | 275 000 |
| Ébauche : tours pour abattre un monstre normalisé | identiques | identiques | identiques |
| v0 : rang, T | Bande, ×1,0 | Légion, ×1,2 | Horde, ×1,3 |
| v0 : victoire au 1er essai, moyenne de saison (courbe Bande) | 82 % | 91 % | 93 % |
| v0 : boss final (courbe Bande) | 45 % | 65 % | 72 % |
| v0 : avec recalibrage de saison | ≈ 82 % | ≈ 82 % | ≈ 82 % |
| v0 : tours d'armée médians | 7 | 6-7 | 6 |

À 50 abonnés, la **composition** pèse plus que la taille : sur un jour type à 78 %, quarante armées
de 50 personnages gagnent entre 53 % et 90 %.

### 2.6 Monstres et courbe sur 30 jours

Un monstre = nom, accroche, PV, dégâts de référence D, **3 attaques nommées** (0,7 D poids 3 ; 1,0 D
poids 2 ; 1,8 D poids 1) et **1 particularité** parmi cinq, chacune dite en une phrase : Rage (sous
30 % de PV, dégâts ×1,5), Carapace (premier coup annulé), Régénération (+3 PV par tour), Résistance
ou Faiblesse à une affinité (×0,5 ou ×1,5).

**PV(j) = 40 + 0,8 j ; D(j) = 12 + j / 9.** Jours 7, 14, 21, 28 : mini-boss (PV ×1,1, Rage). Jour 30 :
boss (PV 66, D 16, Rage).

| Jour | Type | PV | D | Victoire Bande | Victoire Légion | Tours [p10-p90] |
|---|---|---|---|---|---|---|
| 1 | Initiation | 41 | 12,1 | 97 % | 99 % | 6 [3-10] |
| 6 | Normal | 45 | 12,7 | 95 % | 97 % | 6 [3-10] |
| 7 | Mini-boss | 50 | 12,8 | 85 % | 93 % | 7 [4-11] |
| 14 | Mini-boss | 56 | 13,6 | 75 % | 87 % | 8 [5-11] |
| 20 | Normal | 56 | 14,2 | 81 % | 91 % | 8 [4-12] |
| 21 | Mini-boss | 63 | 14,3 | 61 % | 78 % | 8 [5-11] |
| 27 | Normal | 62 | 15,0 | 71 % | 85 % | 8 [5-12] |
| 28 | Mini-boss | 69 | 15,1 | 47 % | 66 % | 8 [5-12] |
| 30 | Boss final | 66 | 16 | 45 % | 65 % | 8 [5-11] |

Seule la Rage est simulée ; les autres particularités se compensent en PV, au script de simulation
**à garder dans le dépôt** (10 000 combats en moins d'une seconde).

### 2.7 Tours, issue, vidéo

- **Tours** : médiane 6 à 8 tours d'armée (p10-p90 : 4-11), plafond 12, au-delà le monstre « se
  replie ». Tirage sans remise dans un combat.
- **Défaite** (armée à 0 ou repli) : le monstre revient le lendemain avec ses PV restants ; second
  essai quasi gagné ; saison de ~35 jours.
- **Taux visé au 1er essai** : ~82 % sur la saison, 95 % la première semaine, ~45 % au boss.
- **Montage fixe de 45 s** : monstre (5 s), tour 1 (8 s), deux temps forts (16 s), coup final
  (10 s), résultat et commentaires de la veille (6 s). La durée tient au montage, pas au combat.

## 3. Déterminisme, trucage et journal

**Rejouable.** seed_combat = SHA-256(saison, jour, tentative) : fixé par le calendrier, jamais
re-tiré. Aucun générateur à état : chaque dé = `de(seed_combat, tour, rôle)`. Rejouer demande le
seed, les héros tirés (au journal) et la version des règles. Bénéfices gratuits : forcer un
personnage ne change que ses propres effets, les dés des autres tours restent identiques ; le
contrefactuel (« sans ce bouclier, le coup suivant était fatal ») se calcule en rejouant le tour.

**Trucage honnête.**

- Les forcés prennent les tours 1, 2, 3 ; le tour 1 est toujours montré.
- Choisis **avant** le calcul, sur un motif (commentaire le plus aimé, partenaire), **jamais** sur
  leurs stats ; aucun combat recalculé parce que l'issue déplaît.
- Conséquence assumée : ±10 points sur ce combat, neutre en moyenne.
- Option partenaire : un forcé à soin ou protection joue au premier tour où l'armée passe sous 70 %.

**Journal** (un JSON par combat) :

| Bloc | Contenu |
|---|---|
| En-tête | versions des règles et de la réserve, saison, jour, tentative, seed, monstre et PV de départ, N et rang, empreinte des enrôlés, forcés (tour, identifiant, motif), commentaires affichés |
| Par action | tour, camp, acteur (identifiant, classe, rareté, épithète), sort, stat et m, dés, critique ou raté, valeur, PV des deux camps avant → après, statuts posés ou consommés, forcé |
| Étiquettes | COUP_FINAL, CRITIQUE, PIRE_RATÉ (Météore raté, soin à PV pleins, étourdissement manqué, valeur < 30 % de l'attendu), SAUVETAGE (coup suivant fatal sans cette action), RETOURNEMENT (vainqueur passé sous 25 %), CONTRE_EMPLOI, DORÉ, MASSACRE (≤ 3 tours) |
| Bilan | issue, tours, PV restants, meilleur dégât, liste des tirés |

Chaque étiquette porte un score ; le montage retient le tour 1, les deux meilleurs scores et le coup
final. Les médailles (fois tiré, coups finaux) se recalculent depuis les journaux.

## 4. Boucles communautaires

| Boucle | Mécanique | Coût |
|---|---|---|
| Première ligne | les tours pairs se tirent parmi les commentateurs de la veille | lecture des commentaires, déjà requise |
| Héros du peuple | l'auteur du commentaire le plus aimé est forcé au tour 1 | une règle |
| Mur de la veille | deux commentaires affichés : le plus aimé et un au hasard | déjà prévu |
| Cliffhanger | défaite : « il revient demain, à 23 % de PV » | aucun |
| Rangs | « Légion à 1 000 abonnés » ; une montée de rang = vidéo spéciale | une constante |
| Trouve ton guerrier | page statique : on tape son pseudo, la fiche se calcule dans le navigateur ; un doré se partage | une page |
| Posture (v0.1) | mot-clé majoritaire en commentaire, « ASSAUT » (+15 % de dégâts) ou « REMPART » (−15 % subis) | un comptage |

Si 2 % des abonnés commentent chaque jour, un commentateur quotidien est tiré dans la saison à plus
de 99 % (1 000 abonnés) et ~10 % (50 000), contre 13 % et 0,3 % pour un silencieux. **S'abonner** :
« commente, tu rejoins l'armée », la fiche existe aussitôt. **Revenir** : être nommé, le cliffhanger,
« jour 12/30 », la montée de rang.

## 5. Écarté (sur-design)

Niveaux, XP, équipement, monnaie ; PV ou défense individuels ; plusieurs sorts par personnage ;
statuts à durée (poison) ; éléments croisés ; escouades ; monstres procéduraux ; classement ; vote en
direct ; empreinte du seed publiée à l'avance (utile seulement face à une accusation de triche).

## 6. Décisions à prendre

| # | Question | Défaut recommandé | Conséquence |
|---|---|---|---|
| 1 | Tirer parmi tous les abonnés, ou les enrôlés vus en commentaire ? | Enrôlés ; N = nombre d'abonnés | Indépendant d'une liste peut-être inaccessible ; seuls les volontaires sont nommés |
| 2 | La taille compte-t-elle ? | Oui : +10 % par rang, courbe recalibrée chaque saison | Grandir se voit et aide, sans trivialiser |
| 3 | L'armée peut-elle perdre ? | Oui, ~18 % au 1er essai ; le monstre revient blessé | Une défaite par semaine, jamais de blocage |
| 4 | Le sort dépend-il de la classe ? | Non : contre-emploi assumé, m de 0,6 à 1,5 | Un gag sur cinq tirages, écart supportable |
| 5 | Combien de personnages par tour ? | Un seul | 4 noms en vidéo, tous les tirés en légende |
| 6 | Pondérer par l'engagement ? | Oui : tours pairs parmi les commentateurs de la veille | Commenter fait jouer |
| 7 | Le commentaire le plus aimé force-t-il son auteur ? | Oui, au tour 1 | Boucle quotidienne visible ; course aux « j'aime » acceptée |
| 8 | Où placer les forcés ? | Tours 1-3, choisis avant le calcul, jamais de re-tirage | ±10 points sur le combat, neutre en moyenne |
| 9 | Une rareté ? | « Doré » à 2 %, cosmétique | Partages, équilibrage intact |
| 10 | Une progression ? | Non ; médailles tirées des journaux | Aucun état hors journaux |
| 11 | Seed : pseudo ou identifiant numérique ? | Pseudo normalisé | Fiche web triviale ; nouveau pseudo = nouveau personnage |
| 12 | Après le jour 30 ? | Saisons de 30 monstres, même armée, réserve de sorts figée | À produire : un bestiaire par saison |
