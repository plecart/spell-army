# Étude 02 — Skills et MCP pour la phase 1

Date : 2026-11-11. Lecture des dépôts et docs en ligne le jour même. V = vérifié sur la source ; S = supposé ou tiré d'un agrégateur. Rien n'a été installé ni exécuté.

## Verdicts

| # | Outil | Verdict | Raison |
|---|---|---|---|
| 1 | emilkowalski/skills | **Extraire** `prototype` | `/prototype` existe (en skill) ; les 17 autres visent l'animation UI, hors besoin |
| 2 | petergyang/no-ai-slop | **Écarter** | Édite de la prose, pas du design |
| 3 | leonxlnx/taste-skill | **Écarter** (phase 2 si site vitrine) | Conçu pour sites d'entreprise ; scripts Node et hook Stop lourds |
| 4 | claude-code-game-studios | **Extraire** 3 fichiers | Le reste exige registre, hooks et flux GDD complets |
| 5 | CLI `npx skills` | **Utiliser à la demande** ; `find-skills` écarté | Le CLI suffit ; `find-skills` coûte du contexte permanent |
| 5b | `react-best-practices`, `mcp-builder` | **Installer** | Seuls gains nets (Next.js ; apprentissage MCP) |
| 6 | MCP Vercel | **Installer maintenant** | Objectif d'apprentissage ; officiel, OAuth |
| 6b | MCP Supabase ou Neon | **Installer un seul**, lecture seule | Selon le choix de base |
| 6c | MCP Playwright | **Plus tard** | Vérification visuelle du site |
| 6d | MCP Sentry | **Écarter** | Aucun trafic à surveiller |
| 7 | Plugin Engineering | **Garder 3 skills**, ignorer le reste | Le boilerplate couvre le flux |
| 8 | agent-reach | **Écarter** | Pas de vidéo, session Chrome exposée, Windows non documenté |

## 1. emilkowalski/skills (V)

- 18 skills (animate, review-animations, choreograph, gestures, write-swift, **prototype**, break-ui, ask-sonner…) et deux cheatsheets. MIT, 56 k étoiles, dernier commit 9 nov. 2026.
- **`/prototype` existe**, comme skill avec `disable-model-invocation: true` : il ne se lance que sur demande explicite. Il bâtit 3 à 5 variantes vraiment différentes d'un composant UI derrière un sélecteur, puis intègre la gagnante et supprime l'échafaudage. Environ 1 300 mots, aucun script. Il renvoie à un fichier `PICKER.md` que je n'ai pas lu : vérifier qu'il est livré (S).
- Ne pas le confondre avec le `/prototype` de claude-code-game-studios (jeu jouable dans le navigateur).
- Coût : tout installer = 18 descriptions permanentes ; avec `--skill prototype`, une seule.
- Pas de doublon : `audit-spec-ui` audite une spécification, pas des variantes visuelles.
- Verdict : extraire `prototype`, bon outil pour choisir le look de la pilule avec chapeau.
- Installation : `npx skills@latest add emilkowalski/skills --skill prototype` (commande V ; emplacement des fichiers pour Claude Code : S).

## 2 et 3. no-ai-slop contre taste-skill (V)

