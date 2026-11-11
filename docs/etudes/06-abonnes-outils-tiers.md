# Étude 06 — Récupérer les abonnés via un outil tiers (11/11/2026)

Légende : **[V]** vérifié sur une page lue ; **[T]** affirmé par un vendeur sans preuve ; **[S]** supposition. Prolonge l'étude 01 (non refaite). Aucune API appelée, aucun compte créé : les chiffres de fiabilité sont ceux affichés par les pages, pas des mesures.

## Verdict

1. **HikerAPI en principal** : appel synchrone paginé (~25 abonnés/page), `pk` numérique, 0,0006 $ la requête, soit ~0,024 $ pour 1 000 abonnés, 25 à 35 fois moins cher que les acteurs Apify [V].
2. **Repli : `scraping_solutions/instagram-scraper-followers-following-no-cookies`** (Apify, 20 227 utilisateurs, 4,81/5), second choix `instaprism/instagram-followers-scraper` ; tous deux sans cookie [V].
3. **Exhaustivité non démontrable sur pièces** : Instagram plafonne certaines listes (comptes vérifiés ~25-50 abonnés [V], « limite Instagram » [V]). Seul le PoC tranche.
4. Aucun service ne documente un tri « plus récent d'abord » de façon fiable (un seul vendeur l'affirme [T]) : prévoir la **relecture complète** (peu coûteuse avec HikerAPI) et l'arrêt anticipé comme simple optimisation à valider.
5. Les URL d'avatar expirent : télécharger vers Blob à l'ingestion, sans exception [V].

## Tableau comparatif

| Service | Tarif | Champs | Plafonds / exhaustivité | Ergonomie | Fiabilité affichée |
|---|---|---|---|---|---|
| **HikerAPI** `/v1/user/followers/chunk` | 0,0006 $/req, 100 gratuites, solde sans expiration, 200/403/404 facturés, 50x non [V] | `pk`, `username`, `full_name` [V, exemples de la doc] ; avatar/privé/vérifié non listés sur la page [S] | ~25/page, curseur `max_id` ; compte vérifié : ~50 sans curseur [V] | Synchrone, pas de webhook, SDK Python/JS/Go/PHP [V] | « 10M+ req/jour » [T] ; page de statut citée, non lue ; Glama signale activité du MCP « Slowing » (hors API) [V] |
| **Apify `scraping_solutions/instagram-scraper-followers-following-no-cookies`** | 0,60 à 0,85 $/1 000 lignes uniques, échecs non facturés [V] | `id`, `username`, `full_name`, `is_private`, `is_verified`, `profile_pic_url` [V] | `resultsLimit` max 500 000 ; vérifiés/pros : ~25 sans curseur ; jeton de reprise [V] | Run asynchrone + webhook Apify, dataset JSON | 4,81/5 ; 100 % de runs réussis ; durée et date de MAJ non affichées [V] |
| **Apify `instaprism/instagram-followers-scraper`** | 3,80 $/1 000 [V] | `userId`, `username`, `fullName`, `profilePicUrl`, `isVerified`, `position` (1 = plus récent [T]) [V] | `limit` 0 = illimité ; « accès aux anciens abonnés parfois limité » [V] | Async ; sauvegarde toutes les 60 s | 4,89/5 ; 1 013 utilisateurs, 25 actifs/mois [V] ; 1 000 → 5-10 min, 10 000 → 15-30 min, 50 000 → 30-60+ min [T] |
| **Apify `instaprism/instagram-follower-monitor`** | 10 $/1 000 résultats, ~2-5 $/mois quotidien [T] | nouveaux : `userId`, `username`, `fullName`, `isVerified` ; désabonnés : IDs seuls ; **pas d'avatar** [V] | `limit` 10 000 par défaut, effet sur les gros comptes non expliqué [V] | Async ; snapshot interne Apify (opaque) | 5/5, 12 utilisateurs actifs/mois [V] |
| **EnsembleData** | Abonnement quotidien : 100 $/mois = 1 500 unités/jour... jusqu'à 1 400 $ [V] ; « Followers List » 2 unités pour 100 profils, plateforme non précisée [V] | non vérifiés | non vérifiés | Synchrone | Non évaluable |

Écartés : **`themineworks/instagram-followers-scraper`** exige NOTRE cookie `sessionid`, plafond 5 000 [V] ; **ScrapeCreators** : aucun endpoint d'abonnés dans sa liste Instagram [V] ; **Bright Data** : produits « followers » = compteurs, pas de liste trouvée [T] ; **RocketAPI** : rien de vérifiable trouvé.

## Recommandation

