# Gabarit de plan de QA

Squelette par défaut du corps d'issue GitHub pour un plan de QA. Remplace les espaces réservés.

**Trois règles héritées du SKILL, qui priment sur ce gabarit :**

1. **Une surface que le projet n'a pas ne produit aucune section** — pas même une section marquée
   « N/A ». Les surfaces se déduisent de `.claude/pipeline.config.md`. Les sections ci-dessous sont
   un menu, pas une liste à remplir intégralement.
2. **Aucune case ne re-teste ce que la CI couvre déjà.** Pas de « les tests passent », pas de « le
   lint est vert », pas de « le build réussit » : `cycle-pr` et la CI l'ont déjà prouvé. Ce plan ne
   contient que ce qu'un test automatisé ne peut pas voir.
3. **Chaque case porte son type**, juste après la case à cocher :
   ``- [ ] **Commande** — `<commande exacte>` → <attendu>`` ou
   ``- [ ] **Observation** — <action ou endroit à regarder> → <attendu>`` (« Types de case »
   ci-dessous). Une case sans type n'est pas publiable : la passe comptable la refuse (SKILL.md,
   « Passe finale avant publication »).

````markdown
# Plan QA : <court périmètre>

## Vue d'ensemble

- **Thème / PRD** : <thème recetté, ou #<issue-prd> — titre>
- **Issues dans le périmètre** : #<a>, #<b>, #<c>
- **Surfaces couvertes** : <celles que le projet possède, d'après la config>
- **Comportements visibles par l'utilisateur dans le périmètre** :
  - <une puce par comportement — langage clair, termes du domaine>
- **Hors périmètre** : <puces>
- **État de départ supposé** : <ex. données vierges, fixtures X seedés, flag Z activé>

## Paliers de sévérité

- **Bloquant** : fuite de sécurité, accès entre comptes, perte de données, entrée dangereuse
  acceptée, workflow central impossible, crash, artefact produit inutilisable.
- **Majeur** : mauvais comportement métier, garde-fou manquant, erreur masquée par un message
  générique, traitement échoué sans erreur exploitable, attente qui ne se termine jamais.
- **Mineur** : formulation, finition visuelle, état vide non bloquant, message peu clair mais
  récupérable.

## Types de case

Chaque case porte son type juste après la case à cocher, pour se jouer sans décision. Une case
**Commande** tient sa commande exacte dans un seul segment entre accents graves, puis ` → ` et son
attendu sur la ligne même de la case : elle se déroule telle qu'écrite, comparée à son attendu. Une
case **Observation** — rendu, état d'écran, console, ergonomie — porte de même ` → ` et son attendu
sur sa première ligne, et se joue avec le mainteneur. Une case qui couvre un critère d'acceptation
le cite en fin de texte, avant toute annotation : `(C1)` ou `(C1, C3)`.

## Saisie d'échec

Quand une case échoue, l'intake de `execution-qa/references/gabarit-intake-echec.md` s'écrit —
dans un fichier, ou en commentaire de l'issue du plan —, ses champs sans contenu supprimés, jamais
laissés vides. La session de consignation `bug-vers-issue` le reçoit en argument, dans son mode
piloté par un plan : le numéro du plan, l'ancre de la case, le chemin ou l'URL de l'intake.

## Données de test

- **Fixtures principaux** : <liste, chemins vérifiés contre le dépôt>
- **Fixtures invalides** : <liste>
- **Attentes du cas de référence** : <le cas échéant>

---

## Phase 0 — Préliminaires

**Objectif** : prouver que l'application **démarre et est joignable** dans un environnement réel.
La CI prouve que le code compile et que les tests passent ; elle ne prouve pas qu'il tourne ici.
Ne rien recetter d'autre si cette phase est rouge.

**Checklist** :
- [ ] **Commande** — `<clés d'environnement comparées à l'exemple versionné>` → aucune manquante.
- [ ] **Commande** — `<commande "run local" de la config>` → l'application démarre.
- [ ] **Commande** — `<état des services dont elle dépend>` → chacun monté et joignable.
- [ ] **Commande** — `<url, commande ou point d'entrée, par surface exposée>` → la surface répond.
- [ ] **Commande** — `<démarrage façon production, une valeur par défaut non sûre>` → refusé.

**Règle d'arrêt** : si l'application ne démarre pas, rien d'autre n'est recettable.

---

## Phase 1 — Sécurité & Propriété

