# Étude 03 — Chaîne vidéo et 3D (phase 2)

Date : 2026-11-11. Légende : **[V]** vérifié sur page/doc lue aujourd'hui ; **[S]** supposé ou déduit, à tester.

## Verdict en 5 lignes

1. **Moteur : Remotion + `@remotion/three` (React Three Fiber)**. Il est piloté par `useCurrentFrame()`, donc déterministe par construction, et il est dans le même écosystème React/Next que le site.
2. **Source unique des personnages : un paquet TypeScript partagé de composants R3F procéduraux** (primitives + paramètres), pas de glTF. Le site et la vidéo importent le même composant avec les mêmes props.
3. **Rendu : la machine locale du mainteneur d'abord** (`--gl=angle`, GPU disponible), puis GitHub Actions ou Vercel Sandbox si on veut automatiser. Lambda n'est pas justifié pour 1 vidéo/jour.
4. **Son : musique et bruitages CC0 ou issus d'un pack acheté, voix de synthèse optionnelle.** Le texte à l'écran seul est le défaut sûr. Un risque Instagram réel pèse sur la musique.
5. **Écartés ou différés** : MoneyPrinterTurbo (ne détecte pas les tendances), onetake (licence non commerciale), ClaudeAnimationBase, lemo-opuscar, OpenMontage (hors sujet, AGPL). HyperFrames est le seul vrai concurrent, à surveiller.

## Tableau de verdicts par outil