**Ils ne se recoupent pas.**
- **no-ai-slop** : un skill (~1 800 mots, 18 motifs d'écriture : contrastes binaires, tirets longs…). 13,4 k étoiles, MIT, dernier commit 2 sept. 2026. Il corrige des **textes**. Le mainteneur le croit sans doute visuel. Utile seulement si les textes générés (sorts, récits) sonnent « IA ».
- **taste-skill** : un skill `design-taste-frontend` v2.5.1, 113 k étoiles, MIT, dernier commit 7 nov. 2026. Il classe l'entreprise, tire palette, polices et héros, vérifie dans Chrome headless, et arme un **hook Stop** qui retient la fin de tâche jusqu'à trois tours. Une douzaine de scripts Node 22+, avec accès réseau (photos, polices, icônes). Cible : pages marketing ; pour un annuaire 3D minimal, c'est un cadre rigide et coûteux.
- Garder : aucun. Contre l'AI slop visuel, mieux vaut `prototype` plus une bible d'art écrite (n° 4).

## 4. claude-code-game-studios (V contenu ; S descriptions)

- 49 agents, 75 skills, 15 hooks. MIT, 38,3 k étoiles, dernier commit 9 nov. 2026. Prévu pour être cloné comme gabarit de projet : surdimensionné, confirmé.
- **Trois fichiers isolables**, agnostiques du moteur de jeu :
  1. agent `economy-designer` : économie, progression, récompenses ; consultant, outils Read/Glob/Grep/Write/Edit.
  2. agent `systems-designer` : formules de combat, courbes, états ; ~1 000 mots.
  3. skill `art-bible` : rédige une bible d'art en 9 sections (identité, forme, couleur, personnages, UI). Le plus utile contre l'AI slop.
- Option : `balance-check` (~200 lignes, détecte valeurs aberrantes et stratégies dégénérées). Sans `design/gdd/` ni registre, il répond « NOT ASSESSED ».
- **Dépendances à couper** : les agents lisent `design/registry/entities.yaml` et `production/session-state/active.md` ; `art-bible` lit `design/gdd/game-concept.md`, un gabarit, `references/lens-art-director.md` et appelle l'agent `art-director`. Il faut copier ces pièces ou retirer les références : quelques minutes de travail manuel.
- Installation (aucune commande officielle) : cloner dans un dossier temporaire, lire, puis copier `.claude/agents/economy-designer.md`, `.claude/agents/systems-designer.md` et `.claude/skills/art-bible/` dans le projet.
- Verdict : extraire ces trois. `systems-designer` et `balance-check` valent le coup si le moteur de combat est un vrai équilibrage numérique (question 2).

## 5. CLI skills et annuaire (V sauf mention)

- `npx skills` : add, find, list, use, check, update, remove, init. Node 22.20+, MIT, 38,9 k étoiles, dernier commit 10 nov. 2026. **Télémétrie anonyme par défaut** : `DISABLE_TELEMETRY=1`.
- `find-skills` : 4,3 M d'installs (rang 1) mais description permanente ; `npx skills find <mot>` fait pareil sans charge.
- **vercel-labs/agent-skills** (MIT, 33,9 k étoiles) : `react-best-practices` (889 k installs), `web-design-guidelines` (849 k), `composition-patterns`, `deploy-to-vercel`, `vercel-optimize`, `react-view-transitions`. Gain net : `react-best-practices`. `deploy-to-vercel` double le MCP ; `web-design-guidelines` recoupe en partie `audit-spec-ui`.
- **anthropics/skills `mcp-builder`** : 4 phases (recherche, implémentation, revue avec MCP Inspector, 10 évaluations) ; TypeScript recommandé (SDK v2) ou Python FastMCP ; références et scripts embarqués. Gain net pour apprendre MCP ; installer.
- **R3F / three.js** (S, agrégateurs non ouverts) : `enzed/r3f-skills`, `freshtechbro/react-three-fiber`, `b-open-io/threejs-r3f`. Rien d'officiel ; context7 couvre la doc : écarter.
- **Drizzle / Postgres** (S) : pas de skill officiel Drizzle ; `supabase/agent-skills` (`supabase-postgres-best-practices`) seulement si Supabase est retenu.
- **Plugin `vercel/vercel-plugin`** (V) : 38 skills, 3 agents, 4 commandes, MCP intégré, télémétrie activée (`VERCEL_PLUGIN_TELEMETRY=off`), 333 étoiles, 58 issues. Redondant avec le MCP : écarter.

## 6. MCP Vercel (V)

- `https://mcp.vercel.com`, distant, OAuth, Streamable HTTP, tous les plans (doc du 15 sept. 2026).
- Capacités : projets, déploiements, journaux et erreurs d'exécution, domaines, variables d'environnement, stockage, pare-feu, analytics web, documentation, CI. Un changelog annonce aussi le déploiement de code (non relu).
- Ajout : `claude mcp add --transport http vercel https://mcp.vercel.com`, puis `/mcp` pour s'authentifier.
- Limites : mêmes droits que votre compte ; accès à accorder équipe par équipe ; liste d'outils variable selon client et équipe ; authentification distincte du CLI. Vercel recommande la confirmation humaine (injection de prompt via les journaux).
- **Autres MCP** :
  - Supabase : `claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<ID>&read_only=true"`. `project_ref` retire les outils de compte.
  - Neon : `npx neon@latest mcp` ou `https://mcp.neon.tech/mcp?readonly=true` ; recommandé pour le développement seulement.
  - Playwright : `claude mcp add playwright npx @playwright/mcp@latest` (39,5 k étoiles) ; son dépôt note que la CLI Playwright consomme moins de tokens.
  - Sentry : `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp/{org}/{projet}` ; inutile pour l'instant.

## 7. Plugin Engineering (S : jugé sur les descriptions)

- **Garder** : `architecture` (ADR pour les choix Vercel, MCP, base), `deploy-checklist`, `code-review`.
- **Doublons du boilerplate** : `documentation` (vers-prd), `testing-strategy` (plan-qa), `system-design` (schema-architecture), `tech-debt` (ponytail-debt).
- **Sans objet en solo** : `standup`, `incident-response`, `debug`.
- **Connecteurs** asana, atlassian, datadog, linear, notion, pagerduty, slack : inutiles, à ne pas autoriser. GitHub est déjà couvert par `gh`.

## 8. agent-reach

- Dépôt Panniantong/Agent-Reach, MIT, ~111 k étoiles, dernier commit 8 nov. 2026 (V). Un paquet PyPI homonyme n'est pas ce projet.
- **Accès Instagram** (V) : canal « experimental », backend **OpenCLI** qui pilote votre **Chrome connecté** via l'extension Browser Bridge et un démon local (port 19825). Agent Reach copie la connexion Instagram de Chrome dans un navigateur dédié et vérifie le cookie `sessionid`. Commandes : recherche d'utilisateur, profil, derniers posts. Le README d'OpenCLI ne cite pas Instagram.
- **Installé** : `uv` (via `irm … | iex` sous Windows), archive GitHub installée par `uv tool install`, `agent-reach setup`, dossier `~/.agent-reach/`, outils par défaut dont yt-dlp (V). **Windows 11 : non documenté** par Agent Reach.
- **Vidéo : non.** Instagram ne renvoie que profils et métadonnées de posts. La transcription (clé Groq ou OpenAI) est décrite pour YouTube et podcasts, pas pour Instagram ; aucune extraction d'images clés. Or les Reels sur le game feel sont de l'animation : le texte ne suffit pas.
- **Risques** : session principale réutilisée (le README conseille un compte secondaire) ; scraping contraire aux conditions d'Instagram, donc risque de restriction du compte (les canaux expérimentaux peuvent casser, dit le dépôt) ; démon et extension qui pilotent un navigateur connecté.
- **Alternative la plus simple** : télécharger à la main 5 à 10 Reels depuis le navigateur du mainteneur, puis `ffmpeg -i reel.mp4 -vf fps=4 img_%03d.png`. Claude lit les images et rédige le mémo ; transcription locale (Whisper) si les Reels sont commentés. `yt-dlp` sur URL publique est possible sans cookies ; avec cookies, utiliser un compte secondaire (le FAQ de yt-dlp avertit d'un risque de bannissement ; des rapports 2026 signalent que l'extracteur Instagram casse parfois, S).
- Verdict : écarter.

## Liste à installer au setup

```bash
# MCP (valider l'OAuth via /mcp ; garder l'approbation manuelle des écritures)
claude mcp add --transport http vercel https://mcp.vercel.com
# Une seule base — exemple Supabase :
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<ID>&read_only=true"

# Skills
export DISABLE_TELEMETRY=1
npx skills@latest add emilkowalski/skills --skill prototype
npx skills add vercel-labs/agent-skills --skill react-best-practices
npx skills add anthropics/skills --skill mcp-builder
npx skills list   # vérifier l'emplacement réel (.claude/skills ou .agents/skills)

# Copie manuelle depuis claude-code-game-studios, après lecture :
#   .claude/agents/economy-designer.md, .claude/agents/systems-designer.md, .claude/skills/art-bible/
```

Plus tard : `claude mcp add playwright npx @playwright/mcp@latest`.

## Questions ouvertes

1. Supabase, Neon ou Vercel Postgres ? Cela fixe le MCP et le skill base de données.
2. Le combat justifie-t-il `systems-designer` et `balance-check` ?
3. `PICKER.md` est-il livré avec `prototype` ?
4. Où `npx skills` installe-t-il les fichiers pour Claude Code sous Windows ?
5. Le MCP Vercel déploie-t-il en production sans confirmation ? À tester avec l'approbation manuelle.
6. Les Reels de @Game_feel_prompts sont-ils visibles sans connexion ?

## Sources

- github.com/emilkowalski/skills (+ `skills/prototype/SKILL.md`)
- github.com/petergyang/no-ai-slop (+ `SKILL.md`)
- github.com/leonxlnx/taste-skill
- github.com/donchitos/claude-code-game-studios (agents `economy-designer`, `systems-designer` ; skills `balance-check`, `art-bible`)
- github.com/vercel-labs/skills ; github.com/vercel-labs/agent-skills ; github.com/vercel/vercel-plugin ; skills.sh
- github.com/anthropics/skills (`mcp-builder`)
- vercel.com/docs/agent-resources/vercel-mcp (+ `/tools`)
- supabase.com/docs/guides/getting-started/mcp ; neon.com/docs/ai/neon-mcp-server ; github.com/microsoft/playwright-mcp ; mcp.sentry.dev
- github.com/Panniantong/agent-reach (README, `docs/install.md`, `channels/instagram.py`) ; github.com/jackwener/OpenCLI
- github.com/yt-dlp/yt-dlp/wiki/FAQ ; recherches web sur R3F, Drizzle, yt-dlp et Instagram (agrégateurs tiers, non vérifiés)
