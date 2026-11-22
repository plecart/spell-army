// Les types de `next/link` tels que Next.js le compile (`tsconfig.json`, `paths`) : son import par
// défaut y rend le composant. Sous `nodenext`, l'import par défaut d'un module CommonJS rend son
// `module.exports`, dont le composant n'est que la propriété `default` ; ce fichier, un module ES,
// déclare le composant lui-même, sous ses types publics (ceux que réexporte `next/link.d.ts`).
import type * as NextLink from "next/dist/client/link.js";

declare const Link: typeof NextLink.default.default;
export default Link;