*(Section à inclure uniquement si le projet a de l'authentification et des ressources liées à un
utilisateur. Sinon, elle n'apparaît pas dans le plan.)*

**Objectif** : prouver qu'un utilisateur ne peut ni voir ni modifier les ressources d'un autre.

**Préconditions** : deux comptes distincts existent, le premier possède au moins une ressource.

- [ ] **Commande** — `<appel d'une ressource protégée, sans authentification>` → refus attendu.
- [ ] **Observation** — une session à l'authentification invalide, puis expirée → refus attendu,
      session vidée côté client.
- [ ] **Commande** — `<liste des ressources avec le jeton du compte A>` → volume attendu.
- [ ] **Commande** — `<un geste sur le compte A, jeton du compte B>` → code conforme à la politique
      anti-énumération du projet, une case par geste — liste, lecture, modification ou export.
- [ ] **Commande** — `<journaux du serveur, queue bornée>` → aucune erreur serveur sur les refus.
- [ ] **Commande** — `<requête sur les ressources du compte A>` → aucune donnée croisée persistée
      pendant les actions rejetées.

**Règle d'arrêt** : toute donnée visible entre comptes est bloquante.

---

## Bloc de fonctionnalité : Issue #<N> — <Titre court>

**Source** : #<N> | thème/PRD <ref> | commits de livraison : `<sha1>`, `<sha2>`

**Objectif** : <le comportement visible par l'utilisateur, en une phrase>

**Critères d'acceptation** (depuis #<N>) :
- **C1** — <critère 1>
- **C2** — <critère 2>

<!--
  Une sous-section par surface QUE CE PROJET POSSÈDE. Supprimer celles qui ne s'appliquent pas —
  ne pas les conserver vides. Exemples de sous-sections selon les cas :
-->

**Point d'entrée (API / CLI / commande)** :
- [ ] **Commande** — `<appel avec entrée valide>` → `<résultat, code, forme de sortie>` (C1).
- [ ] **Commande** — `<appel avec entrée invalide>` → `<erreur visible et exploitable>` (C2).

**Interface** :
- [ ] **Observation** — `<surface>` vide, en chargement, en succès, en erreur → chaque état affiché.
- [ ] **Observation** — une action en échec → le détail de l'erreur réelle est visible, pas
      remplacé par un message générique.
- [ ] **Observation** — une action en attente → les contrôles sont neutralisés.
- [ ] **Observation** — la console et le réseau → propres, aucune erreur inexpliquée.

**Persistance** :
- [ ] **Commande** — `<requête sur l'enregistrement>` → il existe, avec les champs et le
      rattachement au propriétaire.
- [ ] **Commande** — `<requête sur les tentatives rejetées>` → aucun enregistrement résiduel.

**Traitements asynchrones** :
- [ ] **Commande** — `<état du traitement>` → état terminal de **succès**.
- [ ] **Commande** — `<état du traitement, sur une variante d'échec>` → état terminal d'**échec**,
      avec erreur exploitable.
- [ ] **Commande** — `<journaux du service, queue bornée>` → aucune exception non gérée.

**Artefacts produits** :
- [ ] **Commande** — `<inspection du fichier / export produit>` → au bon emplacement, au bon format.
- [ ] **Commande** — `<listage du stockage>` → originaux préservés, rien pour les entrées rejetées.

**Règle d'arrêt** : <quand s'arrêter et trier avant de continuer>

**Indices de sévérité** : <les défaillances probables de ce bloc, pré-classées>

---

## Phase R — Régression

**Objectif** : les parcours existants fonctionnent toujours après cette livraison. Uniquement des
parcours **manuels** : la non-régression automatisée est le travail de la CI.

- [ ] **Commande** — `<commande du parcours antérieur 1>` → il fonctionne toujours de bout en bout.
- [ ] **Observation** — `<action du parcours antérieur 2>` → il fonctionne toujours.
- [ ] **Observation** — la console, le réseau et les journaux des surfaces antérieures → aucun
      nouveau bruit.

**Règle d'arrêt** : une régression sur un comportement déjà livré est au moins majeure.

---

## Phase Finale — Définition du Terminé

- [ ] **Observation** — chaque case des phases incluses → `[x]`, ou annotée `N/A` ou `BLOQUÉ`
      avec sa raison, ou `accepté` avec sa décision.
- [ ] **Observation** — chaque bloc de fonctionnalité → entièrement traité.
- [ ] **Observation** — chaque constat bloquant → corrigé, ou explicitement accepté avec la
      décision consignée.
- [ ] **Observation** — chaque constat majeur → un lien vers son issue de bug consignée ou vers sa
      petite PR, ou une décision `reporté` explicite.
- [ ] **Observation** — les actions en échec → rejouées après correction.

---

## Index des constats

*(La session `bug-vers-issue` ajoute les liens ici à mesure qu'elle consigne les bugs de la campagne — son étape 7.)*

- 🔴 #<numéro-issue-bug> — <titre court> — phase / bloc : `<emplacement>`
````

La dernière ligne, modèle d'une entrée de l'Index des constats, ne se recopie pas dans le plan
publié : la passe comptable refuserait ses espaces réservés (SKILL.md, « Passe finale avant
publication », « Marqueurs »).
