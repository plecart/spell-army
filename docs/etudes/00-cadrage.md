# Wizard Army — Cadrage

État au 2026-11-16. Ce document rassemble ce qui a été décidé en conversation. Les ADR (`docs/adr/`),
le [game design](../game-design.md) et la [direction artistique](../direction-artistique.md) en détaillent des parties ; il sert de source au PRD.

Trois statuts, à ne pas confondre :

- **Décidé** : tranché par le mainteneur.
- **Proposé** : recommandation de Claude, pas encore validée explicitement.
- **Ouvert** : à trancher plus tard, avec qui et quand.

## 1. Ce qui est ferme

- **Le concept** : un compte Instagram ; chaque abonné devient un personnage ; tous les personnages
  forment une armée qui affronte un monstre par jour, en tour par tour ; chaque combat est raconté dans
  une vidéo qui met en avant de vrais abonnés.
- **La devise** : rapide et efficace. Projet de loisir, pas de perfection, peu de tokens.
- **Les deux objectifs d'apprentissage** : les MCP et Vercel.
- **Deux phases** : (1) joueurs, personnages, moteur de combat, site ; (2) vidéo.
- **Deux environnements** : pré-prod sur le compte Instagram personnel du mainteneur (public),
  prod sur un compte neuf dédié.

## 2. Décisions

### Joueurs

| Sujet | Décision | Statut |
|---|---|---|
| Enrôlement | Suivre le compte = avoir un personnage. Pas d'enrôlement par commentaire. | Décidé |
| Source de la liste | Un outil tiers interrogé régulièrement (l'API officielle ne donne que le nombre d'abonnés). | Décidé |
| Fournisseur | HikerAPI seul, derrière une interface ; le repli Apify n'est codé que si l'essai réel ou une panne durable le justifie ([ADR 0003](../adr/0003-import-des-abonnes.md)). | Décidé |
| Seed | L'identifiant numérique Instagram sert de seed aux statistiques. | Décidé |
| Données stockées | Identifiant et pseudo. **Pas de photo de profil** : on la récupère à la génération de la vidéo, si besoin. | Décidé |
| Désabonnés | Non gérés : le personnage reste. À revoir seulement quand l'entrée des joueurs sera solide. | Décidé |
| Fréquence | Synchronisation fréquente et économe (ordre de grandeur : chaque heure), sans relire toute la liste à chaque fois. | Décidé |
| Robustesse | Quoi qu'il arrive, ça doit fonctionner, même partiellement, et se réparer seul. Un retard est acceptable, une réparation manuelle ne l'est pas. | Décidé |
| Essai réel du fournisseur | En dernier, quand il ne restera que ça. Tout le reste avance en parallèle. | Décidé |

**Conception de l'import (décidée le 2026-11-15, détaillée par l'[ADR 0003](../adr/0003-import-des-abonnes.md))** :

1. Écriture rejouable : « ajoute le joueur s'il manque, sinon ne touche à rien », clé = identifiant Instagram.
2. La classe et les statistiques sont un calcul à partir de l'identifiant, donc indépendantes de l'ordre et
   de la date d'import. Le sort est tiré une fois, à l'inscription, puis stocké
   ([game design](../game-design.md) § 1) : un import en retard ne le change que si un sort a été ajouté
   à la réserve entre-temps.
3. Deux passes : une rapide chaque heure (depuis le haut de la liste, arrêt après une page entière de
   joueurs connus) ; une complète chaque semaine qui rattrape tout oubli.
4. Contrôle : notre nombre de joueurs doit rester supérieur ou égal au nombre d'abonnés affiché par
   Instagram ; sinon une passe complète part seule.
5. Chaque page est écrite d'un bloc ; un verrou empêche deux passes simultanées ; un journal des imports
   est consultable et relançable par le MCP ; alerte après plusieurs échecs.
