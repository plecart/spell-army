# ADR 0004 — Environnements, domaine et sécurité

- **Statut** : accepté le 2026-11-15. Le nom de domaine reste à choisir.
- **Source** : `docs/etudes/00-cadrage.md` § 1 et § 2 « Architecture » ; étude
  `08-securite-cloudflare-vercel.md`

## Décisions

### Environnements

| Sujet | Décision | Origine |
|---|---|---|
| Deux environnements publics | La pré-prod montre les personnages issus des abonnés du compte personnel du mainteneur et renvoie vers ce compte. La prod montre ceux du compte dédié. | Décidé (cadrage) |
| Deux projets Vercel | Un même dépôt alimente deux projets de la team « Wizard Army » (Hobby). Chacun a son domaine de production public, ses variables, sa base Neon et ses tâches planifiées. Le projet de pré-prod suit `main`. Le projet de prod suit une branche `prod`, que le mainteneur avance pour livrer. | Accepté le 2026-11-15 |
| Bandeau bêta | La pré-prod affiche un bandeau « bêta ». Il est piloté par une variable d'environnement, pas par du code propre à chaque environnement. | Décidé (cadrage) |

Avec un seul projet et un domaine de branche, ce domaine aurait été protégé par défaut (il aurait fallu
une exception), et les tâches planifiées d'une branche démarrent désactivées. Deux projets évitent ces
deux pièges, au prix de deux réglages à tenir.

### Domaine et DNS

| Sujet | Décision | Origine |
|---|---|---|
| Domaine | Un domaine entièrement au nom du projet : aucune adresse Vercel visible du public. Un sous-domaine de `pacome.dev` est donc exclu. | Décidé (cadrage) |
| Registrar | Cloudflare Registrar, au prix coûtant. Le mainteneur achète lui-même. **Le nom reste à choisir.** | Accepté le 2026-11-15 |
| Adresses | Prod sur le domaine nu, `www` redirigé vers lui ; pré-prod sur `beta.<domaine>`. | Accepté le 2026-11-15 |
| DNS | Cloudflare en DNS seul (nuage gris), avec DNSSEC. Aucun proxy devant Vercel. | Décidé (cadrage) |
| Adresse `.vercel.app` | Elle ne peut pas être supprimée. Dans chaque projet, une redirection permanente (308), limitée à l'hôte `.vercel.app` de production, envoie vers le domaine en gardant le chemin. Les autres adresses générées restent derrière la protection. | Accepté le 2026-11-15 |

### Protections Vercel

Tous les leviers du plan gratuit sont activés (cadrage, Décidé) :

- **Deployment Protection** en *Standard Protection*, par Vercel Authentication. Les prévisualisations
  sont protégées, les domaines de production restent publics. Ne jamais choisir « All Deployments »,
  qui fermerait le site.
- **Une seule règle de débit** sur Hobby : elle va sur `/api/mcp`.
- **Bot Protection** en mode Log, puis Challenge. Blocage des chemins de scan (`.env`, `.git`, `wp-`).
  Aucune règle deny ou challenge ne vise la route des tâches.
- **En-têtes** dans `next.config` : HSTS, CSP stricte, `nosniff`, `frame-ancestors 'none'`,
  Referrer-Policy, Permissions-Policy.
- **Attack Mode** en cas de pic : il laisse passer les tâches planifiées.

### Serveur MCP et secrets

| Sujet | Décision | Origine |
|---|---|---|
| Authentification MCP | Jeton fixe en v1, pour le seul poste du mainteneur ; OAuth plus tard. Jeton aléatoire d'au moins 32 octets, comparé en temps constant, stocké en variable *Sensitive*, un par environnement. | Décidé (cadrage) |
| Durcissement MCP | Validation Zod stricte, journal d'audit, pas de SQL libre, confirmation sur les outils destructeurs. | Accepté le 2026-11-15 |
| Secrets | Tout ce qui est sensible (jetons, mots de passe, codes de récupération) vit dans KeePassXC, qui fait référence. Aucun secret dans le dépôt, une issue ou une conversation. En fin de projet, la base est sauvegardée sur un disque externe. | Décidé (cadrage) |
| Saisie | Le mainteneur crée et saisit lui-même les secrets : `CRON_SECRET`, jeton MCP, clé HikerAPI et chaînes Neon dans les réglages Vercel ; `CRON_SECRET` aussi dans les secrets GitHub Actions (filet de l'ADR 0002). | Accepté le 2026-11-15 |
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

## Non vérifié

- Le lien entre DNSSEC et le statut de proxy (la page Cloudflare n'en dit rien) : sans effet ici,
  puisque le proxy est coupé.
- Les extensions de domaine vendues par Cloudflare Registrar : à voir au moment de choisir le nom.
