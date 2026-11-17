# ADR 0005 — Serveur MCP : SDK officiel v2, serveur bas niveau, sans état

- **Statut** : accepté le 2026-11-17
- **Source** : ADR 0001 (« Back-office », « Services partagés », « File d'attente ») ; ADR 0004
  § « Serveur MCP et secrets » ; issue #11, « Décisions verrouillées » (la bibliothèque se choisit à
  l'implémentation et se trace dans un ADR)

## Contexte

Le serveur MCP est servi par l'application Next.js à `/api/mcp` (ADR 0001, « Back-office »). L'issue
#11 le veut en HTTP « streamable », sans état, sans SSE ni Redis. Chaque appel d'outil valide
strictement ses entrées et écrit une ligne d'audit, y compris quand l'entrée est refusée (issue #11,
critères d'acceptation).

## Décisions

| Sujet | Décision | Origine |
|---|---|---|
| Bibliothèque | `@modelcontextprotocol/server` 2.x, le SDK TypeScript officiel (spécification MCP du 2026-07-28), avec Zod 4. | Accepté le 2026-11-17 |
| Transport | `createMcpHandler(fabrique, { responseMode: "json", legacy: "reject", maxSubscriptions: 0 })`, fourni par le SDK : un gestionnaire web standard `(Request) => Promise<Response>`, créé une fois et monté dans la route `apps/web/app/api/mcp/route.ts`. La fabrique tourne à chaque requête : rien n'est gardé d'une requête à l'autre. Seule la spécification 2026-07-28 est servie. | Accepté le 2026-11-17 |
| Sans SSE | Quatre voies mènent le gestionnaire à répondre en SSE, chacune fermée. Un échange qui émet un message avant son résultat : `responseMode: "json"` répond toujours d'un seul corps JSON. Le repli sans état de la génération 2025, qui répond en flux SSE d'un message : `legacy: "reject"` le refuse par l'erreur `-32022`. Un flux `subscriptions/listen` : `maxSubscriptions: 0` le refuse avant de l'ouvrir, et le serveur n'annonce aucun `listChanged`, donc aucun client n'en ouvre d'office. GET et DELETE, opérations de session de 2025 : `405`. Le test « sans SSE » de `apps/web/test/point-d-entree.test.ts` passe par chacune, et par un échange nominal. | Accepté le 2026-11-17 |
| Serveur bas niveau | La fabrique rend un `Server` bas niveau dont l'application écrit `tools/list` et `tools/call`, pas un `McpServer`. Avec `McpServer.registerTool`, une entrée qui échoue au schéma est rejetée par le SDK avant le gestionnaire : la ligne d'audit en erreur ne s'écrirait pas. Le SDK marque `Server` `@deprecated` au profit de `McpServer` pour l'API de haut niveau, et le garde pour les cas avancés : celui-ci en est un. L'enrobage commun de `apps/web/app/mcp/` valide l'entrée (schéma Zod strict), appelle le service et écrit l'audit ; `tools/list` publie le schéma JSON tiré du même schéma Zod. | Accepté le 2026-11-17 |
| Authentification | Contrôlée dans la route, avant le SDK : en-tête `Authorization: Bearer`, empreintes SHA-256 comparées par `crypto.timingSafeEqual` (ADR 0004). Le SDK ne lit ni ne vérifie aucun jeton. | Accepté le 2026-11-17 |

**Écartés.** `mcp-handler` 2.x (Vercel Labs) : une surcouche du même SDK v2 (traces OpenTelemetry,
`withMcpAuth` pour OAuth), sans usage ici avec un jeton fixe. `@modelcontextprotocol/sdk` 1.x :
remplacé par la v2. `McpServer.registerTool` : voir « Serveur bas niveau ». Le repli 2025 du SDK
(`legacy: "stateless"`, son défaut) : il sert les clients qui ouvrent encore en 2025, au prix de
réponses SSE, alors que Claude Code négocie la spécification 2026 (« Vérifié »).

## Conséquences

- Un outil s'ajoute au registre de `apps/web/app/mcp/` : un nom, une description, un schéma Zod
  strict et l'appel d'un service. L'enrobage lui donne la validation, la transaction et l'audit.
- Seul un client qui négocie la spécification 2026-07-28 se branche ; un client qui ouvre en 2025
  reçoit l'erreur `-32022`, qui nomme la version servie. Claude Code ouvre en 2026 sous un drapeau
  distant actif par défaut. S'il revenait au handshake de 2025 — drapeau coupé, ou
  `MCP_PROTOCOL_NEGOTIATION=legacy` dans son environnement —, la sortie serait
  `legacy: "stateless"`, et elle rouvre la décision « sans SSE ».
- Les tests branchent le `Client` officiel `@modelcontextprotocol/client` avec
  `versionNegotiation: { mode: "auto" }`, comme Claude Code : sans cette option, il ouvre en 2025.
- Une montée majeure du SDK se relit contre ce que l'application écrit elle-même : `tools/list` et
  `tools/call`, et les quatre voies de « Sans SSE ».

## Vérifié

- `createMcpHandler`, `handler.fetch` web standard, fabrique appelée à chaque requête,
  `responseMode: 'json'` : [Serve over HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http),
  lue le 2026-11-17.
- Entrée invalide rejetée avant le gestionnaire (« the handler never runs ») :
  [Tools](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools), lue le 2026-11-17.
- La fabrique rend un `McpServer` ou un `Server` :
  [Low-level server](https://ts.sdk.modelcontextprotocol.io/v2/advanced/low-level-server.html), lue le
  2026-11-17.
- Options `legacy` (`'stateless'` par défaut ; `'reject'` : « There is no 2025 serving in this
  mode »), `maxSubscriptions`, et flux `subscriptions/listen` toujours en SSE quel que soit
  `responseMode` : commentaires de types de `createMcpHandler`, `@modelcontextprotocol/server` 2.4.0,
  lus le 2026-11-17. Le client ouvre en 2025 sans `versionNegotiation` (« The default is
  'legacy' ») : types du `Client`, `@modelcontextprotocol/client` 2.4.0, lus le même jour.
- Sondes jetables hors dépôt, le 2026-11-17, SDK 2.4.0, un `Server` bas niveau servi par
  `createMcpHandler` :
  - avec `responseMode: "json"` seul, `tools/list` publie le schéma strict
    (`additionalProperties: false`), `tools/call` reçoit les arguments bruts, sans validation du
    SDK, et une requête de 2025 reçoit `text/event-stream` (un message `event: message`) ;
  - avec les trois options retenues, le `Client` en `versionNegotiation: { mode: "auto" }` ouvre par
    `server/discover` puis liste les outils (`200`, `application/json`) ; le même client sans
    l'option ouvre par `initialize` en `2025-11-25` et reçoit `400`, erreur `-32022` ;
    `subscriptions/listen` reçoit `200`, `application/json`, erreur `-32603` « Subscription limit
    reached » ; GET et DELETE reçoivent `405`, `application/json`.
- Claude Code 2.1.295, version installée sur le poste du mainteneur : pour un serveur HTTP, il
  négocie l'ère du protocole en mode `auto` sous le drapeau `tengu_mcp_protocol_negotiation_http`,
  actif par défaut ; `MCP_PROTOCOL_NEGOTIATION=legacy` ou une liste de refus distante le ramènent
  au handshake de 2025. Lu dans le binaire installé le 2026-11-17, pas dans une documentation.
- Versions au registre npm le 2026-11-17 : `@modelcontextprotocol/server` 2.4.0, `mcp-handler` 2.4.0
  (pair requis : `@modelcontextprotocol/server` ^2), `next` 16.4.6, `zod` 4.6.7.
- `context7` était hors quota ce jour-là : la documentation a été lue à la source.

## Non vérifié

- Le branchement réel de Claude Code sur ce serveur : constaté à la halte humaine de la PR de #11.
