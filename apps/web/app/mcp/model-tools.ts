import {
	type ModelTarget,
	setClassDefaultModel,
	storeModelFile,
} from "donnees";
import {
	CLASS_KEYS,
	checkModel,
	describeDeviations,
	MAX_MODEL_BYTES,
} from "personnages";
import { z } from "zod";
import { boundedBase64 } from "./bounds.ts";
import type { McpTool } from "./tool.ts";

// La commande qui dépose un fichier depuis le poste du mainteneur (issue #15, « Décisions »,
// « Dépôt d'un fichier 3D ») : le contenu ne passe jamais par le modèle.
const COMMAND = "pnpm --filter web deposer-3d <fichier.glb> --classe <classe>";
const MAX_MONSTER_NAME_LENGTH = 64;
const ONE_OWNER =
	"L'entrée doit donner la classe ou le monstre, l'un des deux exactement.";

const characterClass = z.enum(CLASS_KEYS);

const deposit = z
	.strictObject({
		classe: characterClass
			.optional()
			.describe("La classe dont c'est le fichier, sans monstre."),
		monstre: z
			.string()
			.trim()
			.min(1)
			.max(MAX_MONSTER_NAME_LENGTH)
			.optional()
			.describe("Le nom du monstre dont c'est le fichier, sans classe."),
		contenu: boundedBase64("le fichier", MAX_MODEL_BYTES).describe(
			"Les octets du fichier GLB en base64, qu'écrit la commande deposer-3d et jamais le modèle.",
		),
	})
	.refine(
		({ classe, monstre }) => (classe === undefined) !== (monstre === undefined),
		ONE_OWNER,
	)
	// Le `refine` ne passe pas dans le schéma JSON : le contenu, requis, et l'un des deux autres.
	.meta({ minProperties: 2, maxProperties: 2 });

const setting = z.strictObject({
	classe: characterClass.describe(
		"La classe dont le modèle par défaut change.",
	),
	fichier: z
		.int32()
		.min(1)
		.describe(
			"L'identifiant d'un fichier 3D de cette classe, rendu par deposer_fichier_3d.",
		),
});

/**
 * Les indices suivent leurs définitions MCP : le dépôt ajoute un fichier sans rien écraser, et
 * deux dépôts du même fichier en rangent deux.
 */
export const depositModelTool: McpTool<typeof deposit> = {
	name: "deposer_fichier_3d",
	title: "Déposer un fichier 3D",
	description: `Range le fichier GLB d'une classe ou d'un monstre s'il respecte le contrat du fichier 3D (direction artistique § 7), et rend son identifiant, sa taille et son empreinte SHA-256 ; regler_modele_classe en fait le modèle par défaut d'une classe. Un fichier non conforme est refusé, ses écarts listés un par ligne. Ne passe jamais le contenu dans l'appel : donne au mainteneur la commande ${COMMAND}, ou --monstre <nom> pour un monstre, à lancer dans son clone du dépôt ; elle vérifie le fichier sur son poste, puis l'envoie elle-même à cet outil.`,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	input: deposit,
	output: z.strictObject({
		identifiant: z.int(),
		taille: z.int(),
		empreinte: z.string(),
	}),
	run: async (executor, { classe, monstre, contenu }) => {
		const bytes = Buffer.from(contenu, "base64");
		const deviations = checkModel(bytes);
		if (deviations.length > 0) {
			throw new Error(describeDeviations(deviations));
		}
		// Le `refine` du schéma garantit l'un des deux exactement.
		const target = (
			classe === undefined ? { monster: monstre } : { class: classe }
		) as ModelTarget;
		const { id, size, sha256 } = await storeModelFile(executor, {
			target,
			content: bytes,
		});
		const output = { identifiant: id, taille: size, empreinte: sha256 };
		const owner = classe === undefined ? { monstre } : { classe };
		return { output, after: { ...output, ...owner } };
	},
};

/**
 * `destructiveHint` : le réglage écrase le modèle par défaut précédent. Comme `modifier_reglages`,
 * l'outil ne demande pas de confirmation : l'audit garde l'avant (ADR 0005, « Conséquences »).
 * `idempotentHint` : N appels identiques laissent le même état.
 */
export const setClassModelTool: McpTool<typeof setting> = {
	name: "regler_modele_classe",
	title: "Régler le modèle par défaut d'une classe",
	description:
		"Fait d'un fichier 3D déposé pour une classe par deposer_fichier_3d le modèle par défaut de cette classe, à la place du précédent. Refuse un fichier inexistant, celui d'un monstre ou celui d'une autre classe. Rend la classe et le fichier ; le journal d'audit garde l'avant et l'après.",
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	input: setting,
	output: setting,
	run: async (executor, { classe, fichier }) => {
		const { before, after } = await setClassDefaultModel(
			executor,
			classe,
			fichier,
		);
		const output = { classe, fichier: after };
		return { output, before: { classe, fichier: before }, after: output };
	},
};
