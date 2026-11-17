# Configuration pipeline

## Dépôt GitHub
- repo : `plecart/wizard-army-v2`
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

## Stack
- langages : TypeScript
- frameworks : Next.js (App Router) sur Vercel, Drizzle ORM, Postgres Neon
- gestionnaire de paquets : pnpm (monorepo pnpm workspaces, un paquet par domaine — ADR 0001)
- runtime + version : node 24

## Commandes du projet
Lues par `cycle-pr`, `execution-qa` et la génération de CI. `n/a` = étape absente du projet.
- install      : `pnpm install --frozen-lockfile`
- test         : `pnpm -r test` (Vitest)                  # suite complète ; Docker allumé pour `packages/donnees` et `apps/web`
- test ciblé   : `pnpm vitest run <chemin>`   # une seule cible, pour la boucle TDD
- test brut    : n/a                    # sortie du lanceur sans résumeur, si le poste en a un (cycle-pr 3.2)
- lint         : `pnpm biome lint .`
- format       : `pnpm biome format --write .`                  # écrit
- format:check : `pnpm biome format .`                  # vérifie sans écrire
- typecheck    : `pnpm -r typecheck`
- audit        : `pnpm audit --audit-level=high`            # audit des dépendances, porte de CI
- build        : `pnpm -r --if-present run build`   # paquets qui ont un script `build` : `apps/web` (`next build`)
- migration    : `pnpm --filter donnees run migrate`   # applique les migrations à la base de `DATABASE_URL` (shell ou `.env` racine)
- run local    : `pnpm --filter web dev`   # Next.js en développement, sur 127.0.0.1 seulement ; lit le `.env` racine, sans écraser une variable déjà posée

## Qualité
- seuil de couverture : aucun
- règles sensibles à la plateforme : poste Windows, CI Linux — casse des chemins et fins de ligne, vérifiées en CI
- gates bloquants en CI : audit, lint, format:check, typecheck, test
- services requis en CI : Docker, fourni par `ubuntu-latest`, pour la base de test (Postgres 18 jetable que le harnais de `packages/donnees` démarre lui-même, pour sa suite et celle de `apps/web`)

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
  - `balance-check`, avec l'agent `systems-designer` — `donchitos/claude-code-game-studios` @ `abc0de79`, copiés à la main le 2026-11-16 (hors `skills-lock.json`) et adaptés au projet : préambule `yaml-helper.sh` et renvois au framework retirés ; le reste du dépôt, essayé pendant le game design, a été retiré
- Hors dépôt (portée utilisateur, pas dans `.claude/skills/`) : `agent-reach` — programme `uv tool` (vérifier avec `agent-reach version`), son skill lié dans `~/.claude/skills/agent-reach` par `agent-reach setup` ; canaux sans connexion seulement, canal `instagram` non ajouté (attend l'accord du mainteneur, compte Instagram secondaire conseillé)
- Serveurs MCP (hors dépôt ; vérifier avec `claude mcp list`) :
  - `context7` — portée utilisateur
  - `vercel` — `https://mcp.vercel.com`, portée locale ; authentification OAuth à faire par le mainteneur via `/mcp`
- Reportés :
  - MCP Neon — pas encore de compte Neon
  - outils vidéo et son (Remotion, Openverse, earshot, Real SFX…) — phase 2
  - MCP Playwright — plus tard, vérification visuelle du site (étude 02)
- Écartés :
  - `vercel-labs/agent-skills` hors `vercel-react-best-practices` — `deploy-to-vercel` double le MCP Vercel, `web-design-guidelines` recoupe `audit-spec-ui` (étude 02)
  - plugin `vercel/vercel-plugin` — redondant avec le MCP Vercel, télémétrie activée (étude 02)
  - skills R3F / three.js — rien d'officiel, context7 couvre la doc (étude 02)
  - MCP Sentry — aucun trafic à surveiller (étude 02)
