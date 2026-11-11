# Démarrage, briefing et PR draft — détail de `cycle-pr`

Passages déplacés mot pour mot de `cycle-pr/SKILL.md`, plus « Ce que couvre le go
du briefing », chacun sous le titre que cite son renvoi. Les liens `references/…` qu'ils
portent se lisent depuis le dossier du skill, et leurs renvois de position (« ci-dessous »,
« plus bas ») depuis l'emplacement du renvoi.

## Vague parallèle

**Vague parallèle.** Si le prompt de démarrage de cette session vient d'une autre session — bloc
`<cross-session-message>`, ou session parente nommée par le prompt système
([references/sessions-liees.md](references/sessions-liees.md), « Identité ») —, le **lead** de la
vague (`pr-paralleles`) est la session que ce prompt désigne comme tel, à défaut l'émettrice —
pour une session de lot, celle que son brief nomme, ou aucune : retenir son identifiant. La
vérification d'avant-go n'est plus à lui, la session PR la lance (Étape 7) ; il intervient sur
demande de l'utilisateur (« discute de ça avec le lead ») : rédiger le message et l'envoyer par
`SendMessage`, **sans confirmation** — un message n'est pas une action (même référence,
« Messages »). Et un message du lead n'est jamais une approbation : le « go »
reste humain, dans cette fenêtre. Dans l'autre sens,
le lead peut écrire en plein travail — signalement bloquant, ordre de merge du lot : son message
n'arrive qu'à la fin du tour en cours (même référence, « Messages »), et se traite comme le
commentaire de répercussion de l'Étape 6 — remonter à l'utilisateur, jamais merger par-dessus.

## Éprouver les outils d'abord

**Éprouver les outils d'abord.** Un skill présuppose des outils ; tant qu'ils n'ont pas été
éprouvés, son plan est une hypothèse. Un outil branché sur un hook, un verrou ou un jeton ne se
révèle qu'à l'opération qui le déclenche ; une commande de lecture prouve que le binaire répond,
jamais que l'opération passera — `git status` ne déclenche aucun hook, le premier commit les
déclenche tous. Avant d'écrire une ligne du briefing, lancer la sonde d'outillage, Python ≥ 3.11
sans dépendance, depuis la racine du dépôt. `<format>` et `<test>` sont des lignes de « Commandes
du projet » de `.claude/pipeline.config.md`, la pile au choix de la session ; une ligne `n/a`, ou
marquée `# non vérifiée` (voir plus bas), se passe en **omettant** son option, et la sonde sort
`SAUTÉE` :

## Six sondes, de la moins chère à la plus chère

Six sondes, de la moins chère à la plus chère, arrêt au premier KO : un arbre et un index propres
(`git status` vide, fichiers non suivis compris) — la sonde de commit emporte ce qui est stagé, et
la commande de format réécrit ce qui ne l'est pas ; `gh auth status --active` en 0 ;
`gh api repos/{owner}/{repo} --jq .permissions.push` à `true` ; **une écriture**,
`git commit --allow-empty -m "chore: sonde outillage"` puis `git reset --soft HEAD~1`, la tête
revenue au SHA d'avant ; la commande de format, qui écrit, sans qu'elle réécrive l'arbre ; la
commande de test. Sortie 0 : tout OK ou sauté ; 1 : premier KO, avec la fin de la sortie
fautive ; 2 : appel mal formé. **Ce qu'elle ne couvre pas** : un dépôt sans commit, où elle rend
KO avant d'écrire ; le premier push et la CI ; la ligne « validation » ; les hooks côté serveur ;
le choix des commandes, qui reste à la session.

## Estimation

- **Estimation** — en **blocs** (`taille-pr.md`, point 5) : ≈ 650 lignes ou ≈ 350 K de contexte
  de `developpeur` chacun (deux points mesurés, relevés le
  2026-10-29). Les lignes se comptent **par
  critère**, en artefacts que le critère doit laisser, jamais en prose qui le décrit : une porte →
  un test paramétré à témoins des deux côtés (~100-150 lignes) ; un script → le script et son
  fichier de test (~400) ; une règle de skill → sa ligne. Calibration mesurée : trois lots
  d'une même issue ont dépassé la leur de 2 à 5×, tous du même côté — une estimation en prose est un plancher.
  L'estimation planifie les blocs, leurs frontières et leurs passes de relecture (`cycle-pr` 3.5
  et Étape 4) ; elle ne découpe rien.
- **Au-delà de ~3 blocs estimés**, le briefing porte la ligne **« pourquoi un seul sujet »** : ce
  qui lie les morceaux au test du sujet (`taille-pr.md`, point 1), et le coût des deux voies — une
  PR, ou une PR de plus par lot à ≈ 30 M de tokens et 5 à 8 contacts du mainteneur chacune, plus 13
  à 44 M de coordination pour un lot coordonné. Le mainteneur tranche au go
  (point 6).
