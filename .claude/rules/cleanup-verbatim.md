# Règle — Le prompt de relecture (cleanup pass)

**Dès que le travail demande de relire, nettoyer ou améliorer du code**, exécuter **ce prompt mot
pour mot**. Ne jamais le paraphraser, ne jamais le raccourcir, ne jamais le recopier ailleurs.

Cela couvre aussi bien les étapes de la pipeline (cycle de commit, cleanup holistique de PR,
refactor TDD, relecture indépendante) qu'une **demande directe et informelle** de l'utilisateur — « relis ça »,
« nettoie ce fichier », « améliore ce code », « tu peux revoir ce que tu viens d'écrire ? ».
Il n'y a pas de relecture « informelle » qui échapperait à ce prompt : s'il s'agit de repasser sur
du code, c'est ce prompt qui s'applique. Seule exception : le commit d'une tranche entièrement
spécifiée par l'`executant` (`.claude/agents/executant.md`, « Ton commit »), que le cleanup
holistique de `cycle-pr` 4.1 relit. Qui l'exécute : au commit, qui a codé le bloc — `developpeur`, ou la
session sous le seuil de `cycle-pr` 3.1 (`cycle-pr` 3.3) ; le cleanup holistique, un `developpeur`
neuf sur le diff complet de la branche, qui ne rend que des commits, ou la session sous son seuil
(`cycle-pr` 4.1) ; une demande directe, la session à qui elle est faite.

**Relire un document normatif** (spec UX/UI, cadrage, PRD) n'est **pas** ce prompt : c'est le
skill `audit-spec-ui` — passes mécaniques (jetons, tables, arithmétique, contraste, cohérence)
avant tout jugement, chaque finding cité par §.

> Veuillez examiner l'ensemble du code ajouté et des modifications apportées aux fichiers
> existants. Réorganisez, structurez, optimisez et nettoyez ces modifications pour produire un
> code clair, cohérent et facilement maintenable. Éliminez tout code dupliqué, inutile ou
> obsolète. Décomposez les fonctions et séparez les responsabilités en suivant les principes
> KISS, DRY et YAGNI. Rendez le code le plus **générique et modulaire** possible : des unités à
> responsabilité unique, découplées de leur contexte d'appel, réutilisables telles quelles, et
> conçues pour que l'ajout d'un cas se fasse par extension plutôt que par modification — sans
> pour autant anticiper un besoin non avéré. L'objectif est d'obtenir un code propre, clair,
> concis, générique, modulaire et optimisé.

## Comment l'appliquer

- **Examen fichier par fichier**, pas un regard global vague. Pour chaque fichier modifié, lister
  les findings concrets : magic numbers, duplication, naming douteux, fonction trop longue,
  responsabilité mal séparée, code mort.
- **Rapporter à voix haute** sous un titre `## 🧹 Cleanup pass`, pour que le relecteur vérifie
  d'un coup d'œil que l'étape n'a pas été sautée. Un `developpeur` le rend dans son rapport final
  — son contexte meurt avec lui —, et la session PR le relaie aux Notes de la PR.
- **Même rigueur sur les deltas triviaux.** Si « rien à corriger », dire ce qui a été repassé —
  fichiers, points contrôlés, dénombrement — en quelques lignes, pas ligne par ligne : la preuve
  est dans ce qui a été vérifié, pas dans la longueur du compte rendu.
- **Un constat qui décrit une classe de défaut se traite en balayant toute la population
  concernée**, jamais les seules occurrences citées — un constat de relecture est un échantillon,
  pas un inventaire. Le rapport énonce le dénombrement (« N éléments repassés, k corrigés, N−k
  vérifiés indemnes »), pas « les 2 constats sont corrigés ». Quand la classe est reconnue,
  inscrire le critère dans l'artefact lui-même pour qu'il tienne sans relecteur.
