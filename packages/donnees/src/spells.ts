import { eq, getTableColumns, sql } from "drizzle-orm";
import type { Executor } from "./client.ts";
import { spells } from "./schema.ts";

/** Ce qu'un sort rend de son image, jamais ses octets : son type, sa taille et son empreinte. */
export interface ImageSummary {
	type: string;
	/** La taille en octets. */
	size: number;
	/** L'empreinte SHA-256, en hexadécimal minuscule. */
	sha256: string;
}

/**
 * Un sort tel que la table `spells` le porte, son image résumée. `recipe`, `form` et `effect` sont
 * le modèle de `combat` tel quel, que `donnees` ne lit pas : `apps/web` les valide.
 */
export type SpellRecord = Omit<
	typeof spells.$inferSelect,
	"image" | "imageType"
> & { image: ImageSummary | null };

/** Un sort à ajouter : son numéro vient de la table, et il entre sans image. */
export type NewSpell = Omit<SpellRecord, "number" | "image">;

/** Les octets d'une image et leur type MIME, que l'appelant a reconnus. */
export interface SpellImage {
	bytes: Uint8Array;
	type: string;
}

/** Ce qu'une modification peut changer d'un sort ; `image: null` la retire. */
export interface SpellPatch {
	weight?: number;
	description?: string;
	image?: SpellImage | null;
}

// Les colonnes d'un `SpellRecord`, l'image remplacée par sa taille et son empreinte, que Postgres
// calcule (`octet_length`, `sha256`) : les octets ne quittent pas la base. Toutes deux sont nulles
// sans image, que `toRecord` lit au type, nul en même temps qu'elle (`spells_image_check`).
const { image, imageType, ...spellColumns } = getTableColumns(spells);
const recordColumns = {
	...spellColumns,
	imageType,
	imageSize: sql<number>`octet_length(${image})`,
	imageSha256: sql<string>`encode(sha256(${image}), 'hex')`,
};

type RecordRow = Omit<SpellRecord, "image"> & {
	imageType: string | null;
	imageSize: number;
	imageSha256: string;
};

function toRecord({
	imageType,
	imageSize,
	imageSha256,
	...spell
}: RecordRow): SpellRecord {
	return {
		...spell,
		image:
			imageType === null
				? null
				: { type: imageType, size: imageSize, sha256: imageSha256 },
	};
}

/** La ligne d'un sort que `rows` doit porter ; une erreur qui nomme son numéro quand elle manque. */
function recordNumbered(number: number, [row]: RecordRow[]): SpellRecord {
	if (!row) {
		throw new Error(`Aucun sort de numéro ${number}.`);
	}
	return toRecord(row);
}

/** Les sorts de la réserve, par numéro croissant. */
export async function listSpells(executor: Executor): Promise<SpellRecord[]> {
	const rows = await executor
		.select(recordColumns)
		.from(spells)
		.orderBy(spells.number);
	return rows.map(toRecord);
}

/** Le sort de numéro `number` ; une erreur qui nomme le numéro quand aucun sort ne le porte. */
export async function readSpell(
	executor: Executor,
	number: number,
): Promise<SpellRecord> {
	return recordNumbered(
		number,
		await executor
			.select(recordColumns)
			.from(spells)
			.where(eq(spells.number, number)),
	);
}

/**
 * Le numéro et le nom du sort de clé `key` (`spellKey` de `combat`), ou `undefined` : de quoi
 * nommer le sort existant quand un ajout le doublerait.
 */
export async function findSpellByKey(
	executor: Executor,
	key: string,
): Promise<{ number: number; name: string } | undefined> {
	const [found] = await executor
		.select({ number: spells.number, name: spells.name })
		.from(spells)
		.where(eq(spells.key, key));
	return found;
}

/**
 * Ajoute un sort sous le plus grand numéro + 1 (1 sur une table vide) et le rend tel qu'écrit. Le
 * poids par défaut et les règles de validité sont à l'appelant ; une clé déjà présente et les bornes
 * des contraintes de la table remontent en erreur de la base, sans rien écrire.
 */
export async function insertSpell(
	executor: Executor,
	spell: NewSpell,
): Promise<SpellRecord> {
	// ponytail: deux ajouts simultanés lisent le même maximum, et le second échoue sur la clé
	// primaire sans rien écrire ; un verrou de table si les ajouts deviennent concurrents.
	const nextNumber = sql<number>`(select coalesce(max(${spells.number}), 0) + 1 from ${spells})`;
	const [row] = await executor
		.insert(spells)
		.values({ ...spell, number: nextNumber })
		.returning(recordColumns);
	return toRecord(row as RecordRow);
}

/**
 * Modifie le poids, la description ou l'image du sort `number`, et rien d'autre, puis rend le sort
 * avant et après, sans les octets de l'image. Un patch dont aucune valeur n'est définie est refusé
 * avant toute requête ; un numéro inconnu lève une erreur qui le nomme. Le type MIME est à
 * reconnaître chez l'appelant ; la table n'en admet que trois (`spells_image_type_check`).
 *
 * Ouvre sa propre transaction, un point de sauvegarde quand `executor` en est déjà une : refusée,
 * la modification laisse la transaction de l'appelant utilisable. La ligne est verrouillée dès la
 * lecture de `before`, qu'aucune modification concurrente ne périme.
 */
export async function updateSpell(
	executor: Executor,
	number: number,
	{ weight, description, image }: SpellPatch,
): Promise<{ before: SpellRecord; after: SpellRecord }> {
	if ([weight, description, image].every((value) => value === undefined)) {
		throw new Error("Rien à modifier : le patch est vide.");
	}
	const imageColumns =
		image === undefined
			? {}
			: { image: image?.bytes ?? null, imageType: image?.type ?? null };
	const ofNumber = eq(spells.number, number);
	return executor.transaction(async (tx) => {
		const before = recordNumbered(
			number,
			await tx.select(recordColumns).from(spells).where(ofNumber).for("update"),
		);
		const after = recordNumbered(
			number,
			await tx
				.update(spells)
				.set({ weight, description, ...imageColumns })
				.where(ofNumber)
				.returning(recordColumns),
		);
		return { before, after };
	});
}

/**
 * La réserve tirable, sous la forme `SpellEntry` qu'attend `drawSpell` de `personnages` : chaque
 * sort en `{ id, weight }` par numéro croissant, `id` son numéro en texte, poids 0 compris, que le
 * tirage ignore.
 */
export async function readDrawablePool(
	executor: Executor,
): Promise<{ id: string; weight: number }[]> {
	const rows = await executor
		.select({ number: spells.number, weight: spells.weight })
		.from(spells)
		.orderBy(spells.number);
	return rows.map(({ number, weight }) => ({ id: String(number), weight }));
}
