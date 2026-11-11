# 04 — Architecture cible de Wizard Army (matière d'ADR)

Date : 2026-11-11. **[V]** = vérifié dans la doc en ligne ce jour ; **[S]** = supposé, à vérifier.

## 1. Verdict

1. **Un seul projet Vercel** (Next.js 16, App Router) portant site, serveur MCP (`/api/mcp`) et crons, dans un **monorepo pnpm minimal** : `apps/web`, `packages/engine`, `packages/db`.
2. **Neon (Marketplace Vercel) + Drizzle**, deux projets Neon (preprod, prod). **Supabase n'est pas nécessaire** : on n'en utiliserait que Postgres.
3. **MCP** par `mcp-handler` + jeton bearer long en v1 (Claude Code, bureau et claude.ai le supportent) ; OAuth en lot d'apprentissage ultérieur.
4. **Hobby interdit l'usage commercial** [V] : Hobby tant qu'il n'y a ni revenu ni marque ; **Pro (20 $/mois) avant tout partenariat**.
5. **Pas de Cloudflare devant l'app** ; Sentry, healthchecks.io et la sauvegarde R2 du Portfolio sont réutilisés.

## 2. Inventaire du Portfolio (accès accordé, lecture seule)

Lus : `CLAUDE.md`, `.mcp.json`, ADR 0002, 0003, 0004, 0005, 0007, 0008, 0014, 0022, 0027 (et la liste des 29), `infra/`, workflows.