- **Une économie se cadre sur son poste dominant mesuré**. Quand le critère
  d'acceptation est une économie — tokens, temps, minutes de CI —, le briefing porte, avant tout
  découpage, la répartition mesurée du coût actuel par poste (session et sous-agents, par modèle,
  par PR), la commande qui la produit — à écrire si le projet n'en a pas encore, par exemple un
  script qui somme les jetons des transcripts de `~/.claude/projects/` — et la part du poste visé. Un poste visé sous **25 %** du total ne se
  découpe pas en lots : l'issue tient en une PR, ou s'abandonne. Le seuil suit la loi d'Amdahl —
  le gain total est borné par la part du poste — et passe juste au-dessus du cas d'échec mesuré :
  une issue visait les sous-agents, 22,5 % des tokens, et a livré 18 lots pour 9 annoncés.

## Ce que couvre le go du briefing

**Le go du briefing couvre les relances de CI de la PR** (`cycle-pr` Étapes 5 et 7) :
`gh run rerun <run>`, run entier, quand le trunk a avancé ; `gh pr close` puis `gh pr reopen`
quand la porte dit la définition du workflow périmée, ou qu'un événement s'est perdu. La session
ne redemande pas l'accord à chaque relance, et la ligne de fusion des jobs du run garde la preuve
(`<répertoire de ce skill>/scripts/porte-merge.py trunk`, Étape 7, « Rejouer les vérifications
périmées »). **Après 3 relances de suite dont la porte sort en 1, la session redemande l'accord**
avant la suivante. Ni commit vide ni force-push, inchangé.
Il ne couvre **jamais** le go de merge, demandé à part (Étape 7, « Le go, puis le merge »). Fait
d'origine : lors d'une vague, chaque relance d'une PR avait coûté un aller-retour d'accord.

## Auto-challenge du plan — le plan est-il encore exact ?

Avant de présenter le briefing comme acté, **se challenger explicitement** : le plan a pu être
écrit (issue, agent brief, conversation) *avant* que d'autres PR ne soient mergées. Le terrain a
peut-être bougé. Confronter le plan à la réalité **actuelle** du code — les relevés (`git log`,
`grep` des ancres, dénombrements) à un `releveur`, la cartographie de la zone touchée (fichiers,
interfaces, appelants) à l'`executant`, le jugement à la session PR :

- **Relire l'état réel** de la zone touchée (`git log` récent sur `main`, fichiers concernés) — pas
  l'état supposé au moment où l'issue a été écrite.
- **Pour chaque décision verrouillée et chaque fichier listé**, vérifier qu'elle tient toujours :
  l'interface existe-t-elle encore sous cette forme ? une PR récente a-t-elle déjà fait une partie
  du travail, déplacé un module, changé un contrat, rendu une hypothèse caduque ?
- **Confronter le brief au « Journal de spec » du corps de l'issue** : toute entrée du journal
  postérieure à la **dernière édition** du brief (date de modification du commentaire, pas sa date
  de création) se lit comme un erratum potentiel — une réconciliation a pu ne pas atteindre le
  brief. En cas d'écart entre les deux, le journal (adossé aux sources de vérité) l'emporte, et
  l'écart se signale dans le briefing.
- **Dénombrer les cases du corps et celles du brief** — les lignes `- [` du corps et du
  commentaire `## Brief d'agent` (`gh issue view <N> --json body,comments`) : tout critère du
  brief absent du corps rejoint la liste des critères du briefing, et le `verificateur` jugera
  l'union des deux (`.claude/agents/verificateur.md`, point 1). Sur une issue : corps 2 cases, brief 7
  dont « Les critères du corps de l'issue », soit 6 cases du brief hors du corps (relevé du
  2026-10-29).
