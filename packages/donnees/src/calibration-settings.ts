import { getTableColumns } from "drizzle-orm";
import { type Executor, seededRow } from "./client.ts";
import { calibrationSettings } from "./schema.ts";

/** Réglages du calibrage (`docs/game-design.md` § 6) : la ligne de `calibration_settings` sans `id`. */
export type CalibrationSettings = Omit<
	typeof calibrationSettings.$inferSelect,
	"id"
>;

// Colonnes lues et rendues : celles de `CalibrationSettings`.
const { id: _id, ...settingsColumns } = getTableColumns(calibrationSettings);

function settingsRow(rows: CalibrationSettings[]): CalibrationSettings {
	return seededRow(rows, "Réglages du calibrage absents");
}

/**
 * Lit les réglages du calibrage. `forUpdate` verrouille leur ligne jusqu'à la fin de la transaction
 * de `executor` : aucune modification ne passe entre cette lecture et une écriture qui en dérive.
 *
 * @throws {Error} si la ligne manque (base non migrée).
 */
export async function readCalibrationSettings(
	executor: Executor,
	{ forUpdate = false }: { forUpdate?: boolean } = {},
): Promise<CalibrationSettings> {
	const query = executor.select(settingsColumns).from(calibrationSettings);
	return settingsRow(await (forUpdate ? query.for("update") : query));
}

/**
 * Modifie les seuls réglages que porte `patch` et rend les réglages avant et après, tels que la base
 * les a écrits. Un patch dont aucune valeur n'est définie est refusé avant toute requête. Seules les
 * clés de `CalibrationSettings` sont prévues, le type excluant les autres : une entrée venue de
 * l'extérieur se valide chez l'appelant (l'outil MCP, par son schéma strict). Les bornes sont celles
 * des contraintes de la base, dont la violation remonte telle quelle.
 *
 * Ouvre sa propre transaction, un point de sauvegarde quand `executor` en est déjà une : refusée,
 * la modification laisse la transaction de l'appelant utilisable. La ligne est verrouillée dès la
 * lecture de `before`, qu'aucune modification concurrente ne périme.
 */
export async function updateCalibrationSettings(
	executor: Executor,
	patch: Partial<CalibrationSettings>,
): Promise<{ before: CalibrationSettings; after: CalibrationSettings }> {
	if (Object.values(patch).every((value) => value === undefined)) {
		throw new Error("Aucun réglage à modifier : le patch est vide.");
	}
	return executor.transaction(async (tx) => {
		const before = await readCalibrationSettings(tx, { forUpdate: true });
		const after = settingsRow(
			await tx
				.update(calibrationSettings)
				.set(patch)
				.returning(settingsColumns),
		);
		return { before, after };
	});
}