- **Principal : HikerAPI**, derrière une interface `FollowerProvider { listPage(cursor) -> {users[], next} }`. Raisons : prix, synchrone (adapté à des fonctions Vercel courtes : une page ou N pages par invocation, curseur sauvé dans Neon), pas de dépendance à un cookie.
- **Repli : Apify `scraping_solutions/...`** (cadre `OUTPUT`/jeton de continuation, tarif connu, plus grand volume d'utilisateurs). Second repli : `instaprism/instagram-followers-scraper`. Le monitor n'apporte rien (pas d'avatar, état chez le vendeur).
- **Conditions d'utilisation** : celles de HikerAPI sont ambiguës : licence « personnelle, non commerciale » sur le contenu du site, interdiction du scraping du site et de la création de bases par téléchargement ; indemnisation à la charge du client [V]. À faire confirmer par leur support (usage commercial/hobby d'une API). Les liens d'avatar sont temporaires, HikerAPI n'héberge rien [V]. Apify : pas de clause lue [S, à lire].
- **Mode dégradé** : en cas d'échec, ne rien supprimer ; conserver la dernière liste valide, marquer la synchro « en échec », alerter, réessayer à J+1. Ne jamais déduire des désabonnés d'un run incomplet.

## Synchronisation et coûts

Tri : aucun fournisseur ne le garantit [V]. L'ordre « récent d'abord » n'est affirmé que par instaprism [T] ; Instagram trie peut-être autrement dans l'application [S].

| Abonnés | HikerAPI, relecture quotidienne (pages × 30) | Apify `scraping_solutions` quotidien |
|---|---|---|
| 1 000 | 1 200 req ≈ **0,72 $/mois** | ≈ 21-26 $ |
| 10 000 | 12 000 req ≈ **7,2 $** | ≈ 210-260 $ |
| 100 000 | 120 000 req ≈ **72 $** (si la liste est exhaustive) | ≈ 1 800-2 550 $ |

(Calculs : 25 abonnés/page ; relecture hebdomadaire = environ /7.) Une lecture incrémentale (1 page/jour, arrêt au premier pk connu) coûterait ~0,02 $/mois, mais **seulement si le tri est confirmé** par le PoC.

**Recommandation** : lecture incrémentale quotidienne (si validée) pour les nouveaux ; **diff complet hebdomadaire** pour les désabonnés (le diff complet est le seul moyen [V] : le monitor lui-même compare des snapshots). Un abonné n'est déclaré parti qu'absent de deux listes complètes consécutives et si le total lu est proche de `followers_count` (écart ≤ 2 %).

## Identifiant

`pk` HikerAPI et `id`/`userId` des acteurs Apify désignent tous un identifiant numérique d'utilisateur Instagram [V sur les noms de champs]. Qu'il soit identique d'un fournisseur à l'autre et qu'il survive à un changement de pseudo est **[S] très probable mais non confirmé par une page** : c'est un test du PoC. Un ID est stocké en texte (chaîne), jamais en nombre JS (dépassement de précision possible [S]). Alias de repli : pseudo courant, mis à jour à chaque synchro.

## Photos de profil

- **Durée de vie** : URL signées du CDN Instagram, expiration encodée dans `oe` (hex) et couverte par la signature ; estimations de blogs 24 h à ~4,5 jours [T]. HikerAPI et Apify le confirment (« peuvent expirer ») [V]. Prolonger l'URL → 403 [T].
- **Ingestion** : télécharger côté serveur au moment de la synchro, avant toute autre étape (pas de CORS côté serveur [S]) ; recompresser en WebP ~200 px ([S] ≈ 5-15 Ko). Pathname stable `avatars/{pk}.webp` pour remplacement sans changer l'URL.
- **Coût Vercel Blob** [V] : 0,023 $/Go-mois ; envois 5 $/million d'opérations ; lectures hors cache 0,40 $/million ; transfert 0,05 $/Go. À 10 000 images (~100 Mo) : stockage ~0,002 $/mois, envoi initial ~0,05 $. À 100 000 (~1 Go) : ~0,02 $/mois, envoi ~0,50 $. **Piège** : le plan Hobby n'inclut que 2 000 opérations avancées et 15/s, et bloque Blob au-delà ; prévoir Pro (ou étaler les envois).
- **Rafraîchissement** : n'envoyer que pour les nouveaux pk à l'ingestion, puis ré-évaluer l'avatar d'un abonné seulement lors d'une mise en avant ou tous les 90 jours [S] ; comparer l'empreinte des octets pour éviter les envois inutiles.
- **Pièges** : l'hotlink depuis le navigateur peut échouer (expiration, blocage) : servir uniquement la copie Blob.

## RGPD pratique (France)

La CNIL recommande l'information la plus large possible et un droit d'opposition préalable, des critères de collecte précis, l'exclusion des données inutiles et l'attention aux mineurs [V, fiche moissonnage]. En pratique :
1. **Page publique** « Informations » : qui, quoi (pk, pseudo, photo), pourquoi, base légale (intérêt légitime), durée, contact.
2. **Retrait sur demande** par message privé ou courriel, traité sous un mois ; liste d'exclusion de pk, respectée à chaque synchro (on ne stocke plus que le pk).
3. **Conservation** : à la désinscription détectée, effacer pseudo et photo sous 30 jours ; garder le pk seul si nécessaire (seed).
4. **Photo** : option sobre = ne l'afficher publiquement que sur l'annuaire, avec lien de retrait visible sur chaque fiche.
5. Ne stocker ni bio ni autres champs ; ne pas afficher les comptes privés ; registre de traitement simple.

## Compte privé (pré-prod)

Les acteurs ne lisent pas les comptes privés [V] ; HikerAPI : non documenté pour un compte privé, comportement à tester [S]. Options : (a) passer le compte en public pendant le PoC ; (b) créer un compte de test public dédié (recommandé : le personnel reste intact) ; (c) export officiel JSON (étude 01, sans pk, ni avatar) pour la pré-prod seulement.

## Protocole de PoC (pré-prod, ~2 h)

Mainteneur : créer un compte HikerAPI (100 requêtes offertes, suffisantes pour 2 500 abonnés), générer la clé d'accès (`x-access-key`), la déposer dans `.env.local`, rendre le compte public, noter `followers_count` (application). Option : un compte Apify gratuit (5 runs/mois [V] pour `publicsignallabs`, plafond 1 000 résultats par run pour `scraping_solutions` [V]) pour comparer les pk.
1. Lire la liste complète en HikerAPI (script jetable, curseur `max_id`), sauvegarder JSON brut.
2. Relancer 10 min après : comparer les deux listes.
3. Même compte via Apify (`scraping_solutions`) : comparer les pk avec HikerAPI.
4. Télécharger 20 avatars, vérifier HTTP 200, poids, puis le test d'expiration à 24 h.
5. Changer le pseudo du compte test d'un abonné de confiance, relire : même pk ?
6. Suivre/désuivre avec un second compte de test : quand apparaît-il dans la liste, à quelle position (tri) ?

**Critères d'acceptation** : (1) exhaustivité = lignes uniques / `followers_count` ≥ 98 % ; (2) un même pk présent des deux côtés ≥ 99 % entre deux runs HikerAPI, et ≥ 99 % entre HikerAPI et Apify ; (3) 0 doublon de pk ; (4) durée complète < 10 min pour 5 000 abonnés ; (5) coût mesuré ≤ 0,15 $ par lecture complète de 5 000 ; (6) avatars 100 % téléchargés ; (7) un nouvel abonné apparaît dans les 25 premiers résultats (sinon, pas d'arrêt anticipé).

