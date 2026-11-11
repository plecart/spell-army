# Bloc par issue : exemple complet

Exemple rempli montrant à quoi ressemble un bloc de fonctionnalité par issue. Sers-t'en pour le
**niveau de précision attendu** — ne le copie pas mot pour mot.

> ⚠️ **Cet exemple porte sur une application web multi-comptes avec upload et traitement
> asynchrone.** C'est un archétype parmi d'autres, pas le modèle à reproduire. Les sous-sections
> d'un vrai bloc sont celles des **surfaces déclarées dans `.claude/pipeline.config.md`** : sur une
> CLI, « Vérifications Frontend » n'existe pas ; sur une bibliothèque, ni persistance ni worker. Ce
> qu'il faut retenir, c'est la **granularité** — routes réelles, codes réels, champs réels — pas la
> liste des sections.

L'exemple porte sur une issue hypothétique `#127 — L'upload de document de connaissance accepte le PDF et rejette les fichiers trop volumineux`, qui était la deuxième issue dérivée de `PRD #100 — Base de connaissances client v2`.

---

## Bloc de fonctionnalité : Issue #127 — L'upload de document de connaissance accepte le PDF et rejette les fichiers trop volumineux

**Source** : #127 | PRD #100 | commits de livraison : `a1b2c3d`, `e4f5g6h`

**Objectif** : Un utilisateur connecté peut uploader un PDF jusqu'à 25 Mo dans la base de connaissances de son client. Les fichiers de plus de 25 Mo ou dont les magic bytes ne correspondent pas sont rejetés avant qu'aucune ligne BDD ou objet de stockage ne soit créé.

**Critères d'acceptation** (depuis #127) :
- **C1** — Uploader un PDF valide de 1 Mo en tant qu'utilisateur A → succès, le document apparaît dans la liste de connaissances.
- **C2** — Uploader un PDF de 30 Mo → rejet avec la taille dans le message d'erreur.
- **C3** — Uploader un fichier `.pdf` dont le contenu réel est un PNG → rejet avec une erreur de magic bytes.
- **C4** — L'utilisateur B ne peut pas voir le document uploadé par l'utilisateur A.

**Vérifications Backend / API** :
- [ ] **Commande** — `curl -s -o $QA_RUN/upload.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN_A" -F file=@fixtures/valid-1mb.pdf https://app.local/api/clients/$CLIENT_A_ID/knowledge` → `201`, le corps écrit dans `$QA_RUN/upload.json` (C1).
- [ ] **Commande** — `jq -c '{id, original_filename, status}' $QA_RUN/upload.json` → `id` renseigné, `original_filename` à `valid-1mb.pdf`, `status` à `pending_extraction` ; les cases suivantes relisent cet `id` dans ce fichier (C1).
- [ ] **Commande** — `curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $TOKEN_A" -F file=@fixtures/oversized-30mb.pdf https://app.local/api/clients/$CLIENT_A_ID/knowledge` → le corps a `error: "FILE_TOO_LARGE"`, `max_bytes: 26214400`, puis `413` (C2).
- [ ] **Commande** — `curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $TOKEN_A" -F file=@fixtures/png-renamed-as-pdf.pdf https://app.local/api/clients/$CLIENT_A_ID/knowledge` → le corps a `error: "INVALID_MAGIC_BYTES"`, puis `422` (C3).
- [ ] **Commande** — `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_B" https://app.local/api/clients/$CLIENT_A_ID/knowledge` → `403`, inter-locataires (C4).
- [ ] **Commande** — `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_B" https://app.local/api/clients/$CLIENT_A_ID/knowledge/$(jq -r .id $QA_RUN/upload.json)` → `404`, politique anti-énumération (décision projet : 404 plutôt que 403) (C4).
- [ ] **Commande** — `docker compose logs --tail=200 api | grep -c 'POST /api/clients/.*/knowledge.* 500'` → affiche `0` (code `1` : `grep` sans correspondance) : aucun 500 sur les échecs de validation.