| Outil | Ce que c'est réellement | Maintenance | Utilité ici | Verdict |
|---|---|---|---|---|
| **Remotion** | Vidéo en React, rendu SSR/Lambda/Vercel Sandbox, skills agents officielles (`npx skills add remotion-dev/skills` : best-practices, render, captions, markup…) **[V]**. ~72 k étoiles, 41 k commits **[V]** | Très active **[V]** | Cœur de la chaîne. `ThreeCanvas` expose les hooks Remotion dans R3F **[V]** | **Retenir** |
| **`@remotion/three`** | Pont R3F ↔ Remotion ; `ThreeCanvas`, `useVideoTexture` **[V]**. Utiliser `layout="none"` sur `<Sequence>` dans le canvas **[V]** | Idem | Rend les persos partagés avec le site | **Retenir** |
| **HyperFrames** (HeyGen) | HTML/CSS + animations « seekables » → MP4 via Chrome headless + FFmpeg, Apache 2.0, ~82 k étoiles, 9 skills **[V]**. Adaptateur Three.js via événement `hf-seek` ; l'API d'adaptateurs est « expérimentale v0 » **[V, source tierce pour le détail]** | Active, aucune release listée **[V]** | Concurrent sérieux, licence plus simple. Mais il faut recâbler à la main le rendu Three, et on perd le partage direct de composants React du site. Deux skills sont réservées à Pro **[V]** | **Phase 2 (alternative de repli)** |
| **MoneyPrinterTurbo** | Générateur « sujet → vidéo » : script LLM, voix (Edge TTS…), **stock footage** Pexels/Pixabay, sous-titres, MIT **[V]** | Non vérifiée | **Faux** : la page ne mentionne aucune détection de tendances ou de codes viraux **[V]**. Il écrit un script à partir d'un sujet, c'est tout. Stock footage et pipeline Python sans objet pour de la 3D maison | **Écarter** |
| **onetake** | Skill Claude pour films motion « plan unique », rendu jusqu'à 4K60 **[V]**. Licence **PolyForm Noncommercial** : usage commercial interdit, version Pro à 79 $ **[V]** | 21 commits **[V]** | Orienté motion design de lancement produit, pas données → vidéo. Licence risquée avec un compte à vocation de croissance | **Écarter** |
| **ClaudeAnimationBase** | Kit p5.js/p5.brush « cartoons peints à la main » avec le personnage Clawd, MIT, 15 commits **[V]** | Faible | Esthétique différente, pas de 3D partagée | **Écarter** (lecture d'idées seulement) |
| **lemo-opuscar** | 66 « styles de films en code » pour Claude Code, MIT (code), démos CC BY 4.0, ~30-60 min d'agent par film, réglé pour un modèle précis **[V]** | Active (oct. 2026) **[V]** | Coût en tokens élevé et non déterministe : contraire à « rapide et efficace ». Peut inspirer des styles | **Écarter** |
| **« Open Montage »** | Identifié : `calesthio/OpenMontage`, système agentique où l'agent de code pilote recherche, script, assets et montage ; AGPL-3.0 ; les autres dépôts du même nom sont des forks **[V via recherche, sources divergentes sur les étoiles]** | Active | C'est bien ce que supposait le mainteneur, mais c'est une « usine à gaz » (12 pipelines, 52 outils annoncés) pensée pour la génération d'assets IA. Notre cas est déterministe et piloté par des données | **Écarter** |
| **Openverse** | Moteur de recherche de médias sous licence ouverte (monorepo, code MIT) **[V]**. L'API audio filtre par licence/usage commercial et fournit un texte d'attribution **[S : détails via sources tierces]** | Active | Source de bruitages/musiques. Il faut filtrer **CC0** (ou CC BY avec attribution) ; beaucoup de sons viennent de Freesound avec des licences hétérogènes | **Retenir (source), prudence** |
| **earshot** | Outil local (CLI/MCP) qui « fait écouter » un agent : décrit et compare des sons, critique l'audio, banque de 252 SFX synthétisés par code, MIT **[V]**. Ne mentionne pas Openverse **[V]** | 51 commits, v0.4 **[V]** | Utile comme contrôle qualité et pour des bruitages synthétiques sans licence. Non indispensable | **Phase 2 (optionnel)** |
| **Clipwing Real SFX** | Skill Claude gratuite qui pose des SFX réels sur des frames données, 78 sons UI CC0 fournis, le reste vient de votre bibliothèque ; accepte un « cue list » ou une timeline HyperFrames **[V]** | Non vérifiée | Le principe (cue list → SFX calés) est bon, mais on peut le faire nous-mêmes avec des `<Audio>` Remotion calés sur les frames. Ne relie pas Openverse/earshot **[V]** | **Phase 2 (idée, pas dépendance)** |

**Les trois outils son ne forment pas une chaîne** : aucune des pages lues ne les relie entre eux. Ce regroupement est une hypothèse du mainteneur, non confirmée.

## Réponses aux questions

**Q1 Moteur.** Remotion gagne sur l'identité des persos : le même composant R3F tourne dans Next et dans `ThreeCanvas`. HyperFrames est plus léger (HTML pur, Apache 2.0) mais il n'a pas de pont React ; il faudrait empaqueter la scène Three dans une page statique et la piloter par `hf-seek`. Faisable, mais c'est du code de plus. Remotion a aussi un rendu cloud plus mature (HyperFrames le reconnaît lui-même) **[V]**.

**Q2 Personnages.** Composants R3F procéduraux : primitives (capsule, sphère, cône) + variantes en props (`{espece, couleurPrimaire, chapeau, …}`). Avantages : zéro asset binaire, diff lisible, identité garantie par le code, déterminisme (pas d'horloge). glTF seulement si les formes deviennent complexes. Pièges du rendu headless :
- Three.js ne fonctionne pas avec le renderer GL par défaut de Remotion 4 ; utiliser `angle` **[V]**. Pour le SSR, la config du fichier ne s'applique pas : passer `chromiumOptions: { gl: "angle" }` à `renderMedia()` **[V]**.
- Sans GPU : `swangle` (logiciel), lent **[V]**. Sur GitHub Actions, `angle` échoue en Remotion 4.0 faute de GPU **[V]**. Remotion 5.0 passera `angle` par défaut avec repli logiciel **[V]**.
- `angle` a des fuites mémoire connues : découper les longs rendus **[V]**.
- Ne pas animer dans `useFrame()` ni avec `Date.now()` ou `Math.random()` : tout dérive de `useCurrentFrame()`, aléa semé par un identifiant de personnage **[V pour le principe, S pour la liste d'interdits]**.
- Précharger polices et textures avant le premier frame.

**Q3 Rendu.** Local Windows 11 : gratuit, GPU présent, `--gl=angle`, c'est le plus simple et le plus rapide **[S]**. Lambda : environ 0,02 $ pour 1 minute de vidéo simple **[V]**, mais la scène 3D en `swangle` coûte plus et il faut configurer AWS : sur-dimensionné. Vercel Sandbox : un VM éphémère par rendu, simple (un compte Vercel + un blob), timeout 45 min en Hobby, plus lent que Lambda, coût à vérifier **[V]**. GitHub Actions : template officiel `ubuntu-latest` **[V]**, mais CPU seulement donc lent pour la 3D **[S]** ; à benchmarker. Recommandation : local au début, Sandbox ou Actions quand on veut la cadence quotidienne sans machine allumée.

**Q4 Narration.** Les prix des API de synthèse vocale varient selon des sources tierces contradictoires **[V pour le désaccord]** : ElevenLabs ~0,05-0,10 $ / 1 000 caractères, OpenAI ~0,015 $ avec un risque de dépréciation de ses modèles annoncée pour janvier 2027, Kokoro auto-hébergé gratuit. Aucune source lue ne confirme la qualité du français. Un script de 45 s fait environ 600-800 caractères, donc moins de 0,10 $ par vidéo, coût négligeable. Mais une voix de synthèse est l'élément le plus « AI slop » et lemo-opuscar exclut lui-même certaines voix de sa licence. Recommandation : **texte à l'écran + sous-titres animés dès le début**, voix en option plus tard. L'efficacité réelle sur Reels n'est pas documentée dans mes sources **[S : beaucoup de Reels se regardent sans le son]**.

**Q5 Licences.**
- *Remotion* : licence gratuite pour un particulier (usage commercial inclus), une organisation à but lucratif jusqu'à 3 personnes, ou une association **[V]**. Les automatisations de rendu sont couvertes par la licence gratuite si on y est éligible ; sinon « Automators » à 0,01 $ par rendu, minimum 100 $/mois **[V]**. Sponsoring par une marque : la FAQ ne tranche pas ; si la marque ne reçoit que le MP4, la licence du créateur semble suffire, si elle possède ou exploite le projet Remotion, c'est elle qui doit la licence **[V, interprétation]**. Un changement de licence est annoncé pour Remotion 5.0 **[V]**. À faire : écrire à Remotion avant de signer un sponsor.
- *Openverse* : CC0 sans contrainte ; CC BY exige l'attribution (dans la légende du Reel) ; exclure toute licence NC et toute SA problématique **[V pour la distinction, via Freesound]**.
- *Instagram* : la bibliothèque musicale intégrée est destinée à un usage personnel ; un compte pro voit la Sound Collection, cleared pour usage commercial **[S : sources de vendeurs de musique, pas la politique Meta]**. Un compte promouvant un projet peut être jugé commercial. Risque : audio coupé ou strike. Le plus sûr est de monter l'audio nous-mêmes avec des pistes CC0/achetées et de garder la licence.

**Q6 Phase 1 doit anticiper.**
- **Journal de combat en JSON versionné** (`schemaVersion`), événements ordonnés : `{tour, acteurId, sort, cibleIds, degats, soins, pvAvant, pvApres, critique, ellipse?}`, plus un tableau `participants` avec `{id, pseudo, definitionPerso}`. Le journal est la seule entrée de la vidéo.
- **Paquet partagé** (`packages/personnages` dans un monorepo) : types `DefinitionPerso`, composants R3F, palette, table de variantes, et une fonction `pose(perso, animation, frame)` pure.
- **Conventions d'animation** : animations nommées (`idle`, `attaque`, `degat`, `mort`, `victoire`) définies en frames à 30 fps, sans horloge, sans aléa non semé ; le site les joue en les pilotant par un compteur de frames.
- **Identité** : une définition canonique (JSON) par abonné, stockée en base ; un test de snapshot (image du même perso sur le site et dans Remotion) en CI.
- Fixer tout de suite : résolution 1080×1920, 30 fps, polices embarquées, aucun asset chargé via réseau pendant le rendu.

## Chaîne recommandée

```
Moteur de combat → journal.json (versionné)
   → script (Claude, skill dédiée) : sélection des moments forts + ellipse,
     sortie scenario.json {plans[] : durée, acteurs, texte, SFX, commentaires J-1}
   → rendu : Remotion (composition <Combat scenario={…}/>, persos du paquet partagé)
        local : npx remotion render --gl=angle  (ou Actions / Sandbox)
   → son : musique CC0/achetée + SFX CC0 calés sur les frames (<Audio>) ; voix optionnelle
   → contrôle : frames extraites + vérification de loudness et de durée
   → publication : Instagram Graph API (compte pro) ou manuelle au début ; légende + attributions
```

Point clé : la partie « script » est le seul endroit où le LLM intervient ; le rendu reste du code déterministe. Cela garde la consommation de tokens faible.

## Ce qui est gadget

- Détection de « codes viraux » : rien ne le prouve dans MoneyPrinterTurbo **[V]**.
- Génération de vidéos « par agent artiste » (lemo-opuscar, ClaudeAnimationBase, OpenMontage) : coûteuse, non reproductible, contraire à la contrainte d'identité des persos.
- Le trio son : un seul des trois (Real SFX) fait ce qu'on veut, et il est remplaçable par quelques lignes de code Remotion.

## Questions ouvertes

1. Performance réelle de la scène R3F en `angle` sur la machine du mainteneur et en CI : à mesurer sur un prototype d'une minute.
2. Licence Remotion en cas de sponsoring de marque : demander confirmation écrite.
3. Détail de l'API Openverse audio (champs, quotas) : non confirmé sur la doc officielle.
4. Politique Meta exacte sur la musique des comptes pro et sur la publication automatisée via API.
5. Qualité du français dans les services de synthèse vocale : non testée.
6. Coût et limites de Vercel Sandbox : non chiffré.
7. Ce que change Remotion 5.0 (licence et GL par défaut).

## Sources

- https://github.com/remotion-dev/remotion
- https://www.remotion.dev/docs/three
- https://www.remotion.dev/docs/gl-options
- https://www.remotion.dev/docs/license/faq
- https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
- https://www.remotion.dev/docs/lambda/cost-example
- https://www.remotion.dev/docs/vercel-sandbox
- https://www.remotion.dev/docs/ai/skills
- https://github.com/heygen-com/hyperframes (et https://hyperframes.heygen.com/concepts/frame-adapters)
- https://github.com/harry0703/MoneyPrinterTurbo
- https://github.com/feitangyuan/onetake
- https://github.com/JohnHeibel/ClaudeAnimationBase
- https://github.com/lemomo-ai/lemo-opuscar
- https://github.com/calesthio/OpenMontage
- https://github.com/wordpress/openverse
- https://github.com/Leonxlnx/earshot
- https://clipwing.pro/skills/real-sfx
- Recherches web : licences Remotion, Openverse/Freesound, musique Instagram (sources de vendeurs de musique, à recouper), prix TTS (blogs tiers)