- **La population d'un constat sur une étape, une section ou une liste numérotée inclut ses
  renvois entrants.** Quand l'édition change ce qu'une étape exige, `grep` son nom (« Étape N »,
  titre de section) dans `.claude/` (skills, rules, `pipeline.config.md`), `CLAUDE.md`,
  `CONTRIBUTING.md` et `.github/`, puis vérifier
  pour chaque hit que la cible dit bien ce que le renvoi lui prête — une paraphrase paraît à jour
  en ayant perdu la moitié du contenu.
- **Un correctif qui ferme un chemin se déclare clos sur une classe, jamais sur l'occurrence qui
  l'a révélée.** Le déclencheur est la **structure** du défaut — N chemins vers un même état —,
  jamais son sujet : fuite d'une donnée, voie par laquelle un état arrive ou sort (chargement,
  cache, signal, écriture partielle), cas d'un dispatch, **frontière d'entrée écrite à la main**.
  Cette liste est ouverte à dessein : une règle qui se re-formule à chaque domaine ne se
  déclenche jamais sur le suivant, et c'est ainsi que celle-ci est passée à côté d'une détection
  d'état parce qu'elle était écrite pour la sécurité, puis à côté de cinq défauts de validation
  d'entrée découverts un par un sur trois relectures. Conséquence directe : quand un delta
  introduit un **format saisi par un humain** — fichier de configuration, JSON de paramétrage,
  argument de ligne de commande —, tous ses champs se balayent pour le type et la présence en
  **une** passe, pas au fil des constats.

  « La seule voie », « le seul cas », « le dernier endroit » sont interdits tant qu'un
  **dénombrement** ne les accompagne pas — N formes recensées, k fuyaient — écrit **avant le
  premier correctif** et épinglé dans l'artefact par un test paramétré, pas par une phrase de
  docstring : la preuve que le chemin connu est fermé se lit spontanément comme la preuve qu'il
  n'y en avait qu'un. Écrit après, le dénombrement se fait par morceaux, un correctif par
  relecture. Il est à qui reçoit le constat : la session PR pour un constat de relecture, qu'elle
  porte avec sa classe dans le brief du `developpeur` de correction (`cycle-pr` 4.2, « Le
  cliquet ») ; le `developpeur` pour ce que son propre cleanup trouve. Le test paramétré s'entend
  d'une classe de code ou de contrat : une population de prose normative ne s'épingle pas, elle se
  relit par la passe « restrictions du delta » (`cycle-pr/references/session-relecture.md`,
  « Réveil »).
