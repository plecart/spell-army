# Wizard Army

Monorepo pnpm, un paquet par domaine sous `packages/` (`docs/adr/0001-architecture-applicative.md`,
« Paquets »).

## Prérequis

- **Node 24**, au moins la version de `.nvmrc` : le plancher d'`engines`, celle que la CI exécute.
- **pnpm par corepack** : `corepack enable` une fois, puis `pnpm` prend la version du champ
  `packageManager` de `package.json`.
- **Docker Desktop allumé** pour les tests de `packages/donnees` et d'`apps/web` : la suite démarre
  elle-même un Postgres 18 jetable, et s'arrête sur une ligne qui le dit quand Docker ne répond pas.

## Commandes

Installation, tests, lint, format, typecheck, audit, build et migration : `.claude/pipeline.config.md`,
section « Commandes du projet ».

## Serveur MCP local

Le serveur MCP (`docs/adr/0005-serveur-mcp.md`) sert sur `/api/mcp` les outils de pilotage, dont
`lire_reglages` et `modifier_reglages`. Le jeton n'entre dans aucun fichier suivi par git, aucune
issue, aucune conversation avec Claude : chaque étape qui le touche se fait dans son propre
terminal.

1. **Migrer la base** de `DATABASE_URL` : `pnpm --filter donnees run migrate`. Les migrations posent
   aussi les réglages de départ du calibrage.
2. **Créer le jeton** : `openssl rand -base64 32`, 44 caractères, au-delà des 32 octets requis. Le
   ranger dans KeePassXC, puis l'écrire soi-même à la ligne `MCP_TOKEN=` du `.env` de la racine
   (gabarit : `.env.example`) : le seul `.env` du dépôt, que le serveur charge par
   `apps/web/next.config.ts`.
3. **Lancer le serveur** : `pnpm --filter web dev`. Il n'écoute que sur ce poste,
   `http://127.0.0.1:3000` par défaut, à l'adresse qu'il affiche.
4. **Brancher Claude Code**, depuis Git Bash à la racine du clone principal, jamais en le demandant à
   Claude : Claude verrait le jeton. `read -rs` le lit sans l'afficher ni l'écrire dans l'historique
   du shell ; `claude mcp add` l'enregistre à la portée locale, celle par défaut, dans
   `~/.claude.json`, hors du dépôt. La portée locale rattache le serveur au dossier où la commande est
   lancée : les sessions d'agents ouvertes dans un worktree n'ont pas besoin de modifier les réglages.
   Jamais `--scope project`, qui l'écrirait dans le `.mcp.json` de la racine, fait pour être commité.

   ```bash
   read -rsp "Jeton MCP : " JETON_MCP; echo
   claude mcp add --transport http wizard-army http://127.0.0.1:3000/api/mcp --header "Authorization: Bearer $JETON_MCP"
   unset JETON_MCP
   ```

5. **Vérifier** : `/mcp` dans Claude Code doit lister `wizard-army` connecté, avec ses deux outils.
