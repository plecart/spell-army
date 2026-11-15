# ADR 0003 — Import des abonnés : outil tiers, deux passes, auto-contrôle, retrait RGPD

- **Statut** : accepté le 2026-11-15. L'essai réel du fournisseur reste à faire : il a lieu en dernier.
- **Source** : `docs/etudes/00-cadrage.md` § 2 « Joueurs » et § 4 ; étude `06-abonnes-outils-tiers.md`

## Contexte

L'API officielle d'Instagram ne donne que le nombre d'abonnés, pas leur liste. Suivre le compte suffit
à avoir un personnage. L'import tourne dans le tic horaire (ADR 0002), et il doit se réparer seul.

## Décisions

| Sujet | Décision | Origine |
|---|---|---|
| Source | Un outil tiers interrogé régulièrement. | Décidé (cadrage) |
| Fournisseur | HikerAPI, derrière une interface `FollowerProvider` (lecture d'une page à partir d'un curseur). Le repli Apify n'est codé que si l'essai réel ou une panne durable le justifie : un import en retard est acceptable. | Accepté le 2026-11-15 |
| Données stockées | Identifiant numérique Instagram (en texte, jamais en nombre JS) et pseudo. Pas de photo de profil. | Décidé (cadrage) |
| Désabonnés | Non gérés : le personnage reste. | Décidé (cadrage) |
| Écriture | Rejouable : on ajoute le joueur s'il manque, sinon on ne touche à rien ; la clé est l'identifiant. Chaque page s'écrit d'un bloc, en une transaction. La date d'arrivée est la première fois qu'on voit le joueur, et elle ne change plus. | Accepté le 2026-11-15 |
| Passe rapide | À chaque tic, on lit depuis le haut de la liste et on s'arrête après une page entière de joueurs connus. | Accepté le 2026-11-15 |
| Passe complète | Une fois par semaine, on relit toute la liste pour rattraper les oublis. Le curseur est noté en base, et une passe interrompue reprend au tic suivant. | Accepté le 2026-11-15 |
| Auto-contrôle | Notre nombre de joueurs doit rester supérieur ou égal au nombre d'abonnés affiché par Instagram. Sinon, une passe complète part seule, **au plus une fois par 24 h**, pour qu'une liste tronquée ne la relance pas à chaque heure. | Accepté le 2026-11-15 |
| Journal | Chaque passe est journalisée : type, début, fin, pages, ajouts, erreur. Le journal se consulte et une passe se relance par le MCP. Le signal healthchecks.io (ADR 0002) sert d'alerte. | Accepté le 2026-11-15 |
| Mode dégradé | En cas d'échec, on ne supprime rien et on garde ce qui est déjà écrit. Le tic suivant reprend au curseur. | Accepté le 2026-11-15 |
| RGPD | Une page publique « Informations » : qui, quoi (identifiant et pseudo), pourquoi, base légale (intérêt légitime), contact par message privé sur le compte. Un outil MCP `retirer_joueur` efface le pseudo et place l'identifiant sur une liste d'exclusion, que l'import respecte à chaque passe. | Accepté le 2026-11-15 |
| Pseudos, données non fiables | Les pseudos sont renvoyés à Claude par le MCP : ce sont des champs courts et nettoyés, jamais une bio, pour limiter l'injection. | Accepté le 2026-11-15 |

## Pourquoi c'est réparable seul

L'écriture est idempotente et le personnage se calcule depuis l'identifiant. Un import en double, en
retard ou dans le désordre ne change donc rien au résultat. La passe rapide repose sur un tri du plus
récent au plus ancien, que rien ne garantit encore. Si ce tri est faux, l'auto-contrôle le détecte et
la passe complète rattrape les oublis.

## À vérifier par l'essai réel (le mainteneur le fait en dernier)

- La liste est complète : au moins 98 % du nombre d'abonnés affiché.
- Elle n'est pas tronquée pour un compte professionnel. Si elle l'est, il faudra choisir entre lire la
  liste et publier par l'API officielle.
- Le tri va du plus récent au plus ancien, et un réabonné remonte en haut. Sans ce tri, la passe
  rapide ne sert à rien et la cadence de la passe complète est à revoir.
- L'identifiant est stable d'un fournisseur à l'autre et survit à un changement de pseudo.
- La durée d'une page et le coût réel.
- Le compte personnel de pré-prod est lisible s'il est privé (non documenté chez HikerAPI).

## Risque ouvert

Les conditions d'utilisation de HikerAPI sont ambiguës : « personnel, non commercial ». Elles sont à
faire confirmer par leur support avant un usage commercial.
