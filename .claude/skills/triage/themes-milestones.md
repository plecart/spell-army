# Thèmes (milestones GitHub)

Pendant le triage, chaque issue est rattachée à un **thème** afin de regrouper les issues par
sujet. Le thème est matérialisé par un **milestone GitHub**.

Les milestones sont utilisés ici de façon **purement thématique** : un nom et une description
courte, **aucune date d'échéance ni sémantique de release**. C'est un détournement assumé du
milestone GitHub comme étiquette de regroupement.

## Une seule taxonomie : les domaines

Les **domaines** déclarés dans `.claude/pipeline.config.md` (section « Périmètre ») sont la
**source de vérité** du découpage par sujet. Un thème n'est rien d'autre que la **matérialisation
GitHub d'un domaine** : même nom, même périmètre. On ne maintient jamais deux vocabulaires
concurrents.

| | Domaine (`pipeline.config.md`) | Thème (milestone GitHub) |
|---|---|---|
| Rôle | **cadrer le travail** — `vers-issues`, `plan-qa`, `cycle-pr` | **regrouper les issues** côté GitHub |
| Défini par | `init-projet`, au setup ou en reconfiguration | `triage`, à partir du domaine |
| Nom | `Authentification` | `Authentification` — identique |

Autrement dit : le domaine se déclare une fois, le thème se crée à la demande **à son image**.

## Règle

- Toute issue qui **avance dans le triage** (`needs-triage`, `needs-info`, `ready-for-agent`,
  `ready-for-human`) est rattachée à **exactement un thème**.
- Une issue fermée en **`wontfix` est exemptée** — on ne lui assigne pas de thème.
- Comme un milestone GitHub est unique par issue, « exactement un thème » est garanti par
  construction.

## Choisir un thème

1. **Lire les domaines déclarés** dans `.claude/pipeline.config.md`. Chercher celui qui couvre
   l'issue **par concept, pas par mot-clé** — « écran de connexion » relève du domaine
   `Authentification`, « lenteur au chargement » de `Performance`.
2. **Rattacher l'issue** par `milestone attach <N> --title <Domaine> --description <périmètre>`
   (« Commandes ») : un milestone qui porte déjà ce nom la reçoit ; sinon il est créé au nom
   exact du domaine (création automatique, sans demande de permission). Un thème fermé est refusé.
3. **Annoncer au mainteneur** le thème créé, quand la sortie dit qu'il l'a été.
4. **Si aucun domaine ne couvre l'issue**, c'est un signal — ne pas créer de thème orphelin en
   silence. Deux cas, à trancher avec le mainteneur :
   - l'issue est **hors du périmètre du projet** → candidate à `wontfix` (voir
     [hors-scope.md](hors-scope.md)) ;
   - la **liste de domaines est incomplète** → proposer une **session `init-projet` distincte**,
     en mode reconfiguration, qui ajoute le domaine : les domaines de
     `.claude/pipeline.config.md` s'amendent par une PR. Elle est démarrée avec
     `use_worktree: true` : elle écrit sur une branche, jamais dans le dossier que partagent les
     sessions de tri. Le thème se crée au tri suivant.

Cette boucle est ce qui garde les deux listes alignées dans le temps : un thème ne peut pas
apparaître sans que le domaine correspondant existe.

## Nommer un thème

Le nom du thème **est** le nom du domaine, repris tel quel — court, lisible, en **français** :
`Authentification`, `Facturation`, `Performance`, `Imports CSV`. La description d'une ligne du
milestone reprend le périmètre du domaine (« Connexion, sessions, gestion des comptes et
permissions »).

## Commandes

Le mapping rôle → label de `.claude/pipeline.config.md` ne concerne pas les thèmes ; les milestones
sont des objets GitHub natifs. Le dépôt cible (`owner/repo`) et les domaines viennent de cette même
config. La lecture reste une commande `gh` ; les écritures passent par
`.claude/skills/cycle-pr/scripts/ecriture-relue.py`, qui les relit.

```bash
# Lister les thèmes existants (titres + descriptions)
gh api "repos/{owner}/{repo}/milestones" --jq '.[] | "\(.title) — \(.description)"'

# Rattacher une issue à un thème, créé ouvert et sans date s'il manque
python .claude/skills/cycle-pr/scripts/ecriture-relue.py milestone attach <numéro> \
  --title "Authentification" --description "Connexion, sessions, gestion des comptes et permissions"

# Fermer un thème vidé
python .claude/skills/cycle-pr/scripts/ecriture-relue.py milestone close --title "Authentification"
```

## Renommer ou fusionner des thèmes

Les thèmes dérivent avec le temps. Quand deux thèmes se recouvrent ou qu'un nom devient flou :

- Le mainteneur peut demander une fusion. Réassigne chaque issue du thème absorbé par
  `milestone attach <N> --title <cible>` — la sortie nomme le thème remplacé —, puis ferme le
  milestone vidé par `milestone close --title <absorbé>`, qui refuse un thème pas vidé.
- **Répercute le changement sur les domaines** de `.claude/pipeline.config.md`, par la même
  session `init-projet` distincte, par une PR : renommer ou fusionner un thème sans toucher au
  domaine recrée exactement la divergence que cette page évite.
- Ne supprime pas un milestone qui porte encore de l'historique utile ; ferme-le plutôt.

Ces opérations de réorganisation ne se font que **sur demande explicite** du mainteneur —
l'auto-création ne concerne que l'assignation d'une issue en cours de triage.
