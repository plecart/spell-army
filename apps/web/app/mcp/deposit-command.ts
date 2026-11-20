import { CLASSES } from "./vocabulary.ts";

/**
 * La forme de la commande qui dépose un fichier 3D depuis le poste du mainteneur (issue #15,
 * « Décisions », « Dépôt d'un fichier 3D ») : la description de `deposer_fichier_3d` la donne, et la
 * commande l'affiche pour usage. Les classes y portent leur nom d'outil.
 */
export const DEPOSIT_COMMAND = `pnpm --filter web deposer-3d <fichier.glb> --classe <classe>, ou --monstre <nom> ; <classe> parmi ${Object.values(CLASSES).join(", ")}`;