- **Passe « affirmations » — ce que le delta dit de lui-même.** Le prompt ci-dessus fait relire le
  **code** : duplication, naming, responsabilités. Il ne fait jamais relire les **affirmations
  attachées au code**, et c'est là que l'angle mort de l'auteur est maximal — une affirmation est
  précisément ce qu'on ne re-dérive pas une fois écrite. Mesuré : sur un lot, quatre
  bloquants, **zéro** trouvé par le cleanup de commit ni par le cleanup holistique (un seul
  constat sur 2923 lignes), et les quatre portaient sur une affirmation.

  La passe est **mécanique et dénombrable**, dans l'esprit des passes d'`audit-spec-ui` :
  énumérer chaque assertion que le delta fait sur lui-même — propriété annoncée dans un
  docstring, commentaire « mesuré », ligne de `pipeline.config.md`, case de Test plan, message
  d'assertion — puis, pour chacune, l'une des **trois** provenances que porte déjà
  `.claude/agents/relecteur.md` : **la commande qui l'établit** (mesuré), **la mesure datée et
  citée dont elle est tirée** (lu), ou **« non vérifiée »** (supposé). Rendre le dénombrement :
  N affirmations, k établies, N−k non vérifiées. Les messages d'assertion se comptent par analyse
  syntaxique (`ast`), jamais par expression régulière : une regex qui franchit les lignes a rendu
  deux dénombrements faux avant le bon. Un **dénombrement de population écrit en commentaire** —
  « N énoncés, N épinglés » au-dessus d'une table — est une affirmation sans commande : « non
  vérifiée » tant qu'un test ne le recompte pas à chaque exécution ; un « 55 morceaux » écrit
  au-dessus d'une table d'épingles en comptait 92 par sa propre règle. Ce recompte vaut
  pour une classe de code ou de contrat : une population de prose normative se relit par la passe
  « restrictions du delta », jamais par une table d'épingles.

  **Pourquoi trois et non deux** : une mesure héritée d'une observation datée n'a pas de commande
  et n'est pas pour autant non vérifiée. Dénombré sur le delta qui a introduit cette passe —
  six énoncés justes et cités seraient partis en « non vérifiée ». Une étiquette qui classe six
  affirmations vraies comme douteuses devient le bruit qu'on apprend à ignorer, et c'est
  exactement le seuil que `decisions-vs-doc` protège.

  **Une exception, mesurée** : une **chronométrie** n'a pas de commande qui l'établisse — quatre
  bornes publiées, quatre dépassées au relevé suivant. Pour une grandeur que le poste et le
  nombre de runs font varier, l'**ordre de grandeur est la mesure**, et c'est l'invariant sous
  test qui rougit, jamais le relevé. La forme « population + commande » vaut pour une population
  **figée par un commit**, pas pour un temps.

  **Même exception pour une population vivante** — corpus de transcripts, base d'avis, inventaire
  d'un outil, sortie d'un service tiers : le relevé porte son **horodatage à l'heure** et la
  mention « population vivante », avec une seconde mesure quand on en a une, et le texte distingue
  le **chiffre relevé** de l'**invariant sous test**. Le test paramétré n'assère que l'invariant —
  les formes couvrent la population sans résidu —, jamais la valeur absolue : il reste vert quand
  la population grossit, et rougit quand une forme entre sans re-mesure. Mesuré : 87 transcripts
  et 1137 messages, puis 85 et 1106 une heure plus tard, même commande.
- **Un texte procédural se relit dans l'ordre d'exécution.** Un delta qui ajoute une condition,
  une exception ou un report à un texte exécuté pas à pas — skill, règle, runbook — se relit en
  agent qui le suit à la lettre : l'exception se place à l'étape qui agit, ou y est annoncée,
  jamais seulement plus loin. Chaque étape qui agit sur le cas couvert se relit avec la question
  « à ce point, l'agent sait-il déjà qu'il ne doit pas le faire ? ». Mesuré : deux exceptions
  placées après l'étape qu'elles suspendaient, dans une même PR, aucune vue par le cleanup fait
  paragraphe par paragraphe — chacun était juste isolément.
- **Une uniformisation de syntaxe est un changement de comportement tant qu'elle n'est pas
  prouvée entrée par entrée.** Normaliser N entrées — jokers, guillemets, chemins, drapeaux — se
  prouve équivalent **par entrée**, une mesure ou un cas de test chacune, jamais par l'équivalence
  générale de la doc ; une entrée qui s'avère morte se **retire**, elle ne se réveille pas.
  Mesuré : `Bash(gh api repos/:*)`, normalisé en `Bash(gh api repos/*)`, a rendu vivante une
  règle morte depuis l'amorçage, et silencieuses les écritures REST qu'elle couvrait.
- **Une lecture d'état `git` qui décide se pose la question des clés de configuration qui
  changent sa sortie.** Quatre clés changeaient la conclusion des lectures d'`amorcage.py commit`
  (mesuré le 2026-10-26, git 2.47.1, commentaire de `STATUS`) : sous
  `status.showUntrackedFiles=no`, il rendait « rien à commiter », sortie 0, devant un fichier non
  suivi. Un contrôle de propreté lit donc
  `git status --porcelain --untracked-files=normal`, et le test d'un script `git` isole la
  configuration du poste : `GIT_CONFIG_GLOBAL` vers un fichier vide, `GIT_CONFIG_NOSYSTEM=1`.
- **Vérifier aussi les 3 axes de conception** de `.claude/rules/contraintes.md` (modulaire /
  fractionné / scalable), en plus de KISS / DRY / YAGNI.
- **Relancer les tests après le cleanup** : il a pu casser quelque chose.
