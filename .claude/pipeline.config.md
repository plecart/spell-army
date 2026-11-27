# Configuration pipeline

## Dépôt GitHub
- repo : `plecart/spell-army`
- branche trunk : `main`

## Sources de vérité
Ordre de normativité : **en cas de contradiction, le rang le plus haut l'emporte**. Lu par le skill
`contradiction` et par la règle `.claude/rules/decisions-vs-doc.md`.

| Rang | Fichier | Portée | Où s'inscrit un amendement |
|---|---|---|---|
| 1 | `docs/etudes/00-cadrage.md` | décisions du mainteneur (concept, joueurs, combat et calibrage, architecture, modèles 3D, outils), statuts Décidé/Proposé/Ouvert | le tableau ou § concerné, statut mis à jour, date « État au » de l'en-tête mise à jour |
| 2 | `docs/adr/*.md` | décisions techniques détaillant le cadrage : architecture, tâches planifiées, import des abonnés, environnements et sécurité | le § concerné de l'ADR, avec une ligne datée sous « Statut » ; une décision remplacée passe par un nouvel ADR qui le dit |
| 2 | `docs/game-design.md` | règles du jeu détaillant le cadrage : personnage, sorts, monstre, combat, calibrage, saison | le tableau ou § concerné, statut mis à jour, date « État au » de l'en-tête mise à jour |
| 2 | `docs/direction-artistique.md` | direction artistique détaillant le cadrage : style, couleurs, site au MVP, carte de sort, décor et socle, personnages, contrat du fichier 3D | le tableau ou § concerné, statut mis à jour, date « État au » de l'en-tête mise à jour |
| 3 | issues GitHub ouvertes | découpage et planification, **dérivés** des rangs supérieurs | le corps de l'issue, jamais un commentaire — voir `repercussions` |

Les documents de rang 2 ont des portées disjointes : technique pour les ADR, règles du jeu pour le
game design, apparence et contrat des fichiers 3D pour la direction artistique.

**Non normatif :** `docs/etudes/01-*.md` à `08-*.md` — études préparatoires, raisonnement et options écartées ; rien ne s'y décide.

Toute référence croisée cite un **§ ou un titre de section**, jamais un numéro de ligne.

## Documentation dérivée
Sortie d'une commande du dépôt, **jamais une source de vérité** : elle n'entre pas dans la table
des rangs, ne s'édite jamais à la main — toute édition est écrasée à la publication suivante —, et
un écart entre elle et une source n'est jamais une contradiction `decisions-vs-doc`. Lue par
`repercussions` (« Confronter le delta à la documentation dérivée »).

| Documentation | Sources | Commande | Publication |
|---|---|---|---|
| wiki GitHub (`spell-army.wiki.git`) pour les joueurs : quatre pages — l'accueil (`Home`), Personnages (ton personnage, les classes et leurs barres de stats), Sorts (comment marche un sort, les sorts tirables par effet), Combat (le tour de combat et ses règles) —, avec un menu et un pied de page | `docs/etudes/00-cadrage.md` § 1 et § 2 (ligne « Enrôlement ») ; `docs/game-design.md` § 1, § 2, § 4 et annexe A ; classes et plages (`packages/personnages/src/`) ; libellés des classes (`apps/web/app/annuaire/address.ts`) et des stats (`apps/web/app/stat-names.ts`) ; adresse du compte Instagram (`apps/web/app/site.ts`) ; modèle et validation des sorts (`packages/combat/src/`, `apps/web/app/mcp/spell-vocabulary.ts`) ; générateur (`apps/web/scripts/wiki.ts`, `apps/web/scripts/wiki/`), dont le fichier de textes et les deux visuels réservés en PNG ; schéma et lecture de la table `spells`, colonne `description` comprise (`packages/donnees/src/`) ; table `spells` de `spell-army-prod` | `wiki` | `.github/workflows/wiki.yml` : merge sur `main` qui touche une source du dépôt, chaque nuit (pour la table `spells`), à la demande |

## Stack
- langages : TypeScript
- frameworks : Next.js (App Router) sur Vercel, Drizzle ORM, Postgres Neon
- gestionnaire de paquets : pnpm (monorepo pnpm workspaces, un paquet par domaine — ADR 0001)
- runtime + version : node 24
- scripts de la pipeline (`.claude/`) : Python 3.12, tests sous pytest

