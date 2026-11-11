# Étude 01 — Récupérer et suivre les abonnés Instagram (11/11/2026)

Légende : **[V]** vérifié dans une source citée ; **[S]** supposition ou connaissance non revérifiée ; **[T]** déclaré par un tiers (vendeur, blog), non confirmé par Meta.

## Verdict

1. L'API officielle n'expose **aucune liste d'abonnés** et **aucun webhook « nouvel abonné »** [V]. Seul `followers_count` existe. Le concept « suivre = être enrôlé » est donc impossible en 100 % officiel.
2. Les voies pour lire la liste sont l'export officiel JSON (légitime, sans ID numérique ni avatar, programmable) et les scrapers tiers (peu chers, mais hors CGU/RGPD fragiles).
3. Tout ce qui est interaction (commentaire, DM, mention) et la publication de Reels est officiel, et **sans App Review ni vérification business** pour un usage sur son propre compte [V].
4. Contradiction du concept : l'enrôlement **opt-in** (commentaire ou DM) offre le meilleur couple fiabilité / RGPD / engagement. « Suivre » devient un bonus, pas la condition.
5. Confiance globale : moyenne à bonne. Les points non vérifiables (format exact de l'export, `like_count`, tarifs tiers) sont signalés.

## Ce que l'API officielle couvre

- **Followers** : `followers_count` seul (compte pro). Business Discovery (Facebook Login) donne des compteurs pour d'autres comptes, jamais de liste [V]. Aucun champ ni changelog 2026 lié aux abonnés [V].
- **Webhooks** (champs listés) : `comments`, `live_comments`, `mentions`, `messages`, `messaging_postbacks`, `messaging_referral`, `messaging_optins`, `message_reactions`, `messaging_seen`, `story_insights`… **Aucun champ follow** [V].
- **Commentaires** : webhook `comments` avec `from.id` (IGSID) et `from.username` [V, via guide de modération et référence webhook]. Le `like_count` d'un commentaire est lisible via l'objet IG Comment [S : la page de référence m'a renvoyé 404, à confirmer].
- **Messagerie** : l'app ne peut pas initier ; elle répond après un message de l'utilisateur (fenêtre 24 h) [V]. L'API User Profile renvoie `name`, `username`, `profile_pic` (URL expirant en quelques jours), `follower_count`, `is_user_follow_business`, **uniquement après que la personne ait écrit** (consentement) [V]. Un simple commentaire ne suffit pas pour envoyer un DM [V]. Réponses privées à un commentaire : 750/h [V].
- **Publication de Reels** : `media_type=REELS` + `video_url` publique, puis `media_publish` ; plafond 100 publications API / 24 h [V].
- **Accès** : « Si votre app ne sert que votre compte pro, l'accès Standard suffit » ; App Review et vérification business seulement pour l'accès Avancé (comptes tiers) [V]. Le jeton « Instagram Login » (graph.instagram.com) ne nécessite pas de Page Facebook [V].
- **Quota** : 4 800 appels × impressions sur 24 h glissantes [V], très largement suffisant.
- Mention story : couverte par le champ `comments`/mentions ; la lecture détaillée des mentions de story reste limitée [S].

## Tableau comparatif des voies

| Voie | Faisabilité | Coût | Risque compte | Risque légal | Effort | Automatisable |
|---|---|---|---|---|---|---|
| API officielle : liste d'abonnés | Impossible [V] | — | — | — | — | — |
| API officielle : enrôlement commentaire/DM/mention | Oui [V] | 0 € | Nul | Faible (consentement par l'action) | Moyen (webhook + serveur HTTPS) | Oui, temps réel |
| Hybride : `followers_count` = taille/puissance | Oui [V] | 0 € | Nul | Nul | Faible | Oui |
| Export officiel « Télécharger vos informations » JSON | Oui, abonnés = fichier `followers_*.json` [T] | 0 € | Nul | Moyen-faible (données de son propre compte, mais traitement RGPD réel) | Faible-moyen | Partiel : export planifié (Once/Daily/Monthly/Yearly, vers Google Drive) [T] ; diff à coder |
| Apify « sans cookie » (liste) | Oui, parfois partielle [V] | ~0,5 à 1,5 $/1 000 [V] | Nul pour le compte (aucune session) ; blocages côté acteur | Moyen : zone grise CGU, RGPD | Faible | Oui (API/planif.) |
| Apify monitor (nouveaux/désabonnés) | Oui, comptes publics uniquement [V] | ~2-5 $/mois (quotidien) [T] | Nul | Idem | Très faible | Oui, avec webhook |
| HikerAPI | Oui, `pk` + `username`, ~25 par page, 0,0006 $/requête [V] | ~0,1 $ pour 4 000 abonnés (calcul) | Nul (pas de cookie déclaré [V]) | Moyen | Faible | Oui |
| instaloader/instagrapi auto-hébergés avec session | Oui | 0 € | **Élevé** : checkpoint/ban, API privée [T] | Élevé (CGU : usage connecté) | Moyen, fragile | Oui mais instable |
| Cookie `sessionid` confié à un acteur Apify | Oui | faible | Élevé [T] | Élevé | Faible | Oui |
| Navigateur piloté (Claude in Chrome) dans la session | Techniquement possible (scroll de la liste) [S] | 0 € | Moyen-élevé : automatisation d'une session connectée | Moyen-élevé | Moyen, fragile | Mal ; à éviter |

Notes :
- Meta v. Bright Data (janv. 2024) : le tribunal a jugé que les CGU Meta visent l'usage **connecté** et non le scraping déconnecté de données publiques [V, sources secondaires]. Il ne dit **rien** du scraping connecté, donc aucune protection pour les voies à cookie. Ce n'est pas un jugement européen, et il ne règle pas le RGPD.
- Vérifiés Apify : champs `id`, `username`, `full_name`, `profile_pic_url` (URL expirante), `is_private` ; listes parfois restreintes par Instagram (`stopReason: instagram_limit`) ; pas de dédoublonnage inter-runs [V]. Le monitor renvoie les désabonnés **sous forme d'ID seuls** [V].
- HikerAPI : pour les comptes vérifiés, seuls ~50 abonnés sont renvoyés sans curseur [V] — piège pour un compte prod si vérifié.
- Le tableau du compte privé : les acteurs ne lisent pas les comptes privés [V]. Le compte de jeu doit être public (de toute façon nécessaire pour la croissance).

## Piège RGPD (stockage ID + pseudo + avatar)

- Le mainteneur est responsable de traitement ; l'exemption « usage domestique » ne s'applique pas à un jeu public [S].
- Base légale plausible : **intérêt légitime** avec mesures compensatoires (information, droit d'opposition, minimisation) selon la fiche CNIL du 19/06/2025 sur le moissonnage [source secondaire consultée ; fiche officielle non lue intégralement].
- Pour l'opt-in (commentaire/DM), le consentement est démontré par l'action : position bien plus solide. Pour l'abonnement passif (voies liste), prévoir une page « informations / opposition » et un opt-out, ne pas stocker l'avatar (URL expirante, de toute façon) mais le re-télécharger à la volée pour l'affichage vidéo uniquement pour les abonnés mis en avant.
- Mise en avant dans le Reel d'un abonné réel avec son commentaire : traitement distinct, plus sensible. L'opt-in explicite règle le problème.

## Identifiant servant de seed

| Source | Identifiant | Stabilité |
|---|---|---|
| API officielle (commentaire, DM) | IGSID, **propre à la paire (utilisateur, compte pro)** [V] | Stable pour ce compte ; **différent entre pré-prod et prod** [V] |
| Scrapers (Apify, HikerAPI) | `pk`/`id` numérique global [V] | Stable (survit au changement de pseudo) [S] |
| Export officiel | Pseudo + lien + horodatage ; pas d'ID numérique [S, à vérifier sur un vrai export] | Instable (pseudo modifiable) |
| Pseudo | — | Modifiable, réutilisable |

Pièges :
- Un même humain a un IGSID par compte pro (donc pré-prod ≠ prod) et un `pk` côté scrapers : **aucune jointure sûre** entre les deux, sauf via le pseudo (mutable). Le `from.id` d'un webhook peut différer d'un identifiant numérique obtenu ailleurs [T, forum Meta].
- Conséquence : le seed doit être l'**ID interne du jeu** généré à la première apparition (UUID), pas l'identifiant Instagram. Stocker en alias l'IGSID et, si disponible, le pseudo. Un personnage « rejoue » alors à l'identique pour toute la vie du compte de jeu. Les personnages de pré-prod ne seront pas migrables vers la prod, sauf si le joueur se ré-enrôle.

## Recommandation classée

**1er choix — Hybride opt-in 100 % officiel.**
- Taille/puissance de l'armée = `followers_count` du jour (« l'armée a 1 342 mages »).
- Personnages **nommés** = ceux qui ont commenté (« JE REJOINS ») ou envoyé un DM mot-clé. Seed = ID interne, alias IGSID.
- Atouts : zéro risque compte, zéro coût, RGPD propre, IGSID stable, webhooks temps réel, Reel publiable par l'API, l'enrôlement par **commentaire** alimente l'algorithme (engagement) alors que « suivre » seul n'a pas de friction visible. Les DM dopent aussi l'engagement mais exigent un serveur et la réponse < 24 h.
- Défauts : friction plus forte qu'un simple follow (beaucoup moins d'enrôlés au départ), perte de la magie « automatique ». Mitigation : le follow donne un personnage « soldat anonyme » généré (nombre seulement), l'opt-in le « nomme ».
- Mentions en story : bonne idée de viralité mais lecture limitée [S] ; ne pas en dépendre.

**Repli — Export officiel JSON planifié (quotidien) pour « follow = personnage ».**
- Légitime, sans ban, gratuit. Diff quotidien = nouveaux abonnés et désabonnés. Pas d'ID numérique ni d'avatar (nom affiché absent [S]).
- Verrous : export planifié vers Drive/Dropbox/etc. [T], délai de génération non établi, pseudo = clé fragile (renommage = désabonnement + nouvel abonné).
- Utile pour la pré-prod ; à valider sur un vrai export avant de s'engager.

**3e — Scraper « sans cookie » (Apify/HikerAPI) pour liste complète + monitor.**
- À réserver à un test limité en pré-prod : coût négligeable (quelques centimes) mais hors cadre CGU/RGPD pour la prod, listes parfois partielles, dépendance à des acteurs tiers.
- **Éviter** : cookie de session, instagrapi/instaloader connectés, pilotage navigateur sur le compte de jeu.

## Plan de PoC (pré-prod, ~1 week-end)

1. App Meta de type « Instagram Login », compte pro/créateur lié, accès Standard, ajoutez-vous comme testeur. Vérifier que `followers_count` répond (GET `/me?fields=followers_count`).
2. Webhook `comments` + `messages` sur un petit serveur HTTPS (tunnel de dev). Journaliser les payloads bruts : **confirmer** `from.id`, `from.username`, `like_count`.
3. Un post « Commente JE REJOINS » ; vérifier la création de personnage et le seed (ID interne).
4. Demander **un export JSON réel** (Centre de comptes) : inspecter `followers_1.json` (champs, ID numérique ?, délai). Tester l'export planifié quotidien.
5. Test optionnel : un run Apify gratuit sans cookie (< 1 000 abonnés) comparé à l'export, pour mesurer l'exhaustivité ; supprimer les données ensuite.
6. Publier un Reel de test par `REELS` + `media_publish` (phase 2) depuis une URL publique (stockage objet).
7. Rédiger la page d'information/opposition RGPD avant tout affichage d'un abonné réel.

## Questions ouvertes pour le mainteneur

1. Le côté « suis-moi et tu as un perso » est-il non négociable ? Sinon, accepter l'opt-in par commentaire et un soldat anonyme pour les autres.
2. Accepte-t-on qu'un personnage de pré-prod ne soit pas repris en prod (IGSID différents) ?
3. Quelle tolérance au risque légal : scrapers sans cookie en prod, ou uniquement des voies officielles ?
4. Le compte de prod sera-t-il public et vérifié (impact HikerAPI) ?
5. Avatars/pseudos dans la vidéo : opt-in explicite exigé, ou information + opposition suffisent ?
6. Souhaite-t-on gérer les désabonnements (personnage « déserteur »), à ce prix de fragilité ?

## Sources

- Vue d'ensemble de l'API : https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
- Niveaux d'accès, App Review, IGSID, quotas : https://developers.facebook.com/docs/instagram-platform/overview
- Champs webhook : https://developers.facebook.com/documentation/instagram-platform/webhooks/fields
- Publication de Reels : https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
- User Profile API : https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile
- Messaging API : https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
- Changelog : https://developers.facebook.com/docs/instagram-platform/changelog
- Modération des commentaires : https://developers.facebook.com/documentation/instagram-platform/comment-moderation
- Référence webhook IG : https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram/
- Guide export (tiers) : https://securefollow.pages.dev/en/schedule-instagram-data-export-google-drive
- Contenu de l'export (tiers) : https://securefollow.pages.dev/en/what-is-inside-instagram-export-zip
- Apify Followers : https://apify.com/publicsignallabs/instagram-followers
- Apify Follower Monitor : https://apify.com/instaprism/instagram-follower-monitor
- HikerAPI : https://hikerapi.com/
- Meta v. Bright Data : https://www.fbm.com/post/102kqw7/ et https://www.zyte.com/blog/california-court-meta-ruling/
- CNIL, intérêt légitime et moissonnage : https://cnil.fr/fr/node/165783
- Risques instagrapi/instaloader : https://subzeroid.github.io/blog/instagrapi-vs-instaloader/ et https://instaloader.github.io/troubleshooting.html