6. Le combat fige l'armée : il prend les joueurs vus avant minuit.
7. Date d'arrivée d'un joueur = première fois que nous le voyons (les outils tiers ne donnent pas la date
   d'abonnement). Elle ne change pas s'il part et revient.

### Combat et calibrage

| Sujet | Décision | Statut |
|---|---|---|
| Défaite | L'armée peut perdre, et c'est voulu : une défaite pousse à partager le compte. | Décidé |
| Taux de défaite | Aucun quota de défaites fixé à l'avance. | Décidé |
| Objectif annoncé | Pas de chiffre de recrues réclamé au public. | Décidé |
| Jour 1 | Le mainteneur seul contre un monstre de sa force ; vidéo déjà générée. Pas de seuil de lancement. | Décidé |
| Jour 2 | Monstre prévu pour une armée de 10, choix arbitraire. | Décidé |
| Jours suivants | Monstre dimensionné pour l'armée actuelle + environ 70 % des recrues gagnées par jour, en médiane sur les 3 derniers jours. | Décidé |
| Moment | Le monstre est fixé 24 h avant le combat, qui a lieu à minuit. | Décidé |
| Après une défaite | Même monstre le lendemain. Le monstre ne grossit qu'après une victoire. | Décidé |
| Réglage du pourcentage | Revu tous les 3 jours ; revu à la baisse après 2 défaites de suite. | Décidé |
| Où vit le pourcentage | En base, modifiable par le MCP. | Proposé |
| Site | Au MVP, l'annuaire des personnages seul ([direction artistique](../direction-artistique.md) § 3). Les statistiques du monstre viennent après le MVP ; la prédiction aussi, si elle est gardée ([game design](../game-design.md) § 8). | Décidé |
| Trucage | On peut présélectionner des personnages qui seront forcément tirés (commentaire populaire, marque). | Décidé |
| Statistiques, classes, sorts, formules | Réglés par le [game design](../game-design.md) (§ 1 à § 4, annexes A et B), qui porte le statut de chaque règle. Les propositions de l'étude 05 (rangs, multiplicateur 60–150 %) **ne sont pas retenues**. | Décidé |

### Architecture

| Sujet | Décision | Statut |
|---|---|---|
| Hébergement | Next.js sur Vercel : une seule application pour le site, le serveur MCP et les tâches planifiées, déployée dans un projet Vercel par environnement ([ADR 0004](../adr/0004-environnements-domaine-et-securite.md)). | Décidé |
| Base | Neon (Postgres), deux projets séparés pré-prod et prod ; Drizzle. | Décidé |
| Découpage | Monorepo pnpm, un paquet par domaine ([ADR 0001](../adr/0001-architecture-applicative.md), « Paquets ») ; le paquet d'affichage 3D, commun au site et à la vidéo, n'arrive qu'en phase 2. | Décidé |
| Plan Vercel | Gratuit tant qu'on n'est pas bloqué, puis Pro. | Décidé |
| Portabilité | Pouvoir migrer ailleurs : aucune règle du jeu dans une fonction propre à Vercel. Pas de Workflows au départ ([ADR 0001](../adr/0001-architecture-applicative.md)). | Décidé |
| File d'attente | Pas de Redis ni de service auto-hébergé : la base note où l'import s'est arrêté ([ADR 0001](../adr/0001-architecture-applicative.md), [ADR 0002](../adr/0002-taches-planifiees-et-auto-reparation.md)). | Décidé |
| Planification | Vercel Schedules (en bêta) : un tic horaire rejouable par environnement, doublé d'un filet GitHub Actions ([ADR 0002](../adr/0002-taches-planifiees-et-auto-reparation.md)). | Décidé |
| Back-office | Aucun. Un serveur MCP, piloté depuis Claude, le remplace. | Décidé |
| Authentification MCP | Jeton fixe en v1 (seul le poste du mainteneur) ; OAuth plus tard. | Décidé |
| Cloudflare | DNS seul avec DNSSEC. La sécurité est portée par Vercel, tous les leviers du plan gratuit activés. | Décidé |
| Pré-prod et prod | Toutes deux visibles en public. La pré-prod montre les personnages issus des abonnés du compte personnel du mainteneur et renvoie vers ce compte ; la prod, ceux du compte dédié. | Décidé |
| Bandeau bêta | La pré-prod affiche un bandeau « bêta » pour qu'on ne la confonde pas avec la prod. Il est piloté par une variable d'environnement, pas par du code propre à chaque environnement. | Décidé |
| Nom de domaine | Un domaine entièrement au nom du projet : aucune adresse Vercel visible par le public. Acheté chez Cloudflare Registrar ; le nom reste à choisir ([ADR 0004](../adr/0004-environnements-domaine-et-securite.md)). | Décidé |
| Secrets | Tout ce qui est sensible (jetons, mots de passe des comptes, codes de récupération) est conservé dans KeePassXC, qui fait référence. Aucun secret dans le dépôt, dans une issue ou dans une conversation. En fin de projet, le mainteneur sauvegarde la base sur un disque externe. | Décidé |

### Modèles 3D

| Sujet | Décision | Statut |
|---|---|---|
| Exigences | Même modèle sur le site et dans la vidéo ; même thème ; personnalisable par joueur ; modifiable. | Décidé |
| Stockage | En base, géré par le MCP. | Décidé |
| Format | Un fichier GLB de référence par classe et par monstre, le même pour le site et la vidéo, qui respecte un contrat (ancres nommées, pièces rigides) : un designer peut le remplacer sans toucher au code ([direction artistique](../direction-artistique.md) § 7). Pas de variation par joueur au MVP : chaque classe a un modèle, un décor et un socle par défaut, que chaque personnage reçoit et qui pourront plus tard être changés personnage par personnage par le MCP ([direction artistique](../direction-artistique.md) § 5). | Décidé |
| Fabrication | Blender, installé le 2026-11-16. Personnages en pièces rigides flottantes, animées par leurs ancres : ni fusion des volumes ni poids d'os, écartés par l'essai du même jour ([direction artistique](../direction-artistique.md) § 6). | Décidé |
| Pilotage de Blender | Serveur MCP officiel de Blender (blender.org, projet « Lab ») en premier candidat ; l'essai s'en est passé, Blender piloté par un script Python. À essayer sur le premier modèle : quelques skills de `arjun988/blender-skills` (personnage, export), pas les 94. Le MCP Godot reste à regarder. | Ouvert |

### Outils

| Outil | Décision | Statut |
|---|---|---|
| `/prototype` (Emil Kowalski), `taste-skill`, `no-ai-slop` | Installés au setup. | Décidé |
| `agent-reach` | Installé au setup, pour lire le compte `@Game_feel_prompts`. Réserve : compte Instagram secondaire conseillé ; lecture des vidéos à vérifier à l'essai. | Décidé |
| claude-code-game-studios | Installé au moment de finaliser le game design ; retiré s'il ne fait pas évoluer l'idée. | Décidé |
| MCP Vercel, `mcp-builder`, skills Vercel/React | Installés au setup. MCP Neon reporté : pas de compte Neon au moment du setup. | Proposé |
| Outils vidéo et son (Remotion et ses skills officiels, `Remocn/remocn`, `Jakeschincariol/instagram-agent-skill`, `mromidev/claude-animated-shorts`, Openverse, earshot, Real SFX, etc.) | Étudiés et essayés ensemble en phase 2, au moment de choisir ; rien n'est installé avant. Premier avis du 2026-11-16, à reprendre alors : remocn composant par composant, sans son plugin ni son serveur MCP ; d'`instagram-agent-skill`, seulement `ig-reel` et `ig-caption` ; `claude-animated-shorts` n'est pas encore évalué. | Décidé |
| UniRig, `achimala/dream-loop` | Non installés après lecture, le 2026-11-16. UniRig exige une carte Nvidia et le poste a une carte AMD : à reprendre seulement si un service hébergé convient. `dream-loop` est écrit pour Codex et demande un outil de génération d'images : à essayer à la direction artistique si le mainteneur le souhaite. | Proposé |

Règle générale : un outil cité par le mainteneur s'installe et s'essaie avant d'être écarté.

## 3. Points ouverts

| Sujet | Quand | Avec |
|---|---|---|
| Design final des personnages, des monstres et des visuels de sort | Avant leur fabrication | mainteneur, avec ses références |
| Histoire des 30 monstres ; que faire après le 30e | Game design | mainteneur |
| Type du compte de prod (professionnel ou personnel) | Après l'essai réel | — |
| Nom de domaine : lequel | Avant la mise en ligne | mainteneur |

Tranchés depuis :

- Game design complet (statistiques, classes, sorts, formule de puissance de l'armée) : [game
  design](../game-design.md), qui garde ses propres points ouverts (§ 10).
- Écart de recrues écrasé par le hasard à grande échelle : assumé ([game design](../game-design.md) § 6).
- Baisse du pourcentage après 2 défaites : le monstre en cours est recalculé avec le pourcentage baissé
  et ne peut que rétrécir ([game design](../game-design.md) § 6). Le montant de la baisse reste ouvert là.
- Page d'information et retrait d'un joueur (RGPD) : [ADR 0003](../adr/0003-import-des-abonnes.md).
- Direction artistique, organisation du site, format et fabrication des modèles 3D : [direction artistique](../direction-artistique.md), qui garde
  ses propres points ouverts (§ 9).
- Où acheter le domaine (Cloudflare Registrar) et pré-prod sur deux projets Vercel :
  [ADR 0004](../adr/0004-environnements-domaine-et-securite.md).

## 4. À vérifier par l'essai réel du fournisseur

- La liste est complète (au moins 98 % du nombre d'abonnés affiché).
- **Elle n'est pas tronquée pour un compte professionnel.** Un vendeur l'affirme ; si c'est vrai, il
  faudra choisir entre lire la liste et publier par l'API officielle.
- La liste arrive du plus récent au plus ancien ; un réabonné remonte-t-il en haut.
- L'identifiant est le même d'un fournisseur à l'autre et survit à un changement de pseudo.
- Durée d'une page, coût réel.

## 5. Risques connus

- Conditions d'utilisation de HikerAPI ambiguës (« non commercial ») : à faire confirmer par leur support.
- Le plan gratuit de Vercel est réservé à l'usage non commercial : Pro dès le premier partenariat rémunéré.
- Vercel Schedules est en bêta : ses limites peuvent changer.
- Pic de trafic sur le plan gratuit : le projet peut être mis en pause, et la reprise se fait à la main.
  C'est la seule panne qui demande une intervention ([ADR 0002](../adr/0002-taches-planifiees-et-auto-reparation.md),
  « Ce qui reste hors de portée du code »).
- Licence Remotion en cas de vidéo sponsorisée : à demander à Remotion avant de signer.

## 6. Ordre des travaux

1. **Setup**, à la racine du projet : mettre les études à l'abri, déplacer l'historique git du
   boilerplate dans un dossier de sauvegarde hors du projet, lancer `init-projet`, installer les outils. Fait.
2. ADR à partir de ce cadrage. Fait : [`docs/adr/`](../adr/), ADR 0001 à 0004.
3. Game design avec game-studios : fait, [`docs/game-design.md`](../game-design.md). Direction
   artistique avec `/prototype` : fait, [`docs/direction-artistique.md`](../direction-artistique.md).
4. PRD, puis issues.
5. Développement : import, personnages, moteur de combat, MCP, site.
6. Essai réel du fournisseur d'abonnés.
7. Phase 2 : vidéo.

## 7. Études de référence

| Étude | Sujet | Relue par Claude |
|---|---|---|
| [01](01-instagram-abonnes.md) | Abonnés Instagram, API officielle | En entier |
| [02](02-skills-et-mcp.md) | Skills et MCP | Résumé seulement |
| [03](03-video-et-3d.md) | Vidéo et 3D | En entier |
| [04](04-architecture.md) | Architecture | Résumé seulement |
| [05](05-game-design.md) | Game design préliminaire, non retenu | En entier |
| [06](06-abonnes-outils-tiers.md) | Outils tiers | En entier |
| [07](07-compte-instagram-et-calibrage.md) | Compte Instagram et calibrage, en partie dépassé par les décisions ci-dessus | Résumé seulement |
| [08](08-securite-cloudflare-vercel.md) | Sécurité Cloudflare et Vercel | Résumé seulement |

Vérifié directement sur la documentation Vercel le 2026-11-11 : l'ancien cron est limité à une fois par
jour en gratuit ; Schedules autorise toutes les 15 minutes et 5 000 exécutions par mois ; une fonction
dure 300 s au plus en gratuit, 800 s en Pro ; Workflows inclut 50 000 événements par mois en gratuit.
Le reste des faits vient des études, vérifiés par leurs agents et non par Claude.
