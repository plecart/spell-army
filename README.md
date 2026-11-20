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

Installation, tests, lint, format, typecheck, audit, build, migration et dérive du schéma :
`.claude/pipeline.config.md`, section « Commandes du projet ».

## Serveur MCP local

Le serveur MCP (`docs/adr/0005-serveur-mcp.md`) sert sur `/api/mcp` les outils de pilotage, dont
`lire_reglages` et `modifier_reglages`. Le jeton n'entre dans aucun fichier suivi par git, aucune
issue, aucune conversation avec Claude : chaque étape qui le touche se fait dans son propre
terminal.

1. **Migrer la base** de `DATABASE_URL` : `pnpm --filter donnees run migrate`. Les migrations posent
   aussi les réglages de départ du calibrage et la réserve de départ des sorts.
2. **Créer le jeton**, dans un terminal ouvert hors de l'app Claude, Git Bash depuis le menu
   Démarrer par exemple : le panneau Terminal de l'app est lisible par Claude.
   `openssl rand -base64 32` donne 44 caractères, au-delà des 32 octets requis. Le ranger dans
   KeePassXC, puis l'écrire soi-même à la ligne `MCP_TOKEN=` du `.env` de la racine (gabarit :
   `.env.example`) : le seul `.env` du dépôt, que le serveur charge par `apps/web/next.config.ts`.
3. **Lancer le serveur** : `pnpm --filter web dev`. Il n'écoute que sur ce poste,
   `http://127.0.0.1:3000` par défaut, à l'adresse qu'il affiche.
4. **Brancher Claude Code**, depuis Git Bash à la racine du clone principal, jamais en le demandant à
   Claude : Claude verrait le jeton. `read -rs` le lit sans l'afficher ni l'écrire dans l'historique
   du shell ; `claude mcp add` l'enregistre à la portée locale, celle par défaut, dans
   `~/.claude.json`, hors du dépôt. La portée locale vaut pour ce dossier et pour les worktrees du
   dépôt : toute session Claude Code du projet, sessions d'agents comprises, voit donc le serveur tant
   qu'il tourne. Mesuré le 2026-11-18 avec Claude Code 2.1.295 : `claude mcp list` le liste depuis
   un worktree du dépôt, et pas depuis un dossier hors du dépôt. Jamais `--scope project`, qui
   l'écrirait dans le `.mcp.json` de la racine, fait pour être commité.

   ```bash
   read -rsp "Jeton MCP : " JETON_MCP; echo
   claude mcp add --transport http wizard-army http://127.0.0.1:3000/api/mcp --header "Authorization: Bearer $JETON_MCP"
   unset JETON_MCP
   ```

   Pour qu'une session Claude ne lise pas le jeton, refuser dans `~/.claude/settings.json` la
   lecture de `~/.claude.json` et de ses copies sous `~/.claude/backups/`, et la commande
   `claude mcp get` (syntaxe des règles : https://code.claude.com/docs/en/permissions, lue le
   2026-11-18) :

   ```json
   "permissions": {
     "deny": ["Read(~/.claude.json)", "Read(~/.claude/backups/**)", "Bash(claude mcp get *)"]
   }
   ```

   Lu dans le binaire de Claude Code 2.1.295 : `claude mcp get` affiche les en-têtes en clair,
   `claude mcp add` les masque (`[REDACTED]`), `claude mcp list` ne les affiche pas. Ces règles
   ferment les lectures habituelles, pas un script qui ouvrirait le fichier.

5. **Vérifier** par `claude mcp list`, qui doit montrer `wizard-army` connecté ; jamais par
   `claude mcp get`, qui afficherait le jeton. Puis, dans une nouvelle session, en CLI ou dans
   l'onglet Code de l'app de bureau, `/mcp` doit lister `wizard-army` connecté, avec ses deux
   outils : une session déjà ouverte ne voit pas un serveur ajouté après son démarrage. Si le
   serveur était éteint au démarrage de la session, « Reconnect » dans `/mcp` une fois le serveur
   lancé.
