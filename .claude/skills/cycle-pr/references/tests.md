# Bons et mauvais tests

> Les exemples de cette page et des autres références de `cycle-pr` sont écrits en TypeScript par
> concision. **Les principes sont indépendants du langage** — transposer aux idiomes de la stack du
> projet (celle déclarée dans `.claude/pipeline.config.md`), pas introduire TypeScript.

## Bons tests

**Style intégration** : tester à travers de vraies interfaces, pas des mocks de parties internes.

```typescript
// BON : teste un comportement observable
test("un utilisateur peut payer avec un panier valide", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

Caractéristiques :

- Teste le comportement qui intéresse les utilisateurs/appelants
- Utilise l'API publique uniquement
- Survit aux refactors internes
- Décrit le QUOI, pas le COMMENT
- Une assertion logique par test

## Mauvais tests

**Tests de détails d'implémentation** : couplés à la structure interne.

```typescript
// MAUVAIS : teste des détails d'implémentation
test("checkout appelle paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

Signaux d'alerte :

- Mocker des collaborateurs internes
- Tester des méthodes privées
- Asserter sur le nombre/l'ordre des appels
- Le test casse lors d'un refactor sans changement de comportement
- Le nom du test décrit le COMMENT, pas le QUOI
- Vérifier par un moyen externe au lieu de l'interface

```typescript
// MAUVAIS : contourne l'interface pour vérifier
test("createUser enregistre en base", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// BON : vérifie à travers l'interface
test("createUser rend l'utilisateur récupérable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

## Ce qu'un test de la pipeline peut être

Les tests de la pipeline — skills, règles, rôles et leurs scripts — vivent dans `.claude/tests/` et
tournent sur son delta. Chacun lit l'une de ces choses :

- un **format** qu'une machine lit : le frontmatter d'un skill ou d'un rôle, `settings.json` ;
- un **chemin ou un titre cité** par la prose, qui doit résoudre ;
- un **code de sortie d'un outil**, mesuré sur un dépôt témoin ;
- le **comportement d'un script** ;
- la **forme d'une commande** écrite dans la prose.

Jamais une phrase de comportement. Une classe de prose se relit par la passe « restrictions du
delta » (`session-relecture.md`, « Réveil »), elle ne s'épingle pas : c'est le huitième cas de « Le
rouge se constate, il ne se suppose pas », ci-dessous.

---

Passages déplacés mot pour mot de `cycle-pr/SKILL.md`, chacun sous le titre que
cite son renvoi. Les liens `references/…` qu'ils portent se lisent depuis le dossier du skill,
et leurs renvois de position (« ci-dessous », « plus bas ») depuis l'emplacement du renvoi.

## Frontières tierces : on vérifie, on ne suppose pas

**Frontières tierces : on vérifie, on ne suppose pas.** Avant d'appuyer un comportement sur une
bibliothèque ou un framework tiers à une frontière (réseau, encodage, secrets, fusion avec un
thème ou une config par défaut, cycle de vie de ressources), lire ce que fait réellement l'API —
documentation via `context7` ou sources du paquet — et le noter dans les `Notes` de la PR avec sa
référence. Les défauts les plus coûteux d'une PR « verte » sont des suppositions sur un paquet :
un décodage par défaut, un retry silencieux, une fusion de valeurs, un `repr` qui affiche un secret.

Deux cas de cette frontière se paient plus cher que les autres. **Un comportement par défaut
invoqué pour écarter un risque de sécurité** — un protocole inactif, une option refusée — se
mesure sur le **binaire livré**, jamais sur sa documentation ou sa réputation : une exception de
scan adossée à « inactif par défaut » est tombée au premier test sur l'image. **Une
limite du geste** se pose avant l'intégration : quand une bibliothèque est retenue pour un
comportement visible, dresser d'abord, depuis ses sources, la liste de ce qu'elle ne fait pas du
geste demandé — cas non couverts, états refusés ; chaque entrée est une question `[V]`, posée
avant la première ligne avec l'alternative chiffrée, jamais une note découverte après l'ADR.

**Une commande que la prose fait taper à un rôle** — porte, passe comptable, case Commande — **se
rejoue sous le hook du poste, telle qu'écrite, sur un témoin des deux côtés, avant d'être
épinglée** : le hook RTK peut la réécrire, et la forme réécrite rendre autre chose sans le
signaler — une passe comptable a conclu « conforme » sur du vide (mesures datées au
paragraphe **RTK** de `.claude/pipeline.config.md`). Tant que le hook la réécrit, elle s'écrit
sans antislash, et sans sortie longue lue d'une commande réécrite, non pipée ou en tête d'un tube.

## Un zéro rendu par un outil de contrôle se lit avec son inventaire

**Un zéro rendu par un outil de contrôle se lit avec son inventaire** — types de cibles, nombre
de composants analysés : un composant que l'outil n'a pas ouvert n'est pas mesuré, et se
contre-éprouve sous une forme que l'outil lit (règle complète : `interroge-moi`, « Avant de
verrouiller »).

## Un avis de sécurité sans correctif n'est pas une impasse

**Un avis de sécurité sans correctif n'est pas une impasse.** Une plage d'avis `*` — toutes les
versions publiées affectées, paquet abandonné — ne clôt pas l'analyse, elle la déplace d'un
étage : avant de conclure qu'un avis est irréductible, remonter la chaîne de dépendance et
vérifier, pour **chaque** parent, s'il a cessé de dépendre du paquet fautif dans une version
ultérieure — le correctif d'un paquet abandonné vient presque toujours de son consommateur. Puis
regarder comment d'autres projets ont traité le même avis : un mur atteint par tout le monde a
souvent une issue de sortie publiée. Et un `override` qui saute une majeure sous un consommateur
non prévu pour elle **s'éprouve en exécutant réellement l'outil**, pas en relançant l'audit.

## Le rouge se constate, il ne se suppose pas

**Le rouge se constate, il ne se suppose pas — un test qui n'a pas été vu rouge n'est pas un
test.** Huit cas à traiter explicitement :

- **Le test passe du premier coup, avant tout changement de production** → il mesure autre chose ;
  ne jamais conclure « le défaut n'existe pas ». Cas fréquent : lire une configuration statique
  alors que le défaut naît d'une fusion ou d'une résolution à l'exécution. Instrumenter d'abord
  (sonde jetable qui imprime les valeurs au point où l'utilisateur les subit), corriger le point
  de mesure, obtenir le rouge, puis écrire le correctif. Supprimer la sonde avant le commit.
- **Le test dérive d'un critère d'acceptation ou d'un rapport de bug et passe avant le correctif**
  → la prémisse a pu vieillir sous les dépendances : la vérifier contre les versions **réellement
  épinglées** (changelog + exécution), re-spécifier le test sur le déclencheur qui échoue
  vraiment, et signaler l'écart dans l'auto-challenge de l'Étape 1 — le correctif reste souvent
  bon, c'est le critère qui est faux.
- **La garde protège une ligne existante** (délégation, `override`, clause de `catch`) → la faire
  rougir en **supprimant cette ligne**, pas en raisonnant. Si le test reste vert, son montage fait
  converger le chemin nominal et le chemin fautif vers la même observation : trouver un point où
  les deux divergent. Quand la ligne gardée est un **réglage de sécurité** — option d'un scanner,
  épingle, permission, porte de CI —, on ne mute pas le dépôt : on écrit la garde en fonction sur
  du texte, vue rouge sur un recueil de formes fautives construites en mémoire. Le classifieur du mode auto refuse de
  lancer une suite sur une configuration de sécurité affaiblie, par quelque voie que ce soit.
  `mutation.py` refuse ce que ses motifs de chemin et de contenu
  reconnaissent et renvoie à cette forme ; un réglage rangé ailleurs y ajoute son motif.
- **Le test est dicté par un tiers** (relecteur, lead de vague, issue) → même règle que pour un
  test écrit soi-même : mutation avant de le garder. L'autorité de la source ne remplace pas le
  rouge observé.
- **L'assertion est une absence** (`findsNothing`, `is None`, `not called`, « aucun X quel que
  soit l'état ») → le test doit être vu rouge sur un état où la chose **est présente** : le code
  inchangé, avant le correctif. Une recherche qui ne trouve rien et une recherche mal formée
  rendent le même résultat (un sélecteur sur la classe de base ne voit pas la sous-classe) ; s'il
  passe à ce moment-là, le défaut est dans le sélecteur, jamais dans le sujet. Un garde d'absence
  jamais vu rouge n'est pas un garde, c'est un commentaire exécutable.
- **L'assertion ne distingue pas quelle branche a mordu** — jointe par `or`, ou réduite à « ça
  lève » (`assertRaises` sans vérifier le type ni le message, `assert a or b`, une appartenance à
  un ensemble de valeurs acceptables) → elle reste verte quand la garde qu'elle croit éprouver
  disparaît, parce que l'autre branche la satisfait. Le rouge se constate en **retirant une
  branche à la fois** : si le test tient dans les deux cas, il n'éprouve aucune des deux. Trois
  occurrences sur un même lot, trouvées chaque fois par le harnais de mutation (une mutation
  `VERT` sur une garde retirée), jamais par relecture — une assertion jointe se lit exactement
  comme une assertion forte.
- **La table de cas est dérivée de l'artefact sous test** (`for x in module.CONSTANTE`) → retirer
  un élément de l'artefact retire son cas au lieu de le faire rougir : le test et le code ont la
  même source, le test ne peut contredire le code sur rien. Les cas s'écrivent en **littéraux**,
  dans l'orthographe réelle ; l'égalité entre la table et la constante est un **second** test, qui
  garde l'autre sens. Mesuré sur un lot : la mutation « préfixe retiré » est restée `VERT`
  après un correctif qui construisait ses cas depuis le tuple du script.
- **La garde cite une phrase de règle** (une table d'épingles sur une prose normative) → une garde
  ne cite pas une phrase de règle : une règle se relit par la passe « restrictions du delta »
  (`session-relecture.md`, « Réveil ») ; une garde cite un chemin, un titre, un numéro ou la forme
  d'une commande. Une table d'épingles laissait retirer en vert la moitié restrictive qu'aucune
  ancre ne couvrait ; la passe lit chaque ligne retirée sur le diff.

## Contrôles complémentaires de 3.2

- **Échec d'outillage ≠ échec de code.** Un échec « exécutable introuvable », « fichier utilisé
  par un autre processus » ou un compilateur qui sort brutalement après une commande tuée n'est
  pas un test rouge : vérifier d'abord l'environnement — processus orphelins laissés par un run
  interrompu (les lister **filtrés sur le chemin du worktree** avant de les tuer), worktree non
  provisionné — et ne diagnostiquer le code que sur un environnement propre.
- **Un résumeur n'est pas un verdict.** Quand la commande de test passe par un filtre ou un
  résumeur — proxy de sortie, hook de réécriture —, tout bilan qui annonce **zéro test collecté**,
  ou tout état autre que le rouge nommé à l'avance, se relit sur la **sortie brute du lanceur**
  avant d'être interprété : la commande `test brut` de `.claude/pipeline.config.md`, ou à défaut
  le contournement que le résumeur documente. Un résumeur peut rendre « aucun test collecté »
  sur une suite qui a un rouge — un accent dans un message d'assertion suffit —, et ce rouge se
  conclut alors « environnement cassé ». Tant qu'il n'a pas montré qu'il
  distingue « zéro test » d'« un test rouge », son bilan n'est pas un verdict.
- **Une porte verte ne vaut que pour la plateforme qui l'a rendue.** Quand le poste et la CI n'ont
  pas le même OS, recenser une fois, au premier scaffold, les règles de qualité sensibles à la
  plateforme — bit exécutable, fins de ligne, sensibilité à la casse des chemins, séparateur de
  chemin, encodage par défaut — dans la section « Qualité » de `.claude/pipeline.config.md`, et
  dire dans les `Notes` de la PR lesquelles ne sont vérifiées qu'en CI. Une règle de lint que
  NTFS ne peut pas déclencher ne rougit qu'en CI ; l'inverse existe aussi, un fichier que
  `.gitattributes` pinne en LF et qu'une copie de travail CRLF fait rougir sur le seul poste.
- **Une commande du projet que la suite n'exécute pas est invisible à toutes les portes.** Si le
  delta touche le fichier de commandes du projet (`Makefile`, `justfile`, scripts du manifeste)
  ou la définition d'une commande listée dans `.claude/pipeline.config.md`, **exécuter cette
  commande** — pas seulement la suite de tests : une cible qu'aucune porte n'appelle n'est
  vérifiée par personne, et sa cohérence à la lecture est précisément ce qui rend le défaut
  invisible (un `export` posé avant un `?=` vide la variable, et le fichier reste lisible). Une
  cible qui ne peut pas tourner ici — Docker, jeton, réseau — se vérifie sur la commande **après
  expansion** (`make --dry-run <cible>`, ou l'équivalent du lanceur du projet), jamais sur le
  texte du fichier.
- **Un exécutable livré se lance sur une entrée réelle.** Si le delta livre un exécutable —
  script, commande, rapport —, le lancer au moins une fois sur une entrée **réelle**, pas
  seulement sur les fixtures de ses tests, et lire sa sortie ligne à ligne contre les critères qui
  la décrivent ; entrée et sortie vont au Test plan (Étape 5) avant `gh pr ready`. Un test écrit
  par l'auteur assère ce que le code calcule ; seule l'exécution le confronte à ce que le critère
  demandait. Mesuré : 38 tests verts autour d'un script dont la première sortie réelle divisait
  chaque pourcentage par la durée totale, absences comprises — 2 % affichés là où le critère
  demandait la part hors absences, 13 %.
- **Un delta sur `.claude/` ou `CLAUDE.md` passe par le validateur du harnais avant tout push**
  — ligne « validation » de `.claude/pipeline.config.md`, que joue un `releveur` avant chaque push.
  C'est la porte la plus large de ce que Claude Code charge : un frontmatter de skill absent, une
  `description` non textuelle, un manifeste, une entrée MCP. **Avec `--strict`**, sans quoi un
  avertissement sort en 0. Elle ne dispense pas de la suite : mesuré le 2026-10-09 (v2.1.295),
  elle est **muette** sur un
  frontmatter de rôle absent ou illisible — un ` : ` non cité dans une `description` fait charger
  le rôle sans aucun champ, en silence —, et ce sont les tests de frontmatter du projet qui
  gardent cette classe. Deux portes, deux populations : ni l'une ni l'autre ne couvre tout.
- **Couverture par commit.** Lire le rapport de couverture du delta : une ligne non couverte est
  d'abord une hypothèse de **code écrit trop tôt**, à déplacer vers le commit de son premier
  appelant — avant d'être un test manquant. C'est le seul instrument qui rende opposable
  l'interdiction du scaffold inutilisé.
- **Atteignabilité.** Une suite verte ne prouve que ce qu'elle compile : un fichier ajouté que ni
  la production ni les tests n'importent est invisible à toutes les gates à la fois (profil
  typique d'une PR foundation qui pose jetons ou constantes). Exiger au moins un point d'appel
  depuis les tests, et l'avoir vu rougir en cassant ce qu'il référence. Symétrique, côté porte :
  un fichier ajouté dans un dossier que la PR crée, ou qu'aucune porte ne couvrait encore, se
  prouve **lu** par chaque porte qui prétend le couvrir — lint, typecheck, format — en y injectant
  une faute délibérée, vue rouge, puis restaurée. Les exclusions par défaut des outils (dossiers
  cachés, `node_modules`, environnements virtuels) priment souvent sur l'`include` du projet :
  pyright a rendu « 0 errors » sur un script de `.github/scripts/` qu'il n'avait pas analysé, et
  y a trouvé 11 erreurs une fois le script déplacé.
