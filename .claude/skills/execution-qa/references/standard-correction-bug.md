# Standard de correction d'un bug de QA

La session de QA ne corrige jamais : un échec se qualifie (`SKILL.md` §4, option (a)), et sa correction passe par `cycle-pr`, dans sa propre session, sur l'issue consignée ou, correctif évident, sur une petite PR sans issue (option (c)). Ce standard vaut pour cette session `cycle-pr` quand elle corrige un bug trouvé en QA.

## Standard minimal

1. Reproduire le chemin en échec avec la plus petite commande / séquence UI.
2. Classifier la sévérité (bloquante / majeure / mineure) et la phase / le bloc où elle se situe.
3. Lire la plus petite surface de code pertinente : la route, le composant, le worker, la migration qui détient l'invariant.
4. Trouver la cause racine. Ne pas s'arrêter au symptôme.
5. Ajouter ou mettre à jour un test ciblé qui échouerait avant la correction quand c'est faisable.
6. Implémenter la plus petite correction architecturale propre — épouser la forme du module existant et la propriété.

## La reprise de la case

La case ne se rejoue pas dans la session qui a corrigé : elle se rejoue dans une session de QA neuve, démarrée sur le numéro du plan une fois la correction mergée, dont le §2 trouve la case (`SKILL.md` §2, « La reprise »). Passée, la ligne entière devient `- [x] <texte de la case> — corrigé par #<PR>, <date>`, **sans** `🔴 BUG #N` ni `🔴 PR #<M>`.

## Inacceptable

- Traiter en cas particulier seulement la fixture observée alors que le bug est général.
- Cacher des échecs backend dans le frontend.
- Avaler les exceptions du worker sans persister une erreur de job.
- Changer le comportement de l'API sans tests.
- Corriger l'affichage frontend alors que l'état backend reste faux.
- Démarrer une phase / un bloc dépendant alors qu'un constat amont bloquant n'est pas résolu.

## Signaux d'une bonne correction

- La correction vit là où l'invariant appartient (modèle, validateur, gateway — pas le contrôleur en après-coup).
- Les tests couvrent la classe de régression, pas seulement la fixture exacte.
- Le comportement public existant est préservé sauf pour le bug.
- Les erreurs restent exploitables pour les utilisateurs / opérateurs (pas d'avalement).
- Les logs et l'état BD restent cohérents avec la réponse de l'API.
