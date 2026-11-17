# Wizard Army

Monorepo pnpm, un paquet par domaine sous `packages/` (`docs/adr/0001-architecture-applicative.md`,
« Paquets »).

## Prérequis

- **Node 24**, la version de `.nvmrc`.
- **pnpm par corepack** : `corepack enable` une fois, puis `pnpm` prend la version du champ
  `packageManager` de `package.json`.
- **Docker Desktop allumé** pour les tests de `packages/donnees` : la suite démarre elle-même un
  Postgres 18 jetable, et s'arrête sur une ligne qui le dit quand Docker ne répond pas.

## Commandes

Installation, tests, lint, format, typecheck, audit, build et migration : `.claude/pipeline.config.md`,
section « Commandes du projet ».
