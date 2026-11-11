# 08 — Sécurité périmétrique : Cloudflare, Vercel ou les deux

Date : 2026-11-11. [V] = lu dans la doc ou le dépôt aujourd'hui ; [S] = supposé ou déduit. Accès au Portfolio : accordé (lecture seule).

## 1. Verdict

1. Cloudflare en proxy devant Vercel est **déconseillé, pas incompatible** [V] : la doc Vercel dit « We do not recommend » et liste des dégradations, aucune interdiction.
2. Le Portfolio a **moins de leviers que sa réputation** : plan gratuit, WAF sans réglage, une seule règle de débit, pas de Turnstile. Le gros de sa sécurité vient de Tunnel + Access, qui protègent un VPS et un admin Django : ce besoin n'existe pas ici.
3. Sur Vercel Hobby, presque chaque levier du Portfolio a un équivalent gratuit ; les manques sont mineurs pour ce projet.
4. **Recommandation : scénario (a)**, sécurité portée par Vercel, Cloudflare en DNS seul (DNSSEC, R2).
5. La consigne « tous les leviers comme pacome.dev » est satisfaite sur le fond par (a) ; la prendre à la lettre (proxy) ferait perdre BotID/Bot Protection et l'IP réelle côté Vercel.

## 2. Inventaire des leviers du Portfolio

Plan : **Free** pour Cloudflare, Zero Trust Free (50 utilisateurs) [V] `infra/RUNBOOK.md` § « Cloudflare — l'état attendu » et § Coût.

| Levier | État constaté | Source |
|---|---|---|
| Proxy + CDN | Tous les enregistrements « Proxied » | RUNBOOK ; `docs/adr/0003-cloudflare-en-bordure.md` |
| Tunnel | `portfolio`, aucun port web ouvert sur le VPS | RUNBOOK ; ADR 0003 |
| Access | Application `portfolio-admin` sur `/admin`, GitHub seul, session 24 h ; garde Caddy contre `%2F` | RUNBOOK |
| WAF + DDoS | Offre gratuite, « sans réglage, aucune règle personnalisée » ; activité des règles gérées « non établie » | RUNBOOK |
| Limitation de débit | Une règle `api-100-par-10s` : `/api/*`, par IP, 100 req / 10 s, blocage 10 s | RUNBOOK |
| Mode TLS | Minimum 1.2 (zone et `media`). Mode d'origine (Full strict ou autre) : non documenté | RUNBOOK |
| HSTS | **Aucun en-tête** : `.dev` est préchargé HSTS | `infra/caddy/Caddyfile`, ADR 0020 |
| DNSSEC | **Non documenté** dans le dépôt [S : probablement inactif ou non tracé] | grep négatif |
| Turnstile | Absent, optionnel si abus (D41) | ADR 0003, RUNBOOK |
| Anti-bots (Bot Fight Mode) | Non documenté | grep négatif |
| E-mail | SPF `-all`, DMARC `reject` (domaine muet) | RUNBOOK |
| Redirection www | Redirect Rule 301 | RUNBOOK |
| CSP + en-têtes | CSP stricte, `X-Frame-Options`, `nosniff` (Caddy) ; CSP native Django | `Caddyfile`, ADR 0020 |
| Alerte budget, R2 | Alerte 1 $, buckets privés, jetons bornés | RUNBOOK |

## 3. Cloudflare en proxy devant Vercel (2026)

Position officielle [V] : <https://vercel.com/docs/security/reverse-proxy> (maj 2026-09-18) et <https://vercel.com/kb/guide/can-i-use-a-proxy-on-top-of-my-vercel-deployment>. Vercel recommande de connecter directement et de garder Cloudflare en DNS seul si c'est tout ce qu'il faut.

Ce qui se dégrade [V] :
- **Visibilité du pare-feu Vercel** réduite ; IP utilisateur non identifiables de façon fiable ; une attaque sur le proxy se retransmet et gonfle l'usage ; purge de cache automatique impossible si le proxy est compromis.
- **Bot Protection managé : ne fonctionne pas** derrière un proxy ; défis répétés si les IP de sortie changent (KB).
- **Cache double** : un déploiement n'invalide pas le cache Cloudflare, d'où HTML périmé et assets manquants ; ne jamais cacher `/.well-known/vercel/*`.
- **TLS** : mode Flexible = boucle de redirection ; exiger **Full (strict)** ; laisser passer le défi ACME HTTP-01 sur le port 80 hors redirection et hors défis WAF ; la redirection HTTP→HTTPS de Vercel ne se désactive pas.
- **Latence** : un saut de plus. **Support** : Vercel ne déboguera pas le proxy.
- **Facturation** : [S] le trafic filtré chez Cloudflare ne coûte rien à Vercel, mais le trafic d'attaque qui traverse est facturé comme un autre.

