# La session de relecture — une par PR, que le mainteneur peut joindre

Lue par la session PR à son go (`cycle-pr` Étape 1), à chaque passe de 4.2 et à son Étape 8 ; par
la session de relecture à chaque réveil, dans son worktree. C'est la **seule** source de ce
protocole : `cycle-pr` 4.2, `pr-paralleles` étape 3 et `coordinatrice.md` y renvoient sans le
recopier. Ce que la session vérifie et ce qu'elle rend sont dans
`.claude/agents/relecteur.md` ; ce qu'elle partage avec toute session liée — héritage, identité,
messages, nettoyage — dans [sessions-liees.md](sessions-liees.md).

Une session, et non un sous-agent, pour trois raisons : le mainteneur la **joint** dans sa
fenêtre ; ses commandes intégrées, `/code-review` et `/security-review`, closent **son** tour et
non celui de la session PR ; son contexte tient toutes ses passes et la relance.

## Démarrage — par la session PR, au go de son briefing

`start_session` ne part que dans un tour ouvert par le mainteneur, sur sa demande écrite
(`coordinatrice.md`, « Au go du découpage ») : le go du briefing est ce tour, en vague, en lots
comme hors vague, et sa question nomme l'accord de démarrer la session et celui de l'archiver
(`cycle-pr` Étape 1). La session PR la démarre **elle-même** et en est le **parent** : elle reçoit
ses notes de fin de tour et ses messages, et la nettoie. Jamais le lead ni la coordinatrice : un
autre parent serait réveillé à chaque fin de tour de la session de relecture pour rien.

Paramètres de `start_session` : `initiation: user_asked`, `context: fresh`, `use_worktree: true`,
`source_branch` = la branche de la PR, déjà poussée (son amorce suffit), `effort: high`, `model`
omis (Opus, hérité), `title: <préfixe> › relecture` (`sessions-liees.md`, « Identité », une
racine se nomme d'abord). Le brief
nomme la PR, l'issue et sa base, donne le premier geste ci-dessous et renvoie à ce fichier. Mesuré le 2026-10-20 :
`get_session` rend un worktree sous `.claude/worktrees/<slug>`, la branche `claude/<slug>`, la
`sourceBranch` demandée et le parent.

**Premier geste de la session de relecture** :
`git fetch origin && git switch --detach origin/<branche de la PR>` — aucune branche à créer —,
puis les gestes de `pr-paralleles` étape 3, « Provisionner son worktree », pour les piles que le
brief nomme, `hooks` exceptée. Elle ne charge pas `task-observer` et n'écrit aucune entrée au
journal : ses candidates partent dans ses messages de constats. Puis « en attente », et fin de tour.

## Réveil — un message par passe

La session PR **pousse**, puis envoie à chaque passe de 4.2, par `SendMessage` :

```
relis <SHA>, passe <k> — plage <début>..<fin>
```

`<SHA>` est le SHA complet de tête ; `<k>` vaut le rang de la passe — `1`, `2`, … — ou `relance`.
La plage :
`<base>..<SHA>` à la passe 1, `<base>` étant `git merge-base origin/<base de la PR> HEAD` ;
`<SHA de fin de la passe précédente>..<SHA>` aux suivantes ;
`<sha avant>..<sha après>` des commits de correction à la relance. À partir de la passe 2, le
message porte aussi les constats précédents, corrigés (commit, test qui tient la fermeture) ou
écartés (raison) — et pour la relance, ce que chaque commit prétend régler. Plage et SHA arrivent à
chaque réveil, jamais au lancement : la tête bouge entre deux passes.

À chaque réveil, dans cet ordre :

1. Les deux vérifications de `relecteur.md` — où suis-je, puis détachement sur le SHA reçu.
2. `/code-review medium <n> --comment` (`pipeline.config.md`, ligne « relecture » : passé `medium`,
   l'en-tête rendu disait `high`, mesuré le 2026-11-25 sur la PR #70) ; le niveau qu'elle applique se lit dans l'en-tête de son prompt rendu et
   se rapporte dans le message de constats, la commande ne garantissant pas celui qu'on lui
   passe ; aux réveils suivants, le skill n'est pas rendu à nouveau (« already loaded above »,
   mesuré le 2026-10-20), donc le niveau ne se lit plus : se rapporte celui du premier
   rendu. Ses commentaires se relisent sur la PR après écriture (`contraintes.md`, « Écritures
   sur un artefact distant »). Ce qu'elle rapporte à nouveau à la passe 2, sur une PR qu'elle a déjà
   commentée : non mesuré.
3. La passe « restrictions du delta » —
   `python .claude/skills/cycle-pr/scripts/restrictions-du-delta.py <début>`, `<début>` étant
   celui de la plage reçue. Une restriction retirée d'un texte normatif ne fait rougir aucun test :
   le script rend chaque ligne retirée de `.claude/**/*.md`, `CLAUDE.md` ou `CONTRIBUTING.md` qui
   porte une marque restrictive, avec son fichier et sa section. Chaque ligne rendue reçoit sa
   réponse dans le message de constats : restriction déplacée ailleurs — où ; retrait voulu par le
   delta — pourquoi ; sinon, un constat. À chaque réveil, relance comprise, pas seulement à la
   passe finale ; une sortie vide se rapporte en une ligne.
4. `/security-review`, **seulement** si le diff touche une zone sensible ou une surface exposée
   (ligne « sécurité » de la config, qui porte ses préconditions) ; sinon une ligne le dit. Elle
   diffe `origin/HEAD...`, donc le trunk : sur une PR dont la base n'est pas le trunk — une PR de
   lot coordonné —, elle relit aussi ce que la branche d'intégration a déjà reçu, et ses constats hors de la
   plage s'écartent.
5. Le protocole de `relecteur.md` sur la plage — ce qu'une commande vient de trouver n'y est plus
   à chercher.
6. Le message de constats à l'émetteur du réveil — la session PR, ou son relais —, par
   `SendMessage` :
   `constats passe <k> (<SHA court>) — <b> bloquants, <i> importants, <m> mineurs, <v> vides
   relevés`, puis le rapport que `relecteur.md` ordonne, les constats de chaque commande intégrée
   et les observations candidates.

**Une commande intégrée peut clore le tour** — `/code-review` par son outil de rapport,
`/security-review` par « Your final reply must contain the markdown report and nothing else ».
Mesuré le 2026-10-20 : la seconde l'a clos, la première non.
C'est sans coût ici : la session PR, réveillée par la fin de tour sans message de constats,
répond « reprends la passe <k> », et la session de relecture reprend à l'étape suivante, son
contexte intact. La note de fin de tour n'est jamais un constat (`sessions-liees.md`, « Fin de
travail »). Un relais de la session PR, qui n'est pas le parent, ne reçoit pas cette note : il
envoie chaque réveil, et chaque « reprends », avec `notify_when_idle: true` — un avis par
abonnement — et répond « reprends la passe <k> » à l'avis d'inactivité arrivé sans constats
(option de `SendMessage`, lue le 2026-10-20 ; non mesuré). La session sortante, elle, ne répond
plus aux notes de la session de relecture dès sa passation remise : seul le relais relance, sinon
une étape se rejouerait deux fois.