| Existant [V] | Pour Wizard Army |
|---|---|
| Cloudflare : registrar de `pacome.dev`, DNS, R2 (bucket `backups`), Tunnel/Access/WAF | **Repris** : DNS seul et R2. **Laissé** : Tunnel, Access, proxy. |
| Sentry SaaS Developer, organisation UE, erreurs seules, sans données personnelles (ADR 0027) | **Repris** (nouveau projet ; création effective de l'organisation à confirmer). |
| healthchecks.io (dead man's switch, ADR 0007) | **Repris** : un check par job. |
| GitHub Actions (GitHub Pro), Dependabot | **Repris** : CI et cron de dump. **Laissé** : GHCR, Trivy, SBOM, Docker. |
| `pg_dump` → `age` → `rclone` → R2, restauration testée (ADR 0007) | **Repris, allégé** : dump hebdo de la prod. |
| KeePassXC + copie hors poste (ADR 0022) | **Repris** pour les secrets. |
| `context7`, Playwright, skills `ponytail`/`cycle-pr`, format ADR | **Repris** (déjà semés ici). |
| VPS Hetzner, Compose, Caddy, Postgres/Redis/Celery/Django (ADR 0001-0006, 0015) | **Laissé** : trop lourd. L'ADR 0002 avait écarté « tout managé » pour le Portfolio ; l'objectif d'apprentissage inverse le choix. |
| Vite statique sans Node en production (ADR 0008) | **Laissé** : Next.js requis ici (SSR, route MCP, crons). |
| Pipeline lourde (couverture, QA, 29 ADR) | **Laissé** : CI courte, 3 à 5 ADR. |

Le Portfolio ne contient **aucune trace de Vercel, Neon ni Supabase** ; son MCP (phase 3) est prévu sur le VPS.

## 3. Décisions

| Sujet | Recommandé | Alternatives | Pourquoi / découverte |
|---|---|---|---|
| Framework | **Next.js 16.x** (Context7 liste 16.4.x [V]) ; modale R3F en composant client chargé à la demande | Vite + API ; Astro | Un déploiement pour tout ; découvre Fluid compute, cache/ISR, previews. |
| Structure | **pnpm workspaces** : `engine` (TS pur, seedé), `db` (schéma Drizzle + services), `apps/web`. Phase 2 : `apps/video` (Remotion) importe les types du journal depuis `engine`. | Dépôt simple ; + Turborepo | Le minimum anti-refonte : moteur et format du journal sont des paquets. Vercel gère pnpm et saute les builds inchangés [V]. Turborepo à l'arrivée de la 2ᵉ app. |
| Base | **Neon, 2 projets : `wa-preprod`, `wa-prod`** | Supabase ; Postgres du VPS | §3 bis. Env vars par environnement, `DATABASE_URL` poolée + `_UNPOOLED` [V]. |
| ORM | **Drizzle** | Prisma ; driver Neon nu | Léger, proche du SQL, sans moteur binaire [S]. |
| MCP | **`mcp-handler` 2.x** dans `app/api/mcp/route.ts` [V], Streamable HTTP sans état | Projet séparé ; xmcp | Une route suffit à cette échelle. |
| Auth MCP | **v1 : bearer** ; **v2 : OAuth** (WorkOS AuthKit ou Clerk, un seul utilisateur) | OAuth d'emblée | §3 ter. |
| Couche de service | **Partagée** (`packages/db/services`), appelée par outils MCP, crons et pages ; **pas de REST d'admin** | MCP seul ; REST + MCP | Un seul chemin d'écriture, testable sans MCP ; outils = adaptateurs minces (Zod, audit). |
| Jobs | **Cron → route (`CRON_SECRET`) [V]**, ingestion idempotente à curseur | Workflow ; Actions cron | §3 quater. |
| Environnements | Hobby : branche `preprod` + domaine [V] ; Pro : **environnement personnalisé** (1 inclus) [V] | Deux projets Vercel | Secrets et base distincts. |
| Observabilité | Sentry + healthchecks.io + dump hebdo | Drains (Pro) | Logs runtime : 1 h Hobby, 1 jour Pro [V] ; Sentry indispensable. |

### 3 bis. Supabase ? Option valable, pas la meilleure

- [V] Supabase gratuit : 2 projets actifs, 500 Mo, **pause après 1 semaine d'inactivité**, pas de sauvegarde ; Pro dès 25 $/projet. MCP officiel hébergé (lecture seule, restriction à un projet).
- Auth, RLS, Storage : **aucun besoin** (accès par le serveur). Deux projets Pro = 50 $/mois ; en gratuit, le site tomberait après une semaine calme.
- [V] Neon gratuit : 1 Go/projet, 100 projets, suspension à 5 min mais **reprise automatique**, restauration 6 h, 10 branches, branche par preview Vercel. MCP officiel (OAuth ou clé, lecture seule, déconseillé en production).
- Deux **projets** plutôt que des branches : une branche copie son parent, or la preprod (abonnés du compte perso) ne doit pas partager le lignage de la prod.
- [S] CGU commerciales des offres gratuites Neon/Supabase non lues : à relire avant un partenariat.

### 3 ter. MCP et authentification

- Claude Code [V] : `claude mcp add --transport http … --header "Authorization: Bearer …"` ou OAuth via `/mcp` ; `${VAR}` étendues dans `.mcp.json`.
- claude.ai/Desktop [V, page d'aide] : connecteur personnalisé (gratuit : un seul) ; authentification OAuth **ou « sans connexion »**, plus section **« Request headers »** pour un jeton fixe. Claude joint le serveur **depuis le cloud d'Anthropic** : URL publique obligatoire (previews protégées exclues).
- Spec MCP 2026-07-28 [V] : l'autorisation est **optionnelle** ; sinon OAuth 2.1, métadonnées RFC 9728, CIMD préféré, DCR déprécié. Vercel déconseille la comparaison à une chaîne fixe pour un serveur OAuth [V] : le bearer est un compromis assumé.
- **Plus simple et sûr** : jeton 256 bits en variable d'env sensible, comparaison en temps constant, rotation manuelle, limitation de débit sur `/api/mcp`, journal d'audit, pas de SQL libre, confirmation sur les outils destructeurs. Gratuité/limites de WorkOS et Clerk non vérifiées [S].
- Risque propre : les pseudos Instagram sont des données **non fiables** renvoyées à Claude (injection) : champs courts nettoyés, jamais de bio.

### 3 quater. Jobs

- [V] Cron Hobby : 1 passage/jour, précision ±59 min ; Pro : à la minute. « Schedules » (bêta) : minimum 15 min sur Hobby ; les deux pages divergent, à revérifier.
- [V] Fluid compute : 300 s sur Hobby ; Pro jusqu'à 800 s (1 800 s en bêta).
- [V] Le guide Vercel recommande, pour un job quotidien de plusieurs minutes : cron + route, **Workflow** si long ou fragile ; livraison cron possiblement manquée ou dupliquée.
- **Reco** : ingestion paginée avec curseur en base (reprise au passage suivant) ; combat dans une invocation si le moteur est rapide [S, à mesurer à 50 000 personnages]. **Workflow** (Hobby : 50 000 événements/mois [V]) comme lot d'apprentissage. Filet : cron GitHub Actions appelant la même route + ping healthchecks.io.

## 4. Hobby, Pro, usage commercial

- **Hobby = usage personnel non commercial** [V]. Commercial : déploiement servant le gain financier de *quiconque* participe à la production, dont « recevoir un paiement pour créer, mettre à jour ou héberger le site », promouvoir un produit, publicité ; les dons sont exclus.
- Lecture [interprétation] : un **partenariat de marque rémunéré est très probablement commercial**. Doute : support Vercel. Hobby jusqu'à la première signature, puis Pro.
- Pro [V] : 20 $/mois dont 20 $ de crédit, 1 siège, sièges lecteurs gratuits, domaine `.dev` offert 1 an, 1 environnement personnalisé (packs de 5 : 50 $), crons à la minute, 800 s, Drains, plafond de dépenses.
- Hobby [V] : quota dépassé = **blocage 30 jours** sans facture ; 3 règles WAF dont 1 de débit ; Vercel Authentication incluse.

## 5. Autres briques

| Brique | Verdict |
|---|---|
| Firewall / limitation de débit | **Utile** : gratuit [V] ; 1 règle de débit sur Hobby (`/api/mcp` ou site), 40 sur Pro. |
| Deployment Protection | **Utile** : la preprod contient des abonnés réels ; protection du domaine de branche à vérifier [S]. |
| Vercel MCP (`mcp.vercel.com`) | **Utile (apprentissage)** : déploiements, logs, analytics, OAuth [V]. |
| Analytics / Speed Insights | Léger, gratuit dans les quotas Hobby [V]. |
| Blob | Plus tard (vidéos) : Hobby 1 Go, 10 Go de transfert [V] ; avatars et GLB dans `public/`. |
| Sandbox | Plus tard : rendu Remotion documenté [V] (licence Remotion non étudiée). |
| BotID, Edge Config, Flags, AI Gateway | Gadgets : site sans formulaire ; Postgres suffit aux réglages ; AI Gateway seulement pour des textes de sorts générés. |

## 6. Cloudflare : une couche de trop

Vercel **déconseille** un reverse proxy devant ses déploiements [V] et fournit CDN, DDoS (par défaut) et limitation de débit. Garder Cloudflare en **DNS seul** et pour R2 (10 Go gratuits, sortie gratuite [V]) : sauvegardes, éventuellement vidéos lourdes de la phase 2.

## 7. Sécurité

- **Secrets** : variables d'env sensibles par environnement, copie KeePassXC, `CRON_SECRET`, jeton Instagram absent des logs.
- **MCP** : une URL, un jeton, débit limité, Zod strict, audit ; clé en lecture seule en lot ultérieur.
- **Site public** : pages en cache (Neon peu sollicité), pagination par curseur, recherche bornée, règle de débit, aucun formulaire.
- Pseudos de tiers en base : RGPD relève de l'étude Instagram.

## 8. Schéma cible

```
 Claude Code / Desktop / claude.ai --(HTTPS, Bearer)--+     Visiteurs --(HTTPS)--+
                                                      v                          v
          +--------------- Vercel (1 projet, Fluid compute) -------------------------+
          | apps/web (Next.js 16)                                                    |
          |  /            annuaire paginé + modale R3F                               |
          |  /api/mcp     mcp-handler + withMcpAuth                                  |
          |  /api/cron/*  ingestion, combat quotidien (CRON_SECRET)                  |
          |  packages/db (services + Drizzle)      packages/engine (pur, seedé)      |
          +-----------+-----------------------------------------+--------------------+
                      | DATABASE_URL (par environnement)        | API externe (étudiée ailleurs)
                      v
       Neon : wa-prod | wa-preprod
 Sentry (erreurs) · healthchecks.io (fin de job) · GitHub Actions (CI, dump hebdo -> R2 chiffré)
 Phase 2 : apps/video (Remotion) lit le journal ; rendu Sandbox ou dédié ; sortie -> Blob
```

## 9. Coût mensuel (HT, ordre de grandeur)

| Poste | Hobby | Pro |
|---|---|---|
| Vercel | 0 $ | 20 $ (usage attendu dans le crédit [S]) |
| Neon (2 projets) | 0 $ | 0 à ~5 $ |
| Sentry, healthchecks.io, Actions, R2 | 0 $ | 0 $ |
| Domaine | ~12 €/an | 1ʳᵉ année `.dev` offerte [V] |
| **Total** | **≈ 0 $** | **≈ 20-25 $** |

Variante Supabase Pro ×2 : +50 $. Rendu vidéo non chiffré.

## 10. Questions ouvertes

1. Date probable du premier partenariat (déclenche Pro) ?
2. Domaine : sous-domaine de `pacome.dev` ou dédié ? Nom de la preprod ?
3. La preprod doit-elle rester privée (abonnés du compte perso) ?
4. Taille attendue du journal de combat (Postgres ou Blob) ?
5. OAuth dès la v1 pour l'apprentissage MCP, ou bearer d'abord ?
6. Stocker la version du moteur avec chaque combat (rejouabilité) ?
7. Perte tolérée : un dump hebdo suffit-il pour boss et forçages ?

## 11. Sources

[Hobby](https://vercel.com/docs/plans/hobby) · [Pro](https://vercel.com/docs/plans/pro-plan) · [Fair use](https://vercel.com/docs/limits/fair-use-guidelines) · [Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) · [Schedules](https://vercel.com/docs/schedules/limits) · [Durée](https://vercel.com/docs/functions/configuring-functions/duration) · [Environnements](https://vercel.com/docs/deployments/environments) · [Workflow](https://vercel.com/docs/workflows/pricing) · [Jobs de fond](https://vercel.com/kb/guide/background-workers-on-vercel) · [Monorepos](https://vercel.com/docs/monorepos) · [MCP sur Vercel](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel) · [OAuth MCP](https://vercel.com/i/mcp-server-oauth-authorization) · [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp) · [Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing) · [Rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) · [BotID](https://vercel.com/docs/botid) · [Cloudflare/Vercel](https://vercel.com/kb/guide/cloudflare-with-vercel) · [Neon](https://neon.com/pricing) · [Neon sur Vercel](https://neon.com/docs/guides/vercel-managed-integration) · [MCP Neon](https://neon.com/docs/ai/neon-mcp-server) · [Supabase](https://supabase.com/pricing) · [MCP Supabase](https://supabase.com/docs/guides/getting-started/mcp) · [mcp-handler](https://github.com/vercel/mcp-handler) · [Spec MCP](https://modelcontextprotocol.io/specification/latest/basic/authorization) · [Claude Code MCP](https://code.claude.com/docs/en/mcp) · [Connecteurs](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) · [Remotion](https://www.remotion.dev/docs/vercel) · [R2](https://developers.cloudflare.com/r2/pricing) · ADR du Portfolio (`docs/adr/`).

Limites : plusieurs pages ont été lues via un résumeur automatique. Non vérifiés : version stable exacte de Next.js, CGU commerciales Neon/Supabase, offres WorkOS/Clerk, statut GA de Workflow, performance du moteur à grande échelle.