## Questions ouvertes

1. Le compte de prod sera-t-il vérifié ou pro ? Dans ce cas, la liste est tronquée (~25-50) et le plan tombe.
2. HikerAPI : usage commercial/hobby autorisé ? (question à poser à leur support).
3. Tri des abonnés réel : à mesurer.
4. Exhaustivité sur 50 000 : non vérifiable avant d'avoir une cible réelle.
5. Plan Vercel : Pro nécessaire pour Blob ?
6. Date de dernière mise à jour des acteurs Apify : non affichée.

## Sources

- HikerAPI : https://hikerapi.com/ ; https://hikerapi.com/terms ; https://hiker-doc.readthedocs.io/en/latest/ ; https://glama.ai/mcp/servers/subzeroid/hikerapi-mcp/tools/get_v1_user_followers_chunk
- Apify : https://apify.com/scraping_solutions/instagram-scraper-followers-following-no-cookies ; https://apify.com/instaprism/instagram-followers-scraper ; https://apify.com/instaprism/instagram-follower-monitor ; https://apify.com/publicsignallabs/instagram-followers ; https://apify.com/themineworks/instagram-followers-scraper
- EnsembleData : https://ensembledata.com/pricing ; ScrapeCreators : https://scrapecreators.com/ et https://docs.scrapecreators.com/llms.txt ; Bright Data : https://brightdata.com/products/web-scraper/social-media-scrape/followers.md
- Vercel Blob : https://vercel.com/docs/vercel-blob/usage-and-pricing
- CNIL : https://www.cnil.fr/fr/node/165783
- Expiration des URL d'avatar (blogs) : https://sociavault.com/blog/profile-picture-url-expired ; https://dev.to/alex97po/pre-signed-url-expiry-how-to-detect-when-your-media-urls-will-break-4g74
