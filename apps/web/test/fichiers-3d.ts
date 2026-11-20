// Les fichiers 3D des tests de `deposer_fichier_3d` et de la commande `deposer-3d`, en JSON glTF :
// `glb` de `personnages/test/glb` en fait des GLB.

/** Un fichier conforme : les cinq ancres, vides, `chapeau` sous `tete`, `sol` à l'origine. */
export const CONFORMING = {
	asset: { version: "2.0" },
	nodes: [
		{ name: "tete", children: [1] },
		{ name: "chapeau" },
		{ name: "main_gauche" },
		{ name: "main_droite" },
		{ name: "sol" },
	],
};

/** Deux écarts : l'ancre `main_droite` renommée, une texture. */
export const NON_CONFORMING = {
	...CONFORMING,
	nodes: CONFORMING.nodes.map((node) =>
		node.name === "main_droite" ? { name: "main" } : node,
	),
	textures: [{}],
};

/** Les écarts de `NON_CONFORMING`, un par ligne, tels que l'outil et la commande les rendent. */
export const DEVIATIONS = [
	"Le fichier ne respecte pas le contrat du fichier 3D (direction artistique § 7) :",
	"- ancres (main_droite) : L'ancre « main_droite » manque : ajoutez un nœud nommé « main_droite », vide si rien n'y pend.",
	"- sans-texture : Le fichier porte 1 texture(s) et 0 image(s) : retirez-les, les couleurs sont unies.",
].join("\n");
