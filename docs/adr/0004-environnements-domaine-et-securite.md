# ADR 0004 — Environnements, domaine et sécurité

- **Statut** : accepté le 2026-11-15. Précisé le 2026-11-22 : la ligne « Saisie » nomme `WIKI_DATABASE_URL`, secret de lecture du wiki (#43). Précisé le 2026-11-23 : domaine `spellarmy.com`. Précisé le 2026-11-25 : team Vercel « Spell Army », slug `spell-army`, et projet Neon `spell-army-prod` (#57). Précisé le 2026-11-27 : la ligne « En-têtes » fixe une CSP sans jeton, et la ligne « Adresse `.vercel.app` » exclut la route du tic de la redirection (#22). Amendé le 2026-11-27 : un seul projet Vercel, une seule branche Git, livraison par tag, pré-prod sur le compte du jeu (§ Environnements, #22).
- **Source** : `docs/etudes/00-cadrage.md` § 1 et § 2 « Architecture » ; étude
  `08-securite-cloudflare-vercel.md`

## Décisions

### Environnements

| Sujet | Décision | Origine |
|---|---|---|
| Deux environnements publics sur le compte du jeu | La prod et la pré-prod montrent les personnages des abonnés du compte dédié. La pré-prod prépare les prochaines fonctionnalités : sa base est une copie de la prod, recopiée à la demande, et elle n'importe pas. | Décidé (cadrage, amendé le 2026-11-27) |
| Un projet Vercel | Un seul projet, `spell-army`, dans la team « Spell Army » (slug `spell-army`, Hobby), et une seule branche Git, `main`. La pré-prod est le déploiement de `main`, auquel `beta.<domaine>` est attaché ; ses variables sont celles de Preview limitées à la branche `main`. Pour livrer, le mainteneur pose un tag `vX.Y.Z` sur `main` : un workflow GitHub Actions promeut en production le déploiement de pré-prod de ce commit, que Vercel reconstruit avec les variables de Production. La « Production Branch » du projet n'est donc jamais `main`. Les prévisualisations des PR restent protégées. | Accepté le 2026-11-27 |
| Bandeau bêta | La pré-prod affiche un bandeau « bêta ». Il est piloté par une variable d'environnement, pas par du code propre à chaque environnement. | Décidé (cadrage) |

La pré-prod étant un déploiement de prévisualisation, `beta.<domaine>` est ouvert par une exception de
Deployment Protection, et aucune tâche planifiée n'y tourne : cela convient, puisqu'elle n'importe pas.

### Domaine et DNS

| Sujet | Décision | Origine |
|---|---|---|
| Domaine | Un domaine entièrement au nom du projet : aucune adresse Vercel visible du public. Un sous-domaine de `pacome.dev` est donc exclu. | Décidé (cadrage) |
| Registrar | Cloudflare Registrar, au prix coûtant. Le mainteneur achète lui-même. Domaine : `spellarmy.com`, acheté le 2026-11-23, DNSSEC lancé par Cloudflare à l'achat. | Accepté le 2026-11-15 |
| Adresses | Prod sur le domaine nu, `www` redirigé vers lui ; pré-prod sur `beta.<domaine>`. | Accepté le 2026-11-15 |
| DNS | Cloudflare en DNS seul (nuage gris), avec DNSSEC. Aucun proxy devant Vercel. | Décidé (cadrage) |
| Adresse `.vercel.app` | Elle ne peut pas être supprimée. Dans le projet, une redirection permanente (308), limitée à l'hôte `.vercel.app` de production, envoie vers le domaine en gardant le chemin, sauf la route du tic (`/api/tic`), que Vercel Schedules peut appeler sur cette adresse. Les autres adresses générées restent derrière la protection. | Accepté le 2026-11-15 |

### Protections Vercel

Tous les leviers du plan gratuit sont activés (cadrage, Décidé) :

- **Deployment Protection** en *Standard Protection*, par Vercel Authentication. Les prévisualisations
  sont protégées, les domaines de production restent publics, et `beta.<domaine>` est ouvert par une
  exception de Deployment Protection. Ne jamais choisir « All Deployments »,
  qui fermerait le site.
- **Une seule règle de débit** sur Hobby : elle va sur `/api/mcp`.
- **Bot Protection** en mode Log, puis Challenge. Blocage des chemins de scan (`.env`, `.git`, `wp-`).
  Aucune règle deny ou challenge ne vise la route des tâches.
- **En-têtes** dans `next.config` : HSTS, CSP sans jeton, `nosniff`, Referrer-Policy,
  Permissions-Policy. La CSP : `default-src 'self'`, `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `connect-src 'self' blob:`,
  `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'` ;
  `'unsafe-eval'` s'ajoute aux scripts en développement seulement. Sans jeton par requête, les pages
  gardent le cache CDN (ADR 0002).
- **Attack Mode** en cas de pic : il laisse passer les tâches planifiées.

### Serveur MCP et secrets

| Sujet | Décision | Origine |
|---|---|---|
| Authentification MCP | Jeton fixe en v1, pour le seul poste du mainteneur ; OAuth plus tard. Jeton aléatoire d'au moins 32 octets, comparé en temps constant, stocké en variable *Sensitive*, un par environnement. | Décidé (cadrage) |
| Durcissement MCP | Validation Zod stricte, journal d'audit, pas de SQL libre, confirmation sur les outils destructeurs. | Accepté le 2026-11-15 |
| Secrets | Tout ce qui est sensible (jetons, mots de passe, codes de récupération) vit dans KeePassXC, qui fait référence. Aucun secret dans le dépôt, une issue ou une conversation. En fin de projet, la base est sauvegardée sur un disque externe. | Décidé (cadrage) |
| Saisie | Le mainteneur crée et saisit lui-même les secrets : `CRON_SECRET`, jeton MCP, clé HikerAPI et chaînes Neon dans les réglages Vercel, ceux de la prod en Production, ceux de la pré-prod (sa chaîne Neon, son jeton MCP) en Preview limité à `main` ; `CRON_SECRET` aussi dans les secrets GitHub Actions (filet de l'ADR 0002) ; `VERCEL_TOKEN`, jeton limité à la team et daté, dans les secrets GitHub Actions (workflow de livraison) ; `WIKI_DATABASE_URL` dans les secrets GitHub Actions, chaîne du rôle `wiki_lecture`, en lecture sur la seule table `spells` de `spell-army-prod` (publication du wiki). | Accepté le 2026-11-15 |
| Récupération Neon | Neon ne fournit pas de codes de récupération : l'accès repose sur la sauvegarde de l'application d'authentification, qui est notée dans KeePassXC. | Accepté le 2026-11-15 |
| Accès de Claude à Neon | Seule l'entrée MCP locale en lecture seule sert. Le connecteur Neon de Claude est en écriture et renvoie les chaînes de connexion : ses outils qui exposent ou créent un secret (chaîne de connexion, mot de passe, identifiant) ne sont jamais appelés. | Accepté le 2026-11-15 |

## Vérifié

- Domaine attaché à une branche possible sur Hobby :
  [Assigning a domain to a Git branch](https://vercel.com/docs/domains/working-with-domains/assign-domain-to-a-git-branch),
  mise à jour le 2026-02-27, lue le 2026-11-11.
- Standard Protection, qui protège tout sauf les domaines de production, et exceptions gratuites :
  [Deployment Protection](https://vercel.com/docs/deployment-protection) et
  [Exceptions](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions),
  mises à jour le 2026-09-15, lues le 2026-11-11.
- Tâches d'une branche inactives à la création, actives en production :
  [Schedules Concepts](https://vercel.com/docs/schedules/concepts), lue le 2026-11-11.
- `.vercel.app` : on peut le rediriger, pas le masquer (redirection 308 limitée à l'hôte) :
  [Redirects](https://vercel.com/docs/routing/redirects), mise à jour le 2026-09-18, lue le
  2026-11-11. Aucun réglage pour le désactiver n'a été trouvé.
- DNSSEC chez Cloudflare : DS posé automatiquement avec Cloudflare Registrar, posé à la main ailleurs.
  Voir [DNSSEC](https://developers.cloudflare.com/dns/dnssec/), mise à jour le 2026-06-24, lue le
  2026-11-11. La gratuité sur tous les plans vient de pages Cloudflare lues par résumé de recherche,
  pas directement.
- DNSSEC indisponible chez Vercel, pour ses serveurs DNS comme pour les domaines achetés chez lui.
  Source : réponse d'un employé sur le
  [forum Vercel](https://community.vercel.com/t/enabling-dnssec-for-domains-purchased-through-vercel/32427),
  le 2026-01-30, sans calendrier au 2026-04-07. C'est un forum, pas la documentation.
- Exceptions de Deployment Protection disponibles sur tous les plans :
  [Deployment Protection Exceptions](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions),
  mise à jour le 2026-09-15, lue le 2026-11-27.
- Une prévisualisation promue en production est reconstruite avec les variables de Production :
  [Environments](https://vercel.com/docs/deployments/environments), mise à jour le 2026-09-17, lue le
  2026-11-27. La « Production Branch » se règle dans Settings → Environments → Production → Branch
  Tracking ([Git](https://vercel.com/docs/git), mise à jour le 2026-09-18).
- Une CSP à jetons rend toutes les pages dynamiques :
  [Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy), guide
  Next.js mis à jour le 2026-03-20, lu le 2026-11-27.
- `.com` et `.army` vendus par Cloudflare Registrar, lus à l'écran par le mainteneur le 2026-11-23.

## Non vérifié

- Qu'une « Production Branch » au nom d'une branche qui n'existe pas laisse bien `main` en
  prévisualisation : la doc n'en parle pas ; à constater au premier déploiement de `main`.
- Qu'une Release GitHub, qui crée son tag, déclenche le workflow de livraison comme un `git push` du
  tag : à constater à la première livraison par une Release.
- Qu'une promotion de prévisualisation lève un Instant Rollback en cours : à constater au premier
  retour arrière.
- Le lien entre DNSSEC et le statut de proxy (la page Cloudflare n'en dit rien) : sans effet ici,
  puisque le proxy est coupé.
