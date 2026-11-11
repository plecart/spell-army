# Gabarit d'intake d'échec

Utiliser ce gabarit dès qu'une case échoue. L'intake s'**écrit** : en commentaire de l'issue du plan, publié par `comment <plan> --body-file` depuis un fichier du scratchpad de la session, jamais de l'arbre de la campagne (`SKILL.md` §4, étape 2), ou, en mode de repli markdown, dans un fichier hors de l'arbre de la campagne et de tout worktree éphémère. La session `bug-vers-issue` distincte qui le consomme le reçoit en argument — son URL ou son chemin — quand l'utilisateur choisit l'option (a) « consigner maintenant » : elle ne lit rien d'autre de la session de QA.

Les champs sans contenu pertinent sont supprimés, pas laissés vides. Ne jamais fabriquer une valeur.

```text
Bloc QA :         <nom de la phase ou du bloc par issue, ex. « Phase 2 — Upload de connaissances » ou « bloc Issue #127 »>
Case :            <texte exact de la ligne de case en échec, copié depuis le plan>
Issue(s) :        <numéros d'issues d'implémentation liées, ex. #127>
Action :          <commande exacte ou séquence UI exécutée>
Attendu :         <ce que le plan disait qu'il devait se passer>
Observé :         <ce qui s'est réellement passé, en langage clair>
URL / endpoint :  <route, URL de page, ou surface>
Charge utile :    <corps de requête si API ; masquer les secrets>
Console :         <copier-coller des erreurs Console, borné>
Réseau :          <méthode, URL, statut, extrait du corps de réponse>
Logs API :        <queue de logs bornée — `docker compose logs --tail=200 api` filtré sur la fenêtre du run>
Logs worker :     <queue de logs bornée — `docker compose logs --tail=200 worker`>
Lignes BD :       <SQL exécuté + extrait du résultat>
Stockage :        <chemins vérifiés + ce qui a été trouvé / non trouvé>
Sévérité :        <bloquante | majeure | mineure — classification initiale>
Décision requise : <si l'échec expose une ambiguïté de politique, l'énoncer ici, sinon supprimer>
```

## Règles de dimensionnement

- Champs Console / Réseau / logs : borner aux lignes pertinentes, pas aux flux complets. Si un extrait de 5 lignes raconte l'histoire, c'est suffisant.
- Lignes BD : inclure le SQL, puis soit le compte, soit les colonnes qui comptent. Ne pas déverser des tables entières.
- Charge utile : masquer les jetons, cookies et données personnelles avant de coller.

## Table d'indication de sévérité

| Symptôme | Sévérité probable |
|---|---|
| Données inter-locataires visibles / modifiables | Bloquante |
| Perte de source ou upload corrompu accepté | Bloquante |
| Workflow central impossible | Bloquante |
| Crash API ou worker (500, traceback) | Bloquante sauf si trivialement environnemental |
| Mauvais comportement métier, garde-fou manquant | Majeure |
| Erreur backend masquée par un wrapper UI générique | Majeure |
| Le polling ne s'arrête jamais sur un statut terminal | Majeure |
| Job échoué sans erreur exploitable | Majeure |
| Formulation, finition visuelle | Mineure |
| Phrase d'état vide peu claire mais récupérable | Mineure |

La sévérité enregistrée ici est un point de départ — `bug-vers-issue` peut la réviser après exploration du code.
