# 07 - Compte Instagram et calibrage des monstres

Date : 2026-11-11. [V] = vérifié par une source citée ; [S] = supposé / estimation.

## Verdict

1. Modèle recommandé : **hybride**, avec une courbe de saison planifiée et une correction quotidienne **partielle** (moitié de l'écart observé) bornée à environ -30 % / +30 %. Le réactif pur annule l'effet du recrutement ; le prédictif pur crée des spirales de défaites.
2. Annoncer l'objectif chiffré du prochain monstre à chaque Reel : oui, c'est le levier de recrutement le plus mesurable.
3. Fourchettes prudentes pour un compte neuf, un Reel par jour, niche jeu/animation : **30 jours : 50 à 500 abonnés ; 90 jours : 200 à 2 500** [S]. L'incertitude est très grande (aucune source solide, voir B2).
4. Démarrage : pré-campagne 2 semaines, puis lancement de la guerre à un seuil (proposé : 150 recrues) ; amorçage depuis le compte personnel.
5. Point bloquant à vérifier tôt : l'API Instagram ne fournit en pratique **que le nombre d'abonnés, pas la liste** [V partiel], ce qui menace le principe « chaque abonné obtient un personnage » (B5).

## Partie A - Calibrage

Notation : F = abonnés, puissance de l'armée = fonction croissante de F (abstraite). M = puissance du monstre. Courbe d'histoire d(i) : monstres de force variable, boss aux jours 10, 20, 30.

### Les trois modèles

| | Réactif | Prédictif | Hybride |
|---|---|---|---|
| Définition | M(J+1) = k x F(J) x d | M(J) = plan(J) x d, plan fixé sur une prévision | M(J) = plan(J) x correction bornée de F(J)/plan(J) x d |
| Ce qui fait gagner/perdre | Le hasard et d(i) seulement : la croissance ne change presque pas l'issue | L'écart entre croissance réelle et prévue | Écart réel/prévu, atténué |
| Lisibilité | Faible : l'objectif bouge selon ce qu'on fait | Excellente : « 1 200 recrues pour le dragon » connu longtemps à l'avance | Bonne : objectif annoncé la veille, proche du plan |
| Manipulabilité | Forte : gonfler ou geler artificiellement F la veille | Nulle | Faible (bornes) |
| Pilotage quotidien | Nul (formule) | Nul, mais révision hebdo si la prévision déraille | Faible : 1 coup d'oeil par jour |
| Effet du recrutement | Neutralisé : recruter durcit le monstre suivant | Maximal | Réel mais amorti |

### Simulation jetable (hors dépôt)

30 jours, 200 abonnés au départ, bruit de combat lognormal 12 %, 2 000 tirages par cas, plan à +1,5 %/jour. Scénarios : stagnation (0/j), croissance lente (+8/j), pic viral (+1 500 au J12, puis -40/j pendant 13 jours), perte (-3/j). Les niveaux absolus de victoire dépendent d'un k arbitraire ; seule la **forme** compte. « Triviales » = victoires avec plus de 1,5 fois la force requise.

| Modèle / scénario | Victoires | Triviales | Plus longue série de défaites (moy.) |
|---|---|---|---|
| Réactif / stagnation | 32 % | 0 % | 12 |
| Réactif / lente | 37 % | 0 % | 11 |
| Réactif / pic | 35 % | 4 % | 13 |
| Réactif / perte | 29 % | 0 % | 14 |
| Prédictif / stagnation | 16 % | 0 % | **23** |
| Prédictif / lente | 84 % | 2 % | 2 |
| Prédictif / pic | 95 % | **65 %** | 1 |
| Prédictif / perte | 10 % | 0 % | **26** |
| Hybride (bornes 0,8-1,25) / stagnation | 28 % | 0 % | 15 |
| Hybride / lente | 41 % | 0 % | 8 |
| Hybride / pic | 88 % | 64 % | 2 |
| Hybride / perte | 20 % | 0 % | 21 |

### Pannes constatées

- **Réactif** : le taux de victoire est quasi identique quelle que soit la croissance (29-37 %). Il ne récompense pas le recrutement, ce qui contredit l'intention du mainteneur. Il reste stable, sans spirale. Défaites longues ici dues à un k trop dur, à régler.
- **Prédictif** : si la croissance s'arrête ou régresse, spirale (série de 23-26 défaites, soit toute la saison) ; après un pic, victoires triviales à 65 %.
- **Hybride (bornes étroites)** : empêche l'écart de se creuser trop vite mais ne corrige pas assez : stagnation et perte restent difficiles, pic reste trivial (64 %). Avec des bornes larges (0,6-2,0, essai à +2 %/j), il se comporte comme un réactif (victoire 28-34 % hors pic, 88 % au pic). Conclusion : **les bornes règlent le curseur entre prédictif et réactif ; il n'y a pas de réglage unique qui résolve tous les cas.**
- Découragement : au-delà de 3 défaites d'affilée (estimation [S]) le récit « on peut y arriver » s'effondre. Aucun modèle simple ne l'évite en perte ou stagnation.

### Recommandation : hybride avec garde-fous

1. plan(J) calculé sur une trajectoire **prudente** (fourchette basse B2), pas optimiste ; objectif de victoire dépendant de la **tendance**, pas seulement du niveau.
2. Correction = plan x (F(J)/plan(J)) ^ 0,5, bornée à [0,7 ; 1,3] [S, non simulé : à tester avec l'étude 05 une fois ses formules validées].
3. **Règle de pitié** : après 2 défaites consécutives, le monstre suivant perd 10-15 % de puissance ; **règle anti-trivialité** : après un pic, le surplus alimente un monstre bonus ou un boss, pas un écrasement.
4. Défaite voulue : la fixer en **fréquence cible** (par ex. 1 jour sur 4, valeur à choisir) et non en valeur de chaque combat.
5. Le plan doit être **révisé manuellement chaque semaine** (5 minutes) à partir de la croissance réelle.

Paramètres à régler : pente du plan, exposant de correction (0,5), bornes (0,7 ; 1,3), k de difficulté, amplitude de d(i), force des boss, seuil et taux de pitié, fréquence cible de défaite, bruit de combat.

### Annoncer l'objectif

Avantages : transforme la défaite en appel mesurable (« encore 40 recrues »), crée un compteur public, rend le modèle lisible. Risques : objectif manifestement hors de portée = découragement ; pic ponctuel de recrutement la veille seulement (effet en « dents de scie ») ; gonflement par faux comptes (manipulabilité) ; promesse non tenue si l'objectif change après annonce. Mesures : annoncer J-1 (hybride) ou plusieurs jours avant (planifié) ; **geler l'objectif à l'annonce** ; objectif atteignable à environ 70 % en cas normal [S] ; publier l'objectif et le score réel.

## Partie B - Compte Instagram

### B1 Démarrage à froid

Options : (a) lancer à 0 : armée vide, premiers combats absurdes ; (b) **seuil de lancement** (« la guerre commence à N recrues ») : crée l'événement et un compteur ; (c) pré-campagne : 7 à 14 jours de teasers avant la guerre ; (d) amorçage depuis le compte personnel : invitation directe des amis et de la communauté existante.

Recommandation : (b)+(c)+(d), avec **N = 150** [S] (atteignable en 2 semaines via le réseau personnel) et un Jour 1 fixé quand N est atteint ou, au plus tard, à la fin de la semaine 4 avec les recrues disponibles (monstre 1 calibré dessus). Plan daté :

| Semaine | Action |
|---|---|
| S-3 | Création du compte, réglages (B3), chauffe : 3 à 4 publications/semaine, usage normal de l'app |
| S-2 | Teasers (le monstre 1, l'armée vide) ; liens depuis le compte personnel |
| S-1 | Annonce du seuil N ; compteur ; 3 Reels « recrutement » |
| S0 | Jour 1 si N atteint ; sinon reporter une semaine (maximum 1 fois) |
| S1-S4 | Monstres 1-30 (un par jour) ; revue hebdomadaire du plan |
| S5 | Bilan : fin de saison 1 (B7) |

### B2 Repères de croissance (2026)

Aucune source solide pour « compte neuf, un Reel par jour, niche jeu/animation » [V : absence]. Les recherches donnent surtout des blogs de vendeurs ; un test sur nouveau compte note que les Reels ont reçu 30 à 50 % des vues d'un ancien compte après 30 jours ; des cas viraux isolés (près d'un million d'abonnés en trois mois) ne sont pas représentatifs. Le taux d'engagement des Reels était d'environ 0,48 % (Socialinsider, T3 2026) [V], et la croissance en abonnés a ralenti en 2025 [V, vendeur].

Fourchettes prudentes [S], **hors réseau personnel** :

| Horizon | Bas | Central | Haut (chanceux) |
|---|---|---|---|
| 30 jours | 50 | 150 | 500 |
| 90 jours | 200 | 700 | 2 500 |

Ajouter l'amorçage personnel (50 à 300 abonnés selon le réseau). Ces chiffres sont mon estimation, non mesurés : **à recalibrer dès le jour 14 avec la vraie courbe**. Le mécanisme de recrutement viral du projet (défaite -> partage) est le seul facteur qui pourrait dépasser le haut de la fourchette.

### B3 Mise en place

- Type : **compte professionnel de type Créateur** (ou Pro) : requis pour l'API de publication et pour les outils de contenu de marque [V]. Le type Créateur suffit ; pas besoin de Page Facebook pour la publication via certains flux, à vérifier [S].
- Réglages : compte public, messages et mentions limités, commentaires filtrés (mots offensants), étiquette « jeu vidéo/animation ».
- Chauffe d'un compte neuf : 1 à 2 semaines d'activité humaine normale avant l'automatisation (suivre des comptes de la niche, interagir) ; pas de pics d'activité ni de messages en masse [S]. Les comptes neufs étant plus susceptibles aux restrictions, éviter d'attacher l'automatisation à l'API dès le premier jour [S].
- Bio : promesse en une ligne (« Une armée de X recrues. Un monstre par jour. »), lien vers le site (classement, personnage, objectif du jour), nom d'utilisateur court.

### B4 Calendrier éditorial (saison de 30 jours)

- Rythme : 1 Reel/jour, même heure, créneau du soir (19 h-21 h heure locale) [S, à confirmer par les statistiques du compte après 2 semaines]. Stories en complément (compteur d'objectif, sondages).
- Format : Reel vertical, 20 à 45 secondes, accroche dans les 2 premières secondes ; structure : objectif annoncé -> combat -> résultat -> noms de recrues -> appel à l'action. Durée maximale des Reels publiés par API : 90 s [V tiers, non confirmé].
- Après une victoire : remercier, nommer des recrues, annoncer le monstre suivant et son objectif, inviter à partager le compte.
- Après une défaite : le récit « il nous manque N recrues », compteur public, demande de recruter un ami. Ton positif, pas de culpabilisation.
- Commentaires : lire les commentaires de la veille à l'écran (attention à la modération manuelle avant diffusion : insultes, données personnelles).
- Vidéos spéciales : palier franchi (100, 500, 1 000 recrues), boss J10/J20/J30, bilan J30.
- Les Reels sont préparés à l'avance (lot hebdomadaire), publication programmée, avec une réserve de 2 vidéos d'urgence.

### B5 Règles Instagram

- **API de publication** : réservée aux comptes professionnels ; limite documentée de 100 publications par 24 h (anciennes pages : 50) [V], très au-dessus du besoin. Vérifier `content_publishing_limit` en conditions réelles. Traitement vidéo asynchrone, à sonder jusqu'à l'état FINISHED [V tiers].
- **Liste des abonnés** : l'API Graph donne `followers_count`, pas la liste des abonnés [V partiel, forums et blogs ; un fil d'avril 2026 signale une erreur sur un point d'accès « followers »]. Conséquences : le plan « chaque abonné obtient un personnage » est **menacé** ; solutions : inscription volontaire par le site (lien en bio), ou commentaire/DM déclencheur, ou personnage créé à la première interaction (like, commentaire, message). Le **scraping** de la liste est une zone grise voire interdite par les conditions de Meta [V partiel : les sources sont des vendeurs de scrapers] ; risque de restriction ou de bannissement du compte. **À ne pas utiliser sur le compte de production.**
- **Engagement bait** : les appels du type « commente/abonne-toi pour… » sont mal vus ; Instagram pénalise la distribution des contenus qui sollicitent artificiellement l'engagement [S, non vérifié ici par source officielle]. L'appel à l'abonnement fait partie du jeu : le formuler comme une **invitation** au récit (« rejoins l'armée »), pas comme une condition échangée contre une récompense précise.
- **Jeux-concours** : les sources divergent (certaines autorisent de demander suivre/commenter/taguer, d'autres le restreignent) [V : désaccord entre vendeurs] ; en cas de concours, règlement officiel, mention « non affilié à Instagram », conditions légales locales. Sans lot, le risque disparaît : éviter les concours au début.
- **Marques** : toute collaboration rémunérée doit utiliser l'étiquette « partenariat rémunéré » ; réservée aux comptes professionnels ; Instagram surveille ces mentions [V].
- **Personnages nommés** : n'afficher que des pseudonymes publics ; prévoir un moyen de retrait (demande par DM) [S, rappel de bonne pratique et de RGPD].

### B6 Désabonnements

Options : (1) suppression immédiate du personnage ; (2) personnage « en veille » : conservé mais retiré de l'armée tant que l'abonné est parti, réactivé s'il revient ; (3) personnage conservé en « fantôme » sans compter.
Recommandation : **option 2** : le personnage sort de la puissance de l'armée (cohérence avec « la puissance suit les abonnés »), est gardé 30 jours puis archivé ; retour = même personnage. Mise à jour du comptage quotidienne (une fois avant calcul de l'objectif, pas en direct).

### B7 Après le monstre 30

Saison 2 : semaine de pause (récapitulatif, remerciements, vote de la communauté), nouvelle histoire de 30 monstres, armée conservée avec niveaux remis à plat ou léger bonus d'ancienneté. Ne pas arrêter plus de 2 semaines (la portée retombe) [S]. Si la saison 1 réussit (>1 000 abonnés), envisager un rythme de 5 Reels/semaine pour réduire la charge.

## Décisions à prendre (choix par défaut en gras)

1. Modèle : **hybride** / prédictif / réactif ?
2. Fréquence cible de défaite : **1 jour sur 4** / 1 sur 3 / 1 sur 6 ?
3. Annoncer l'objectif : **oui, gelé à J-1** / oui, 3 jours avant / non ?
4. Seuil de lancement N : **150** / 50 / 500 ?
5. Report de lancement si N non atteint : **oui, 1 fois (1 semaine)** / non ?
6. Pré-campagne : **14 jours** / 7 jours / aucune ?
7. Amorçage par le compte personnel : **oui** / non ?
8. Désabonné : **personnage en veille 30 jours** / supprimé / fantôme ?
9. Création des personnages : **inscription volontaire via site + 1re interaction** / lecture de liste (si faisable) ?
10. Pitié après 2 défaites : **oui (-10 à -15 %)** / non ?
11. Concours avec lots : **non en saison 1** / oui ?
12. Heure de publication : **20 h** (à ajuster après 14 jours) / midi ?

## Sources

- Socialinsider, 2026 Instagram Organic Benchmarks : https://www.socialinsider.io/blog/instagram-benchmarks/ [vendeur]
- Influencer Marketing Hub, Instagram Reels Statistics 2026 : https://www.influencermarketinghub.com/blog/instagram-reels-statistics
- Meta, Content Publishing : https://developers.facebook.com/docs/instagram-platform/content-publishing/
- Meta, Graph API, IG User : https://developers.facebook.com/docs/graph-api/reference/instagram-user/
- Fil de développeurs sur la liste d'abonnés : https://developers.secure.facebook.com/community/threads/982881816662908
- Aide Instagram, contenu de marque : https://help.instagram.com/android-app/1109894795810258
- Woobox, règles des concours Instagram : https://blog.woobox.com/instagram-giveaway-rules-to-remember-checklist-if-you-forget/
- Gleam, concours Instagram : https://gleam.io/guides/instagram-contest
- Études de cas de croissance (anecdotiques) : https://medium.com/@vireuoess/i-ran-a-faceless-instagram-page-for-90-days-d6b6ffc93b24 ; https://creatordb.app/blog/how-chrogman-went-viral-on-instagram/
- Simulation : script jetable hors dépôt (dossier temporaire), non conservé.
