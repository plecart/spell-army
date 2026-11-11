# Gabarit de commentaire de synthèse de phase

Utiliser ceci pour publier un dépôt de preuve plus lourde en commentaire GitHub sur l'issue du plan de QA, après qu'une phase ou un bloc par issue atteint un état terminal. Garde le corps de l'issue léger tout en préservant la preuve.

Sauter le commentaire pour les blocs verts triviaux (une Phase 0 de préflight qui a juste passé chaque garde-fou, par exemple) — les annotations en ligne sur chaque case en disent déjà assez.

La session le rédige et le publie elle-même : `python .claude/skills/cycle-pr/scripts/ecriture-relue.py comment <plan> --body-file <commentaire.md>`, relu sous l'`id` publié. La preuve lourde — commandes, lignes BD, logs — vient du fichier où le `releveur` l'a rassemblée (`SKILL.md`, « Délégation »).

```markdown
## Phase / bloc : <nom>

**Statut** : passé | passé_avec_décision | partiel | bloqué | échoué
**Par surface** : <une ligne par surface RÉELLEMENT testée dans ce bloc — état passé / partiel.
Ne jamais lister une surface que le projet n'a pas, ni en déclarer une qui n'a pas été testée.>
**Date** : <date ISO>

### Commandes exécutées

```bash
<les commandes réellement exécutées pendant ce bloc, tirées du fichier du `releveur`>
```

### Preuve

- **API** : statut / comptes / nombres de lignes / codes de statut qui comptent
- **Frontend** : URL(s) testée(s), compte(s) utilisé(s), états observés
- **BD** :

```sql
<la requête SQL exécutée>
```

```text
<les lignes ou comptes retournés>
```

- **Logs** (bornés) :

```text
<copier-coller des lignes de log pertinentes, ex. 20 dernières lignes du worker filtrées sur la fenêtre du run>
```

### Décisions prises

- <une puce par décision de politique prise par l'utilisateur, avec comportement choisi + date>

### Constats consignés pendant ce bloc

- 🔴 #<issue-bug> — <titre>
- 🔴 #<issue-bug> — <titre>

### Suivant

- <quelle phase / quel bloc s'exécute ensuite, ou ce qui bloque la progression>
```

## Règles de dimensionnement

- Blocs de code / logs encadrés et bornés — pas de sortie `--follow`.
- Un commentaire par phase ou par bloc par issue, pas un commentaire par case.
- Si le bloc n'a eu aucun échec ni aucune décision de politique, préférer un commentaire d'un paragraphe au gabarit complet.