## Commandes du projet
Lues par `cycle-pr`, `execution-qa` et la génération de CI. `n/a` = étape absente du projet.
- install      : `pnpm install --frozen-lockfile`
- test         : `pnpm -r test` (Vitest)                  # suite complète ; Docker allumé pour `packages/donnees`, `packages/joueurs` et `apps/web`
- test ciblé   : `pnpm vitest run <chemin>`   # une seule cible, pour la boucle TDD
- test brut    : `rtk proxy pnpm -r test`   # sortie du lanceur sans le résumé du hook RTK (« Skills du projet », ligne RTK ; cycle-pr 3.2)
- test-pipeline : `python -m pytest .claude -q`   # tests des scripts de la pipeline (`.claude/tests/`) ; job `pipeline` de la CI
- lint         : `pnpm biome lint .`
- format       : `pnpm biome format --write .`                  # écrit
- format:check : `pnpm biome format .`                  # vérifie sans écrire
- typecheck    : `pnpm -r typecheck`
- audit        : `pnpm audit --audit-level=high`            # audit des dépendances, porte de CI
- build        : `pnpm -r --if-present run build`   # paquets qui ont un script `build` : `apps/web`, qui lance `next build`, puis applique les migrations sur un déploiement de production seulement (`VERCEL_ENV=production`, `scripts/migrer-en-production.ts`)
- migration    : `pnpm --filter donnees run migrate`   # applique les migrations à la base de `DATABASE_URL` (shell ou `.env` racine)
- dérive du schéma : `pnpm --filter donnees run drift`   # sort en 1 quand `drizzle-kit generate` produirait une migration ; laisse alors dans `packages/donnees/migrations` ce qu'il a écrit
- run local    : `pnpm --filter web dev`   # Next.js en développement, sur 127.0.0.1 seulement ; lit le `.env` racine, sans écraser une variable déjà posée
- modèles 3D   : `pnpm --filter personnages modeles`   # Blender 5.3 sur le poste, hors CI
- rendus 3D    : `pnpm --filter personnages rendus`   # Blender 5.3 sur le poste, hors CI
- wiki         : `pnpm --filter web wiki <dossier>`   # écrit les pages du wiki dans un dossier vide ; lit les sorts de la base de `DATABASE_URL`
- validation   : `claude plugin validate .claude --strict`   # sur le poste seulement, par un `releveur`, avant chaque push d'un delta sur `.claude/` ou `CLAUDE.md` ; pas en CI
- relecture    : `/code-review medium <n> --comment`   # `<n>` : numéro de la PR ; passé `medium`, l'en-tête rendu dit high (mesuré le 2026-11-25, PR #70) : le niveau appliqué n'est pas garanti (`cycle-pr/references/session-relecture.md`, « Réveil »)
- restrictions : `python .claude/skills/cycle-pr/scripts/restrictions-du-delta.py <début>`   # passe « restrictions du delta » ; `<début>` : début de la plage relue (`cycle-pr/references/session-relecture.md`, « Réveil »)
- sécurité     : `/security-review`   # seulement si le diff touche une zone sensible ou une surface exposée (« Périmètre »)
- e2e ciblé    : n/a   # aucun outil de navigateur installé, MCP Playwright reporté (« Skills du projet », « Reportés »)
- hooks        : n/a   # aucun hook git dans ce dépôt (relevé le 2026-11-25 : `.git/hooks` du clone ne porte que les exemples de git)

## Qualité
- seuil de couverture : aucun
- règles sensibles à la plateforme : poste Windows, CI Linux — casse des chemins et fins de ligne, vérifiées en CI
- pièges du poste, lus par les rôles et les scripts de la pipeline :
  - sortie Python en cp1252 : Python écrit un tube dans la page de code du poste, et un texte accentué arrive illisible. Les scripts de la pipeline écrivent donc leur sortie standard en UTF-8, et une commande Python lancée à la main prend `PYTHONIOENCODING=utf-8`. Mesuré le 2026-11-24 : `python -c "import sys;print(sys.stdout.encoding)" | cat` rend `cp1252`, et « en-tête » arrive avec l'octet `0xEA`
  - heredoc de l'outil Bash et antislashs : un fichier écrit par `cat <<'EOF'` depuis l'outil Bash arrive avec ses antislashs divisés par deux. Ce n'est pas propre au heredoc : deux antislashs à la suite dans le texte d'une commande arrivent en un seul, y compris dans un argument entre apostrophes (mesuré le 2026-11-24 par `printf '%s'` et `python -c` ; cause, outil Bash ou hook RTK, non isolée). Un fichier qui doit porter un échappement se construit par programme (`chr(92)`), puis se recompte après écriture. Mesuré le 2026-11-24 : deux antislashs écrits à la suite, un seul arrivé
  - `<rev>:<chemin>` : relevé dans le projet d'origine de la pipeline, où `git show main:<chemin>` rendait zéro octet en sortant en 0. Non reproduit ici le 2026-11-24 : `git show origin/main:CLAUDE.md` rend 13 566 octets, autant que `git cat-file -s`. Une sortie vide se recoupe par `git cat-file -s` avant de valoir absence