La session de relecture ne démarre aucune session et ne lance d'autre sous-tâche que celles que
`/security-review` prescrit. Elle ne commit pas, ne pousse pas, ne merge pas : un constat se
rapporte. Le mainteneur peut lui parler dans sa fenêtre ; un tour qu'il y pilote ne réveille pas
la session PR (`sessions-liees.md`, « Fin de travail ») : ce qui s'y décide part par message à
l'émetteur du dernier réveil.

## Nettoyage — par la session PR, à son Étape 8

Après la fermeture de la boucle — relance faite, ou dernier constat traité s'il n'y en a pas —, et
jamais avant : tant qu'une relance peut s'ouvrir, la session de relecture en est le destinataire.
L'archivage sur l'accord donné au go, `git worktree remove`, puis l'échafaudage derrière sa porte
d'ancêtre (`sessions-liees.md`, « Nettoyage »), `<source>` étant la branche de la PR — avant que
celle-ci ne soit supprimée. Une branche née de la PR et jamais commitée en est ancêtre quel que
soit le trunk : `git branch -d`, qui compare à `HEAD`, n'est plus en jeu.

## Repli — le sous-agent `relecteur`

Quand la session ne peut pas démarrer — go sans tour du mainteneur, `start_session` refusé —, la
session PR lance le sous-agent `relecteur` (frontmatter de `.claude/agents/relecteur.md`) et joue
elle-même les deux commandes intégrées avant lui : leur fin de tour est alors la sienne, et elle
enchaîne dans le même tour. Un seul sous-agent pour la PR : les passes suivantes et la
relance lui reviennent par `SendMessage`, contexte intact — un agent neuf seulement s'il n'est plus
joignable. Son worktree a trois gestes :

- **Naissance.** Le harnais le crée à l'appel (`isolation: worktree`) depuis `origin/<trunk>` —
  `worktree.baseRef` par défaut, mesuré —, pas sur la tête de la PR : le sous-agent s'y détache
  sur le SHA complet reçu, isolation vérifiée d'abord.
- **Réutilisation.** Le même worktree sert à toutes les passes et à la relance ; à chaque reprise, le
  message rappelle les deux vérifications **dans leur ordre** et ne demande jamais de restaurer
  une mutation avant elles : un agent repris peut reprendre dans l'arbre vivant de la session PR.
- **Retrait — à la fermeture de la boucle**, par la session qui l'a lancé. Le verrou
  (`.git/worktrees/<id>/locked`) ne tient que pendant l'invocation initiale : son absence ne dit
  rien de la vitalité de l'agent. `git worktree remove <chemin>` — `git worktree unlock`
  d'abord s'il refuse —, puis
  `git merge-base --is-ancestor worktree-agent-<id> origin/<trunk> && git branch -D worktree-agent-<id>` :
  la branche naît sur le trunk et ne commite jamais, et `-d` refuse dès que le trunk a avancé.
  Retirer le worktree **termine** l'agent (« This agent cannot be resumed », mesuré), d'où le
  moment.

Si le harness ne permet pas même le sous-agent : la main passe au relecteur humain, avec le diff et
le prompt de `cleanup-verbatim.md` verbatim, noté dans « Relecture indépendante » du body — jamais
de saut silencieux.