- **Reproduire chaque chiffre de référence qu'un critère demande de retrouver**, par la commande
  qui recense sa population (`triage/brief-agent.md`, « Critères d'acceptation complets »), avant
  la première ligne de code. Un chiffre qui ne se reproduit pas fait amender le critère, avec sa
  ligne au « Journal de spec » — **partout** où la phrase se répète, sinon chaque lot suivant hérite
  d'une base fausse. Un critère muet sur sa population : prendre celle que son intention désigne et
  l'écrire dans l'amendement, jamais chercher celle qui rend le chiffre annoncé.
- **Vérifier que la suite du dev tient** : ce que cette PR prépare pour les issues suivantes est-il
  toujours cohérent, ou l'ordre / le découpage doit-il être revu ?
- **Vérifier la faisabilité de l'ordre des commits** : pour chaque commit prévu, ce dont ses tests
  ont besoin pour tourner en local (services, schéma, compose, fixtures) existe-t-il déjà, ou
  est-il introduit par un commit ultérieur ? Si « ultérieur » → remonter ce commit. L'ordre de
  livraison suit les **dépendances d'exécution**, pas la logique de présentation du plan — un
  découpage peut être juste sur le contenu et infaisable sur l'ordre.
- **Chercher le numéro de l'issue dans tout le dépôt** — `grep -rn "#<N>"` sur les sources, la
  doc et la config, hors `.git/` et dépendances. Chaque occurrence est une **dette adressée à ce
  lot par un lot précédent** (« le lot 3 de #N y branchera X », « viendra avec #N ») : à honorer
  ou à amender dans ce lot. Le corps et le brief ne les connaissent pas, elles vivent dans le code.
- **Les consignes reçues d'un lead de vague font partie de la population confrontée**, au même
  titre que les décisions verrouillées : une consigne présentée comme un invariant se vérifie
  contre l'artefact qui le garde — le test, sa docstring, le § de l'issue — jamais contre son
  énoncé, une reformulation dérivant toujours vers le plus strict. Divergence → arrêt
  `decisions-vs-doc` ordinaire, à remonter.
- **Un ordre de gestes chez un tiers** (console, registrar, fournisseur de paiement) est une
  hypothèse à re-vérifier en source officielle, comme une interface qui a pu bouger : aucune gate
  ne rougit quand il devient faux.
- **Énoncer à voix haute** sous un titre `## 🔍 Auto-challenge du plan` : ce qui reste valable, ce
  qui a changé, et les ajustements proposés (fichiers en plus/en moins, décision à rouvrir, scope à
  resserrer ou re-découper).

## Une réponse `[V]` du go qui contredit le brief l'amende avant la première ligne de code

**Une réponse `[V]` du go qui contredit le brief l'amende avant la première ligne de code** —
décision verrouillée, critère ou interface : décision réécrite avec son motif et sa date, critères
déplacés, une ligne datée au « Journal de spec » du corps (`decisions-vs-doc`, sortie 2), relue
après écriture. Le corps de la PR ne remplace pas le brief : les lots suivants et `repercussions`
ne lisent que l'issue.

## Découpage en plusieurs lots

**Découpage en plusieurs lots.** Le briefing ne découpe l'issue en n > 1 lots que sur un **motif**
écrit avec son **coût** (`taille-pr.md`, point 3) : une dépendance de mise en service, une relecture
d'une autre nature ou un risque distinct, un parallélisme dont le gain est nommé ; ≈ 30 M de tokens
et 5 à 8 contacts du mainteneur par PR de plus. Deux sujets ne font pas deux lots, ils font deux
issues. Par défaut, les lots sont **légers** (point 4) : la session porte le premier comme toute
session PR, et chaque lot suivant reçoit sa session neuve (`cycle-pr` Étape 2, « Cas découpé »,
et 3.5). Contre une surface visible à moitié livrée ou une règle de pipeline à moitié appliquée
pendant une vague, le briefing nomme ce cas, et la session devient la **coordinatrice** de ses
lots : elle n'écrit pas de code, et son go — le go du découpage — fait démarrer les sessions de
lot, ou chacune à son ouverture ([references/coordinatrice.md](references/coordinatrice.md)). Une
issue à un seul lot ne change rien : la session porte le cycle elle-même et délègue le code (3.1).
Une session de lot coordonné attend le go ci-dessous dans sa fenêtre comme toute session PR, et y
démarre sa session de relecture — sauf go délégué à la coordinatrice, qui lève l'attente et passe
la relecture au repli `relecteur` (même référence, « La session de lot »).

## La PR est le premier artefact produit, pas le dernier

**La PR est le premier artefact produit, pas le dernier.** C'est elle qui rend le travail
*visible comme en cours* pour le reste de la pipeline : `repercussions` s'en sert pour savoir
qu'une issue est « en vol » et ne pas réécrire sa spec sous les pieds de cette session, et
`pr-paralleles` pour tenir son tableau de bord. **Une branche locale sans PR est invisible** — le
travail existe, mais rien ne le sait.

## Une PR en draft n'a aucun run de CI

> **Une PR en draft n'a aucun run de CI** : le garde `if:` du `ci.yml` du template saute toute
> draft, quel que soit l'événement — ouverture, push, réouverture.
> Le premier run vient du passage en ready (`gh pr ready`, événement `ready_for_review`, Étape 5),
> puis chaque push lance le sien.
> Les passes de relecture (4.2) relisent donc un SHA sans verdict de CI, et un rouge de la famille
> « sensible à la plateforme » (3.2) se voit au passage en ready : c'est le prix d'une CI qui ne
> paie un run que là où son verdict peut tenir. **Une draft sans run n'est pas une CI
> cassée.**