**Vérifications Frontend** :
- [ ] **Observation** — ouvrir `https://app.local/clients/$CLIENT_A_ID/knowledge` en utilisateur A, session vierge → la page de connaissances du client A s'affiche.
- [ ] **Observation** — l'état vide, l'utilisateur A sans aucun document → le CTA « Uploadez votre premier document » est affiché.
- [ ] **Observation** — pendant l'upload → le bouton d'upload est désactivé et un spinner est visible.
- [ ] **Observation** — l'upload valide → la ligne du document apparaît avec `status: pending_extraction`, puis passe à `ready` une fois le polling terminé (C1).
- [ ] **Observation** — l'upload de 30 Mo → l'erreur visible affiche « Le fichier dépasse 25 Mo » : détail backend remonté, pas « Une erreur est survenue » (C2).
- [ ] **Observation** — l'échec de magic bytes → l'erreur visible affiche « Le contenu du fichier ne correspond pas à son extension » (C3).
- [ ] **Observation** — le polling, une fois le statut `ready` ou `failed` → il s'arrête, aucun intervalle qui fuit après la terminalisation de la ligne.
- [ ] **Observation** — la console du navigateur pendant les trois tentatives d'upload → aucune erreur inexpliquée.
- [ ] **Observation** — l'onglet Réseau → aucun 500, aucune requête émise après un statut terminal.

**Vérifications BDD / stockage** :
- [ ] **Commande** — `docker compose exec db psql -U app -c "select id, client_id, status, error, finished_at from knowledge_documents where client_id = '$CLIENT_A_ID'"` → une ligne, `status` à `ready` (ou transitoirement `pending_extraction` pendant le polling), `error` vide (C1).
- [ ] **Commande** — `docker compose exec db psql -U app -c "select count(*) from knowledge_documents where original_filename like '%oversized%' or original_filename like '%png-renamed%'"` → `0` : aucune ligne pour les tentatives rejetées (C2, C3).
- [ ] **Commande** — `cmp storage/clients/$CLIENT_A_ID/knowledge/$(jq -r .id $QA_RUN/upload.json)/original.pdf fixtures/valid-1mb.pdf` → aucune sortie, code `0` : l'original est préservé octet pour octet (C1).
- [ ] **Commande** — `ls storage/clients/$CLIENT_A_ID/knowledge/` → un seul dossier, l'`id` du document valide : aucun objet de stockage pour les tentatives rejetées (C2, C3).

**Vérifications Worker / logs** :
- [ ] **Commande** — `docker compose logs --tail=200 api | grep -E 'knowledge_upload_rejected|Traceback'` → deux lignes `knowledge_upload_rejected`, une pour la taille, une pour les magic bytes, et aucune `Traceback` (C2, C3).
- [ ] **Commande** — `docker compose logs --tail=200 worker | grep "$(jq -r .id $QA_RUN/upload.json)"` → le job d'extraction du PDF valide passe de `started` à `completed` (C1).
- [ ] **Commande** — `docker compose logs --tail=200 api worker | grep -c 'Unhandled exception'` → affiche `0` (code `1` : `grep` sans correspondance).

**Règle d'arrêt** : Un 500 sur tout upload rejeté, ou une ligne créée pour un upload rejeté, est **bloquant** — déposer via `bug-vers-issue` et ne pas continuer les blocs de fonctionnalité qui dépendent de la bonne isolation des documents de connaissance.

**Indices de sévérité** :
- Visibilité inter-locataires d'un document de connaissance → bloquant.
- Upload rejeté qui crée une ligne BDD ou un objet de stockage → bloquant.
- Erreur UI générique remplaçant le détail backend → majeur.
- Polling qui ne s'arrête pas à l'état terminal → majeur.
- Différences de formulation dans le message d'erreur → mineur.

---

## Ce que cet exemple illustre

- Chaque critère d'acceptation de l'issue est mappé à au moins une vérification explicite.
- Chaque case porte son type et son attendu : **Commande**, une commande copiable telle quelle, ou **Observation**, ce qui se juge avec le mainteneur ; elle cite en fin de texte les critères `C<k>` qu'elle couvre.
- Chaque appel d'API épingle la route et le code de statut, et un champ de corps spécifique quand la réponse en porte un — affiché, ou relu dans le fichier où la case l'écrit.
- Les vérifications frontend couvrent les états vide, chargement, succès, erreur — plus le comportement de polling — et s'ancrent à une vraie URL.
- Les vérifications BDD et stockage incluent la vraie table et la vraie disposition des chemins (vérifiée contre le diff).
- Les vérifications worker / logs bornent la queue de logs et nomment la ligne de log attendue.
- Les indices de sévérité préparent l'utilisateur aux décisions de triage avant qu'elles n'arrivent, pour que les défaillances pendant l'exécution soient rapides à classifier.
