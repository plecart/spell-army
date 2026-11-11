# Règle — Taille et format des PR

## Découpage
Règle d'une étude du 2026-10-29 (relevé d'origine non joint au seed).

1. **Un sujet = une issue = une PR, sans limite de lignes ni de fichiers.** Des morceaux forment
   un seul sujet s'ils partagent une décision, ou s'ils ne se valident qu'ensemble, ou s'ils
   changent le même contrat. Partager un fichier ne compte pas.
2. **Plancher.** Un sujet estimé sous ~300 lignes entre comme critère dans l'issue voisine du même
   domaine, si elle est prête en même temps, sous deux gardes : (a) il n'y apporte aucune décision
   ouverte ; (b) il en ressort si l'hôte se bloque. Le correctif évident (voie courte de
   `cycle-pr`) et l'urgence restent hors plancher. Il se décide à l'écriture de l'issue, par
   `vers-issues` et `triage`.
3. **Une seule règle pour découper**, en issues comme en lots. Le motif s'écrit au brief avec son
   coût : ≈ 30 M de tokens et 5 à 8 contacts du mainteneur par PR de plus.
   - Deux sujets → deux issues.
   - Un sujet avec un motif → un lot léger. Les motifs : une dépendance de mise en service, une
     relecture d'une autre nature ou un risque distinct, un parallélisme dont le gain est nommé.
4. **Lot léger** : des PR successives vers `main`, sans coordinatrice ni branche d'intégration
   (`cycle-pr` Étape 2, « Cas découpé »). Une coordinatrice seulement contre une surface visible à
   moitié livrée, ou une règle de pipeline à moitié appliquée pendant une vague
   (`cycle-pr/references/coordinatrice.md`).
5. **La taille organise la PR, elle ne la découpe pas.**
   - On estime en blocs : ≈ 650 lignes ou ≈ 350 K de contexte de `developpeur` chacun (`cycle-pr`
     Étape 1, « Estimation »).
   - Chaque bloc a sa passe de relecture, puis vient la passe finale. Une passe s'ajoute si la
     dernière trouve encore un bloquant ou un important (`cycle-pr` Étape 4).
   - Le `developpeur` rend le chiffre de `git diff --stat <base>...HEAD` avec chaque commit, la base
     de son brief (`cycle-pr` 3.5). Un dépassement tient en une ligne de Notes. Seul le
     **périmètre** rouvre le découpage.
6. **Au-delà de ~3 blocs estimés**, le briefing dit pourquoi c'est un seul sujet, avec le coût des
   deux voies, et le mainteneur tranche au go.
7. **À chaque frontière de bloc, la session lit sa fenêtre** — la part de son contexte déjà
   consommée. Si un relais s'annonce, elle rejoue le test du point 1 : deux sujets, elle coupe en
   lot léger ; un seul, elle relaie (`cycle-pr` Étape 8, « Relais en cours de cycle »).
8. **Réfutable.** Une ligne « échappements » entre au bilan de chaque cycle (`cycle-pr` Étape 8,
   « Bilan chiffré du cycle »), et la règle se revoit au bilan de la deuxième vague, puis à
   chaque bilan suivant tant que l'échantillon compte moins de 3 PR de plus de 1 500 lignes
   (`pr-paralleles` Étape 8, « Bilan de vague »).

## Format des messages
- **Commits et titre de PR** au format conventional commit : `type(scope): description`.
  - Types : `feat` `fix` `chore` `docs` `refactor` `test` `ci`.
  - **Préfixe en anglais, description en français.** Ex : `feat(auth): ajoute la connexion par e-mail`.
  - Breaking change : `!` dans le titre (`feat!: …`), pas de footer.
- Message de commit = **titre seul**. Pas de corps, pas de footer, pas de `Co-Authored-By`,
  pas de préfixe de phase ni de numéro de PR (traçables via l'outil de suivi).
- **Aucune ligne d'attribution**, ni `Co-Authored-By` dans un commit ni pied « Generated with … »
  dans un body de PR : `attribution.commit` et `attribution.pr` valent `""` dans
  `.claude/settings.json`.
- **Exception : les commits et PR d'un bot de dépendances** (Dependabot, Renovate…). Seul le
  préfixe conventional est tenu, réglé dans la configuration du bot (`chore(deps)`,
  `chore(deps-dev)`) ; la description et le corps viennent du bot — en anglais pour Dependabot,
  qui ne sait pas les écrire autrement. Même exemption que pour les métadonnées de PR
  (`.claude/pipeline.config.md`, « Métadonnées d'une PR »).
- **Refuser une PR de bot sans laisser d'état hors du dépôt.** Jamais de fermeture à la main ni
  de commande `@dependabot ignore …` : l'une et l'autre mémorisent un refus côté forge, invisible,
  et la seconde bloque aussi les mises à jour de sécurité. Le refus s'écrit en règle `ignore` du
  fichier de configuration du bot — raison et condition de réexamen en commentaire, liste figée
  par un test — et un second test lit la cause du refus là où elle vit (verrou, plage de pairs)
  avec l'analyseur de l'écosystème, puis rougit le jour où elle tombe, vu rouge par mutation. Le
  bot ferme ses PR de lui-même au push de la configuration : le constater, puis commenter chacune
  en citant le commit.

## Branches
- Trunk-based depuis `main` : `git checkout -b <type>/<description>`, **derrière la porte de
  fraîcheur** de `cycle-pr` Étape 1, qui chaîne deux prédicats `git merge-base --is-ancestor` (une
  par direction) à la création. La commande nue crée la branche sur le `main` qu'elle trouve, à
  jour ou non.
- Une session démarrée par une autre, dans un worktree de l'application, crée la sienne par le
  premier geste de `.claude/skills/cycle-pr/references/sessions-liees.md`, depuis le distant : la
  porte vaut pour une branche créée sur `main`.
