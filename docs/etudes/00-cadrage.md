# Wizard Army — Cadrage

État au 2026-11-16. Ce document rassemble ce qui a été décidé en conversation, avant tout ADR. Il sert
de source à l'ADR et au PRD ; il ne les remplace pas.

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
| Fournisseur | HikerAPI en principal, un acteur Apify sans cookie en repli, derrière une même interface. | Proposé |
| Seed | L'identifiant numérique Instagram sert de seed aux statistiques. | Décidé |
| Données stockées | Identifiant et pseudo. **Pas de photo de profil** : on la récupère à la génération de la vidéo, si besoin. | Décidé |
| Désabonnés | Non gérés : le personnage reste. À revoir seulement quand l'entrée des joueurs sera solide. | Décidé |
| Fréquence | Synchronisation fréquente et économe (ordre de grandeur : chaque heure), sans relire toute la liste à chaque fois. | Décidé |
| Robustesse | Quoi qu'il arrive, ça doit fonctionner, même partiellement, et se réparer seul. Un retard est acceptable, une réparation manuelle ne l'est pas. | Décidé |
| Essai réel du fournisseur | En dernier, quand il ne restera que ça. Tout le reste avance en parallèle. | Décidé |

**Conception de l'import (proposée)** :

1. Écriture rejouable : « ajoute le joueur s'il manque, sinon ne touche à rien », clé = identifiant Instagram.
2. Le personnage est un calcul à partir de l'identifiant, donc indépendant de l'ordre et de la date d'import.
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
| Site | Affiche les statistiques du monstre et une prédiction. | Décidé |
| Trucage | On peut présélectionner des personnages qui seront forcément tirés (commentaire populaire, marque). | Décidé |
| Statistiques, classes, sorts, formules | Les propositions de l'étude 05 (rangs, multiplicateur 60–150 %) **ne sont pas retenues**. | Ouvert |

### Architecture

| Sujet | Décision | Statut |
|---|---|---|
| Hébergement | Next.js sur Vercel : un seul projet pour le site, le serveur MCP et les tâches planifiées. | Décidé |
| Base | Neon (Postgres), deux projets séparés pré-prod et prod ; Drizzle. | Décidé |
| Découpage | Dépôt à paquets partagés : moteur de combat, accès aux données, affichage des personnages 3D (commun au site et à la vidéo). | Proposé |
| Plan Vercel | Gratuit tant qu'on n'est pas bloqué, puis Pro. | Décidé |
| Portabilité | Pouvoir migrer ailleurs : aucune règle du jeu dans une fonction propre à Vercel. Pas de Workflows au départ. | Proposé |
| File d'attente | Pas de Redis ni de service auto-hébergé : la base note où l'import s'est arrêté. | Proposé |
| Planification | Vercel Schedules (toutes les 15 minutes au plus en gratuit, en bêta). | Proposé |
| Back-office | Aucun. Un serveur MCP, piloté depuis Claude, le remplace. | Décidé |
| Authentification MCP | Jeton fixe en v1 (seul le poste du mainteneur) ; OAuth plus tard. | Décidé |
| Cloudflare | DNS seul avec DNSSEC. La sécurité est portée par Vercel, tous les leviers du plan gratuit activés. | Décidé |
| Pré-prod et prod | Toutes deux visibles en public. La pré-prod montre les personnages issus des abonnés du compte personnel du mainteneur et renvoie vers ce compte ; la prod, ceux du compte dédié. | Décidé |
| Bandeau bêta | La pré-prod affiche un bandeau « bêta » pour qu'on ne la confonde pas avec la prod. Il est piloté par une variable d'environnement, pas par du code propre à chaque environnement. | Décidé |
| Nom de domaine | Un domaine entièrement au nom du projet : aucune adresse Vercel visible par le public. | Décidé |
| Secrets | Tout ce qui est sensible (jetons, mots de passe des comptes, codes de récupération) est conservé dans KeePassXC, qui fait référence. Aucun secret dans le dépôt, dans une issue ou dans une conversation. En fin de projet, le mainteneur sauvegarde la base sur un disque externe. | Décidé |

### Modèles 3D

| Sujet | Décision | Statut |
|---|---|---|
| Exigences | Même modèle sur le site et dans la vidéo ; même thème ; personnalisable par joueur ; modifiable. | Décidé |
| Stockage | En base, géré par le MCP. | Décidé |
| Format | Un fichier GLB de référence par type de personnage ou de monstre, plus une fiche de personnalisation par joueur (couleurs, chapeau, taille) tirée du seed. | Proposé |
| Fabrication | MCP Blender en premier candidat ; voir ce que proposent game-studios et le MCP Godot. | Ouvert |

### Outils

| Outil | Décision | Statut |
|---|---|---|
| `/prototype` (Emil Kowalski), `taste-skill`, `no-ai-slop` | Installés au setup. | Décidé |
| `agent-reach` | Installé au setup, pour lire le compte `@Game_feel_prompts`. Réserve : compte Instagram secondaire conseillé ; lecture des vidéos à vérifier à l'essai. | Décidé |
| claude-code-game-studios | Installé au moment de finaliser le game design ; retiré s'il ne fait pas évoluer l'idée. | Décidé |
| MCP Vercel, `mcp-builder`, skills Vercel/React | Installés au setup. MCP Neon reporté : pas de compte Neon au moment du setup. | Proposé |
| Outils vidéo et son (Remotion, Openverse, earshot, Real SFX, etc.) | Essayés ensemble en phase 2. | Décidé |

Règle générale : un outil cité par le mainteneur s'installe et s'essaie avant d'être écarté.

## 3. Points ouverts

| Sujet | Quand | Avec |
|---|---|---|
| Game design complet : statistiques, classes, sorts, formule de puissance de l'armée | Après le setup | game-studios |
| À 1 000 joueurs, bien ou mal recruter change le rapport de force de moins de 1 % : comment le combat amplifie-t-il cet écart ? | Game design | game-studios |
| Baisser le pourcentage après 2 défaites : redimensionne-t-on aussi le monstre en cours ? | Game design | mainteneur |
| Format et fabrication des modèles 3D | Direction artistique | MCP Blender |
| Direction artistique, thème récurrent | Après le setup | `/prototype` |
| Organisation du site : boss du jour en accueil, annuaire à part | Direction artistique | mainteneur |
| Histoire des 30 monstres ; que faire après le 30e | Game design | mainteneur |
| Type du compte de prod (professionnel ou personnel) | Après l'essai réel | — |
| Page d'information et retrait d'un joueur sur demande (RGPD) | ADR | mainteneur |
| Nom de domaine : lequel, acheté où (Vercel, Cloudflare, ou sous-domaine d'un domaine existant) | ADR | mainteneur |
| Pré-prod publique sur le plan gratuit : un seul projet Vercel avec une branche, ou deux projets Vercel | ADR | mainteneur |

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
- Comportement du plan gratuit en cas de pic de trafic sur le site : non vérifié.
- Licence Remotion en cas de vidéo sponsorisée : à demander à Remotion avant de signer.

## 6. Ordre des travaux

1. **Setup**, à la racine du projet : mettre les études à l'abri, déplacer l'historique git du
   boilerplate dans un dossier de sauvegarde hors du projet, lancer `init-projet`, installer les outils. Non lancé : attend l'accord du mainteneur.
2. ADR à partir de ce cadrage.
3. Game design avec game-studios ; direction artistique avec `/prototype`.
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
