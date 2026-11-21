# Wizard Army

Monorepo pnpm, un paquet par domaine sous `packages/` (`docs/adr/0001-architecture-applicative.md`,
« Paquets »).

## Prérequis

- **Node 24**, au moins la version de `.nvmrc` : le plancher d'`engines`, celle que la CI exécute.
- **pnpm par corepack** : `corepack enable` une fois, puis `pnpm` prend la version du champ
  `packageManager` de `package.json`.
- **Docker Desktop allumé** pour les tests de `packages/donnees`, `packages/joueurs` et `apps/web` :
  la suite démarre elle-même un Postgres 18 jetable, et s'arrête sur une ligne qui le dit quand
  Docker ne répond pas.

## Commandes

Installation, tests, lint, format, typecheck, audit, build, migration et dérive du schéma :
`.claude/pipeline.config.md`, section « Commandes du projet ».

## Serveur MCP local

Le serveur MCP (`docs/adr/0005-serveur-mcp.md`) sert sur `/api/mcp` les outils de pilotage :
`lire_reglages` et `modifier_reglages` pour le calibrage ; `lister_sorts`, `ajouter_sort` et
`modifier_sort` pour la réserve de sorts, dont l'image se donne en base64 à `modifier_sort` (PNG,
JPEG ou WebP, au moins 1 200 × 900 px, au plus 3 000 000 octets) ; `deposer_fichier_3d` et
`regler_modele_classe` pour les fichiers 3D des classes et des monstres et le modèle par défaut de
chaque classe, que suivent les joueurs de la classe restés sur l'ancien défaut ; `lister_passes` et
`relancer_passe` pour l'import des abonnés : le journal des passes, et une passe rapide ou complète
relancée sous le verrou de l'import, qui lit la liste chez HikerAPI avec `HIKERAPI_ACCESS_KEY` et
`INSTAGRAM_ACCOUNT_ID` (gabarit : `.env.example`) et répond « passe en cours » si une passe tourne
déjà. Le jeton n'entre dans aucun fichier suivi par git, aucune issue, aucune conversation
avec Claude : chaque étape qui le touche se fait dans son propre terminal.

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
   l'onglet Code de l'app de bureau, `/mcp` doit lister `wizard-army` connecté, avec ses outils :
   une session déjà ouverte ne voit pas un serveur ajouté après son démarrage. Si le serveur était
   éteint au démarrage de la session, « Reconnect » dans `/mcp` une fois le serveur lancé.

### Déposer un fichier 3D

Un fichier 3D ne passe jamais par Claude : une commande du dépôt le lit sur le poste et l'envoie
elle-même à `deposer_fichier_3d`. Prérequis :