- gates bloquants en CI : audit, lint, format:check, typecheck, dérive du schéma, test, test-pipeline
- services requis en CI : Docker, fourni par `ubuntu-latest`, pour la base de test (Postgres 18 jetable que le harnais de `packages/donnees` démarre lui-même, pour sa suite et celles de `packages/joueurs` et d'`apps/web`)

## Périmètre
- domaines (nom métier → chemin) — servent aussi de thèmes/milestones à `triage` (chemins prévus, confirmés à la première PR de code) :
  - Joueurs : `packages/joueurs/` (import des abonnés)
  - Personnages : `packages/personnages/` (personnages calculés depuis le seed, modèles 3D)
  - Combat : `packages/combat/` (moteur de combat, monstre du jour, calibrage)
  - Pilotage : `apps/web/app/mcp/` (serveur MCP, remplace le back-office)
  - Site : `apps/web/` (site public)
  - Vidéo : `apps/video/` (phase 2)
  - Infrastructure : `packages/donnees/` (Drizzle, migrations), `.github/`, configuration Vercel
- zones sensibles (arrêt humain — cadence dans `.claude/rules/contraintes.md`) : authentification du serveur MCP ; secrets (clé du fournisseur d'abonnés, jeton MCP, mots de passe des comptes, codes de récupération) ; migrations de base ; import des joueurs ; écrans à valider visuellement
- secrets — convention du projet (`docs/etudes/00-cadrage.md` § 2, « Architecture », ligne « Secrets ») : tout secret vit dans KeePassXC, qui fait référence. Le mainteneur les crée, les range et les saisit lui-même (réglages Vercel, `/mcp`, fichier `.env` local, exclu par `.gitignore` hors `.env.example`). Aucun secret dans un fichier suivi par git, une issue ou une conversation ; une session ne demande jamais d'en coller un.
- hors périmètre : back-office web (remplacé par le serveur MCP) ; gestion des désabonnés ; Redis ou tout service auto-hébergé ; règle du jeu dans une fonction propre à Vercel
- surfaces exposées — ce que la QA a le droit de vérifier ; ne lister que ce qui existe :
  interface web (site public), serveur MCP (API HTTP), persistance (Postgres), traitements asynchrones (tâches planifiées d'import et de combat), fichiers produits (vidéos, phase 2)
- surfaces visibles par un utilisateur : interface web ; vidéos (phase 2)

## Langue
- skills / issues / PRD / descriptions : français
- identifiants du code : anglais
- commentaires / docstrings / noms de tests : français
- préfixe conventional commit : anglais (feat/fix/chore/docs/refactor)

## Mapping labels (rôle canonique → label GitHub)
- bug → `bug`
- enhancement → `enhancement`
- needs-triage → `needs-triage`
- needs-info → `needs-info`
- needs-interrogation → `needs-interrogation`
- ready-for-agent → `ready-for-agent`
- ready-for-human → `ready-for-human`
- wontfix → `wontfix`
- qa-plan → `qa-plan`
- qa-finding → `qa-finding`
- prd → `prd`   # label de nature (document parent) — hors machine à états, ni rôle d'état ni thème
- documentation → `documentation`   # label de nature (PR `docs(…)` sans issue liée) — hors machine à états

**Métadonnées d'une PR** — posées à l'Étape 2 de `cycle-pr`, vérifiées à l'Étape 5, corrigées
avant la sortie du draft si elles dévient. Toute PR qui n'est pas l'œuvre d'un bot porte :
- **assignee** : son auteur ;
- **un** label de catégorie : celui de l'issue qu'elle ferme ; sans issue, dérivé du type
  conventional commit — `feat` / `chore` / `refactor` / `ci` → `enhancement`, `fix` → `bug`,
  `docs` → `documentation` ;
- **le milestone** du domaine de ses fichiers (section « Périmètre »).

## Skills du projet
- Maison : `init-projet`, `vers-prd`, `vers-issues`, `triage`, `interroge-moi`, `cycle-pr`, `contradiction`, `repercussions`, `pr-paralleles`, `plan-qa`, `execution-qa`, `bug-vers-issue`, `audit-spec-ui`, `schema-architecture`
- Embarqués : `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`, `task-observer`
- Publics (étape 9 au 2026-11-11 ; liste fixée par `docs/etudes/00-cadrage.md` § 2 « Outils », sans passe `claude-code-setup` ; copiés par `npx skills add … --agent claude-code --copy`, sources et empreintes dans `skills-lock.json`, vérifier avec `npx skills list`) :
  - `prototype` — `emilkowalski/skills` ; ne se lance que sur `/prototype` (direction artistique)
  - `design-taste-frontend` — `leonxlnx/taste-skill` ; arme un hook Stop (`scripts/gate.mjs`, Node) quand il est invoqué ; **non versionné** (38 Mo d'assets, exclu par `.gitignore`) : sur un autre poste, le réinstaller par `npx skills experimental_install`, qui lit `skills-lock.json`
  - `no-ai-slop` — `petergyang/no-ai-slop` ; relit la prose (textes de sorts, récits)
  - `vercel-react-best-practices` — `vercel-labs/agent-skills`
  - `mcp-builder` — `anthropics/skills`
  - `find-skills` — `vercel-labs/skills`
  - `information-architecture` — `owl-listener/designer-skills` ; cadre la refonte du wiki du jeu : plan du site, pages orphelines, modèle de navigation, intitulés. Renvoie à `navigation-patterns` et `card-sort-analysis`, non installés
  - `writing-documentation-with-diataxis` — `sammcj/agentic-coding` (rangé chez l'auteur sous `Skills_disabled/`) ; cadre la refonte du wiki du jeu : classe chaque page en tutoriel, guide pratique, référence ou explication. Sa consigne « British English » ne vaut pas ici : le wiki s'écrit en français, comme le reste du projet (« Langue »). Se déclenche aussi seul sur une relecture de doc : ne remplace pas `audit-spec-ui` pour un document normatif
  - `balance-check`, avec l'agent `systems-designer` — `donchitos/claude-code-game-studios` @ `abc0de79`, copiés à la main le 2026-11-16 (hors `skills-lock.json`) et adaptés au projet : préambule `yaml-helper.sh` et renvois au framework retirés ; le reste du dépôt, essayé pendant le game design, a été retiré
- Hors dépôt (portée utilisateur, pas dans `.claude/skills/`) : `agent-reach` — programme `uv tool` (vérifier avec `agent-reach version`), son skill lié dans `~/.claude/skills/agent-reach` par `agent-reach setup` ; canaux sans connexion seulement, canal `instagram` non ajouté (attend l'accord du mainteneur, compte Instagram secondaire conseillé)
- RTK (hors dépôt, réglé sur le poste ; instructions dans `~/.claude/RTK.md`) : un hook réécrit les commandes de l'outil Bash (`grep` devient `rtk grep`) et résume leur sortie. La sortie brute se lit par `rtk proxy <commande>`. Une commande que la prose fait taper à un rôle se rejoue sous le hook avant d'être épinglée (`cycle-pr/references/tests.md`, « Frontières tierces : on vérifie, on ne suppose pas »). Mesures datées : réécriture de `grep` observée le 2026-11-24 ; sortie de `rtk grep` tronquée qui cachait une case, relevée dans le projet d'origine de la pipeline (`plan-qa`, « Passe comptable », 2026-11-03)
- Serveurs MCP (hors dépôt ; vérifier avec `claude mcp list`) :
  - `context7` — portée utilisateur
  - `vercel` — `https://mcp.vercel.com`, portée locale ; authentification OAuth à faire par le mainteneur via `/mcp`
  - `neon` — `https://mcp.neon.tech/mcp?readonly=true`, lecture seule ; seule entrée Neon qui sert — le connecteur `claude.ai Neon`, en écriture, ne sert pas (ADR 0004, « Accès de Claude à Neon »)
- Reportés :
  - outils vidéo et son (Remotion, Openverse, earshot, Real SFX…) — phase 2
  - MCP Playwright — plus tard, vérification visuelle du site (étude 02)
- Écartés :
  - `vercel-labs/agent-skills` hors `vercel-react-best-practices` — `deploy-to-vercel` double le MCP Vercel, `web-design-guidelines` recoupe `audit-spec-ui` (étude 02)
  - plugin `vercel/vercel-plugin` — redondant avec le MCP Vercel, télémétrie activée (étude 02)
  - skills R3F / three.js — rien d'officiel, context7 couvre la doc (étude 02)
  - MCP Sentry — aucun trafic à surveiller (étude 02)