Nuance [V] : la page « reverse-proxy » liste Cloudflare parmi les fournisseurs **Verified Proxy Lite**, activé automatiquement sur tous les plans (en-tête `CF-Connecting-IP`), ce qui limite le blocage du proxy par le pare-feu de plateforme ; la page KB ne confirme pas ce point. Les deux pages ne sont pas cohérentes : à tester avant de s'y fier. Verified Proxy Advanced (IP réelle, géolocalisation) : Enterprise seulement.

Ce qui marche si on s'y prend bien : Full (strict), cache désactivé, chemins `.well-known` exemptés. Exploitable, mais sans Bot Protection, et BotID perd un signal propre [S].

## 4. Table de correspondance

| Levier Portfolio | Équivalent Vercel | Hobby | Pro |
|---|---|---|---|
| DDoS | Mitigation de plateforme [V] | oui, gratuit | oui |
| WAF règles gérées | OWASP CRS : **Enterprise** ; Bot Protection et AI Bots : tous plans (inactifs par défaut) [V] | Bot/AI oui, OWASP non | idem |
| Règles personnalisées | Custom Rules : log, deny, challenge, bypass, redirect [V] | **3 règles en tout** (dont 1 de débit) [V] | plus |
| Blocage IP / CIDR | IP Blocking projet [V] | oui | oui |
| Limitation de débit | WAF Rate Limiting, fenêtre fixe, clés IP et JA4 [V] | **1 règle**, 1 M requêtes autorisées incluses | 40 règles, facturé à l'usage |
| Anti-bots / Turnstile | BotID Basic [V] ; Deep Analysis (Kasada) | Basic gratuit | Deep : 1 $ / 1 000 appels |
| Under Attack Mode | Attack Mode 1/6/24 h, laisse passer cron et bots vérifiés [V] | oui | oui |
| Actions persistantes (blocage temporisé) | Persistent actions [V] | non | oui |
| Mode TLS, TLS min | TLS 1.2 et 1.3 imposés, HTTPS forcé, minimum non réglable [V/S] | auto | auto |
| HSTS | `max-age=63072000` par défaut sur domaine personnalisé ; `includeSubDomains; preload` via en-têtes [V] | oui | oui |
| En-têtes, CSP | `headers()` de `next.config` (HSTS, CSP, XFO, Permissions-Policy, nosniff) [V] | oui | oui |
| Access (admin) | Vercel Authentication : réservée aux comptes Vercel ; Password : **non Hobby** ; Passport et Trusted IPs : Enterprise [V] | partiel | Password 20 $/mois/projet |
| Tunnel / IP d'origine masquée | **Aucun équivalent, inutile** : pas de serveur à cacher | — | — |
| Alerte budget | Spend Management [S, non vérifié] | à vérifier | oui |
| Observabilité | Onglet Firewall, alertes [V] | oui | plus |

**Sans équivalent Vercel** : Tunnel, Access par identité GitHub/Google sur un chemin, masquage d'IP d'origine. **Restent chez Cloudflare en DNS seul** : DNS, **DNSSEC** (DS automatique si registrar Cloudflare, sinon manuel [V] ; indépendant du proxy [S]), Registrar, SPF/DMARC, R2.

## 5. Scénarios

| | (a) Vercel + CF DNS seul | (b) CF proxy + tous leviers | (c) Sans Cloudflare |
|---|---|---|---|
| Protection réelle ici | Bonne : DDoS, BotID, Bot Protection, 3 règles, 1 limite de débit | Un peu plus de règles gratuites (Cloudflare Free : règles personnalisées, 1 limite de débit [S] ) mais Bot Protection Vercel perdu, IP réelle dégradée | Identique à (a) sauf DNSSEC si DNS Vercel |
| Complexité | Faible | Élevée : Full strict, ACME, cache, doubles règles, deux consoles | La plus faible |
| Coût | 0 + domaine | 0, mais risques de facturation parasite | 0 |
| Apprentissage Vercel | **Maximal** : tout se règle dans Vercel | Faible : le filtrage migre chez Cloudflare | Maximal |

