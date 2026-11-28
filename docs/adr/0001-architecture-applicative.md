# ADR 0001 — Architecture applicative : Next.js sur Vercel, MCP intégré, Neon, paquets par domaine

- **Statut** : accepté le 2026-11-15. Précisé le 2026-11-21 : `packages/joueurs` dépend aussi de
  `personnages` (§ « Paquets », issue #13). Précisé le 2026-11-25 : projets Neon `spell-army-preprod`
  et `spell-army-prod`, renommés avec le jeu (#57). Précisé le 2026-11-27 : un seul projet Neon,
  une branche par environnement, et un seul projet Vercel (lignes « Base » et « Hébergement », #22). Précisé le 2026-11-28 : le projet Neon s'appelle `spell-army` (ligne « Base », #22).
- **Source** : `docs/etudes/00-cadrage.md` § 2 « Architecture » ; étude `04-architecture.md`

## Contexte

Le jeu a besoin d'un site public, d'un outil de pilotage pour le mainteneur et de tâches de fond
(import des abonnés, combat quotidien). Le projet est amateur. Sa devise est « rapide et efficace »,
et il sert à apprendre MCP et Vercel. Le mainteneur veut un code aussi décomposé et modulaire que
possible, « pour y voir clair ».

## Décisions

| Sujet | Décision | Origine |
|---|---|---|
| Hébergement | Next.js (App Router) sur Vercel. Une même application porte le site, le serveur MCP et la route des tâches planifiées. Un seul projet Vercel porte la prod et la pré-prod (ADR 0004). | Décidé (cadrage) |
| Plan Vercel | Hobby tant qu'on n'est pas bloqué, puis Pro. Pro au plus tard au premier partenariat rémunéré, car Hobby est réservé à l'usage personnel et non commercial. | Décidé (cadrage) |
| Back-office | Aucun. Un serveur MCP le remplace : il est servi par l'application à `/api/mcp` et piloté depuis Claude. | Décidé (cadrage) |
| Base | Neon (Postgres), un seul projet (`spell-army`) : sa branche par défaut porte la prod, sa branche `preprod` la pré-prod ; accès par Drizzle. | Décidé (cadrage) |
| Région | Neon à Francfort (`aws-eu-central-1`). Les fonctions Vercel sont fixées en `fra1` par `"regions": ["fra1"]` dans `vercel.json`, au lieu de `iad1` par défaut. | Accepté le 2026-11-15 |
| Découpage | Un monorepo pnpm avec un paquet par domaine, aux chemins de `.claude/pipeline.config.md` § « Périmètre » (détail ci-dessous). | Accepté le 2026-11-15 |
| Services partagés | Chaque paquet de domaine expose ses services. Les outils MCP, la route des tâches et les pages les appellent ; il n'y a pas d'autre chemin d'écriture, ni de REST d'administration. Un outil MCP reste un adaptateur mince : validation Zod, journal d'audit, appel d'un service. | Accepté le 2026-11-15 |
| Portabilité | Aucune règle du jeu dans du code propre à Vercel. Le code Vercel tient dans `apps/web` : routes, `vercel.json`, configuration des tâches. Pas de Vercel Workflows au départ. | Accepté le 2026-11-15 |
| File d'attente | Ni Redis ni service auto-hébergé : la base note où un traitement s'est arrêté (ADR 0002). | Accepté le 2026-11-15 |

### Paquets

| Paquet | Rôle | Dépend de |
|---|---|---|
| `packages/combat` | Moteur de combat pur et déterministe, sans E/S | — |
| `packages/personnages` | Personnage calculé à partir de l'identifiant Instagram (seed), sans E/S | — |
| `packages/donnees` | Schéma Drizzle, migrations, client de base | — |
| `packages/joueurs` | Import des abonnés : interface fournisseur, passes, journal (ADR 0003) | `donnees`, `personnages` |
| `apps/web` | Site public, serveur MCP (`app/mcp/`), route des tâches | tous |

Les dépendances vont toujours vers un paquet pur ou vers `donnees`, jamais en sens inverse, et aucun
cycle n'est permis. Le paquet d'affichage 3D, commun au site et à la vidéo, n'est créé qu'en phase 2,
à l'arrivée de `apps/video`. Turborepo n'est ajouté que si les builds le demandent.

## Conséquences

- Les deux paquets purs se testent sans base ni réseau. Le combat est rejouable : à seed égal, le
  résultat est le même.
- Pour quitter Vercel, on réécrit `apps/web` et la planification ; les paquets ne bougent pas.
- Chez Neon, la région ne se change pas après création. Le projet vide `my-first-project`, créé
  d'office à Francfort en Postgres 18, est renommé `spell-army-preprod`, et `spell-army-prod` est
  créé dans la même région. Le mainteneur le fait dans la console Neon. Le 2026-11-27,
  `spell-army-preprod` est supprimé : la pré-prod devient la branche `preprod` de
  `spell-army-prod`, renommé `spell-army` le 2026-11-28 (#22).
- Sur Hobby, une seule région de fonctions est permise : ce sera `fra1`.

## Vérifié

- Région par défaut `iad1`, une seule région sur Hobby, réglage `regions` dans `vercel.json` :
  [Configuring regions](https://vercel.com/docs/functions/configuring-functions/region), page mise à
  jour le 2026-08-11, lue le 2026-11-15.
- Hobby réservé à l'usage personnel et non commercial :
  [Hobby plan](https://vercel.com/docs/plans/hobby), mise à jour le 2026-09-14, lue le 2026-11-11.
- Région Neon non modifiable, existence de `my-first-project` : rapport de la session de création des
  comptes, 2026-11-15, non recontrôlé ici.

## Non établi

- Les limites du plan Free de Neon s'appliquent-elles par organisation ou par compte ?
- Le nom d'une team Vercel ou d'une organisation Neon peut-il changer après coup ?