- le dépôt cloné, et `pnpm install` lancé à sa racine ;
- dans le `.env` de la racine (gabarit : `.env.example`), `MCP_URL`, l'adresse du serveur MCP
  visé, local (`http://127.0.0.1:3000/api/mcp`, lancé à l'étape 3) ou déployé, et `MCP_TOKEN`, le
  jeton de ce serveur. Le jeton s'écrit à la main, hors de Claude, comme à l'étape 2. Le serveur
  local lit le même `MCP_TOKEN` : viser le serveur déployé change aussi le jeton qu'il attend.

Puis, depuis le clone, le chemin du fichier se lisant depuis le dossier où la commande est lancée :

```bash
pnpm --filter web deposer-3d chemin/du/magicien.glb --classe magicien
pnpm --filter web deposer-3d chemin/de/la/limace.glb --monstre limace
```

La commande vérifie d'abord le fichier contre le contrat du fichier 3D (direction artistique § 7) :
un fichier non conforme est arrêté avec ses écarts, un par ligne, sans rien envoyer. Sinon, elle
l'envoie et affiche l'identifiant du fichier rangé, que `regler_modele_classe` prend pour en faire
le modèle par défaut de sa classe. Les classes portent leur nom d'outil, comme dans `ajouter_sort` :
`magicien`, `golem`, `guerrier`, `nain`, `vampire`, `druide`, `paysan`, `fee`. Sortie 0 sur un
dépôt, 1 sur un refus, dont elle affiche la raison.

## Tic de l'import

Le tic horaire de l'import (`docs/adr/0002-taches-planifiees-et-auto-reparation.md`) est servi sur
`POST /api/tic`, qu'appellent Vercel Schedules et le filet GitHub Actions avec l'en-tête
`Authorization: Bearer <CRON_SECRET>`. Sous le verrou de l'import, il fait la suite d'une passe
complète interrompue, la passe rapide, puis le départ d'une passe complète quand elle est due ; il
ne lance aucun combat. Il lit la base de `DATABASE_URL` et la liste des abonnés chez HikerAPI, avec
`HIKERAPI_ACCESS_KEY` et `INSTAGRAM_ACCOUNT_ID` (gabarit : `.env.example`).

Ses réponses :

- `401`, `WWW-Authenticate: Bearer` et un corps vide : l'en-tête manque ou ne porte pas le secret,
  ou `CRON_SECRET` manque ou fait moins de 32 octets. Rien n'est lu, ni la base ni le fournisseur.
- `200`, `{ "passes": […], "erreur_nombre_abonnes": null }` : les passes que le tic a fait tourner,
  sous les champs de `lister_passes`.
- `500` et le même corps : une passe s'est close en erreur, ou la lecture du nombre d'abonnés a
  échoué, son erreur dans `erreur_nombre_abonnes`.
- `200`, `{ "message": "passe en cours : ce tic n'a rien fait" }` : une autre passe tient le verrou.
- `500`, `{ "message": … }` au texte fixe : « configuration de l'import incomplète », la clé ou le
  compte manque ou est invalide, et aucune passe ne part ; ou « tic interrompu par une erreur ». La
  cause est au journal du serveur, jamais dans la réponse.

`CRON_SECRET` se crée comme le jeton MCP, à l'étape 2 de « Serveur MCP local » :
`openssl rand -base64 32` dans un terminal hors de l'app Claude, rangé dans KeePassXC, puis saisi à
la main dans les réglages Vercel et dans les secrets GitHub Actions du filet (ADR 0004, « Saisie »).

## Fabriquer les modèles 3D

Le fichier 3D de chaque classe (direction artistique § 7) se fabrique dans Blender, lancé sans
fenêtre, par le code Python de `packages/personnages/blender/` : l'atelier commun, `workshop.py`,
les pièces communes aux classes portées du prototype `annuaire-bd.html`, `annuaire.py`, puis un
fichier par classe, `classes/<classe>.py`, nommé par sa clé : `wizard`, `golem`, `warrior`,
`dwarf`, `vampire`, `druid`, `peasant`, `fairy`. Prérequis : **Blender 5.3** sur le
poste, que les commandes trouvent par la variable `BLENDER`, le chemin de `blender.exe`, écrite
dans le `.env` de la racine (gabarit : `.env.example`), sinon par `blender` dans le `PATH`.

```bash
pnpm --filter personnages modeles wizard
pnpm --filter personnages rendus wizard
```

Sans classe nommée, chaque commande les prend toutes ; une clé inconnue est refusée.

- `modeles` écrit `packages/personnages/out/modeles/<classe>.glb`, puis juge chaque fichier contre
  le contrat du fichier 3D : un écart arrête la commande, sortie 1, avec les écarts de chaque
  fichier. Une classe sans fichier Python l'arrête aussi, avant toute fabrication.
- `rendus` part de ces GLB, à fabriquer d'abord : par classe, le personnage sur son socle, devant
  son décor, en `packages/personnages/out/rendus/<classe>.png`, puis toutes les classes rendues en
  grille de 4 × 2 dans `planche.png`.

Un GLB conforme se dépose ensuite par `deposer-3d` (« Déposer un fichier 3D », ci-dessus), sous le
nom d'outil de sa classe :
`pnpm --filter web deposer-3d packages/personnages/out/modeles/wizard.glb --classe magicien`. Ces
commandes ne tournent pas en CI, où Blender n'est pas installé.