(b) contredit l'objectif d'apprendre Vercel et ajoute des pannes possibles pour un site sans formulaire.

## 6. Durcissement quel que soit le scénario

**`/api/mcp`**
- Jeton aléatoire d'au moins 32 octets, comparé en temps constant, en variable d'environnement **Sensitive**, rotation documentée ; `withMcpAuth` avec `required: true` et scopes [V]. Un jeton par client, révocable.
- Débit : règle WAF sur `/api/mcp` **ou** `checkRateLimit` de `@vercel/firewall` [V]. Sur Hobby il n'y a qu'**une** règle de débit : la réserver à `/api/mcp`, et prévoir un plafond applicatif pour le reste [S].
- Valider l'en-tête `Origin` (exigence de la spécification MCP contre le rebinding) [S].
- Restriction d'IP : une règle deny hors liste d'IP est possible [V], mais fragile si l'IP du mainteneur change ou si le client MCP sort depuis un cloud tiers [S] : ne pas l'activer au lancement sans test.
- Zod strict, journal d'audit, `maxDuration` borné.

**Crons**
- `CRON_SECRET` ≥ 16 caractères alphanumériques ; la route compare `Authorization: Bearer …` et rend 401 sinon, et 401 si la variable est absente [V]. `GET` seul, `force-dynamic`, idempotent.
- Hobby : une exécution par jour maximum, à l'heure près ; production seulement [V].
- Attack Mode laisse passer les crons ; aucune règle deny/challenge ne doit viser `/api/cron/*` [V].
- Rotation : modifier, redéployer, vérifier la première exécution [V].

## 7. Recommandation et liste de lancement

**Scénario (a).** Ordre :
1. Domaine : DNS chez Cloudflare en **DNS seul** (nuage gris), certificat Vercel vérifié.
2. **DNSSEC** activé, DS posé (automatique si registrar Cloudflare).
3. `next.config` : HSTS (`includeSubDomains; preload` si le domaine s'y prête), CSP stricte, `nosniff`, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy.
4. Variables Sensitive : jeton MCP, `CRON_SECRET`.
5. Deployment Protection : Standard Protection (Vercel Authentication sur les previews) ; **ne pas** choisir « All Deployments », qui fermerait le site public.
6. Bot Protection en Log puis Challenge ; AI Bots selon la politique voulue.
7. Règle de débit unique sur `/api/mcp` ; plafond applicatif ailleurs.
8. Règles restantes : blocage des chemins de scan (`.env`, `.git`, `wp-`), une en réserve.
9. BotID Basic si un formulaire apparaît ; alerte de dépense ; procédure Attack Mode au runbook.

## 8. Questions ouvertes

- Nom de domaine et registrar : `.dev` change la donne HSTS.
- Quota de règles gratuites Cloudflare ; `checkRateLimit` sur Hobby face à la limite d'une règle [S].
- DNSSEC et mode TLS d'origine du Portfolio : non tracés, à lire dans la console.
- Verified Proxy Lite pour Cloudflare : pages Vercel contradictoires.
- Spend Management sur Hobby : non vérifié.

## 9. Sources

- <https://vercel.com/docs/security/reverse-proxy>
- <https://vercel.com/kb/guide/can-i-use-a-proxy-on-top-of-my-vercel-deployment>
- <https://vercel.com/docs/vercel-firewall> et sous-pages (custom-rules, rate-limiting, managed-rulesets, ip-blocking, usage-and-pricing, attack-mode)
- vercel.com/docs : botid, deployment-protection, cdn-security/encryption, schedules/cron-jobs/manage-cron-jobs, mcp/deploy-mcp-servers-to-vercel
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/headers>
- <https://developers.cloudflare.com/dns/dnssec/>
- Portfolio (lecture seule) : `infra/RUNBOOK.md`, `docs/adr/0003-cloudflare-en-bordure.md`, `docs/adr/0020-csp-native-de-django.md`, `infra/caddy/Caddyfile`
