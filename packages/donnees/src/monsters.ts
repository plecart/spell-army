import { eq } from "drizzle-orm";
import type { Executor } from "./client.ts";
import { monsters } from "./schema.ts";

/**
 * Un monstre tel que la table `monsters` le porte. `profile` et `attacks` sont le modèle de `combat`
 * tel quel (`MonsterDesign`), que `donnees` ne lit pas : l'appelant les valide (`validateMonster`).
 */
export type MonsterRecord = typeof monsters.$inferSelect;

/** Un monstre à ranger : son identifiant vient de la table. */
export type NewMonster = Omit<MonsterRecord, "id">;

/**
 * Range `monster` et le rend tel qu'écrit. Le profil, les attaques et le facteur d'échelle se
 * valident chez l'appelant ; un chapitre déjà pris dans la saison, un nom déjà porté et les bornes
 * des contraintes de la table remontent en erreur de la base, sans rien écrire.
 */
export async function insertMonster(
	executor: Executor,
	monster: NewMonster,
): Promise<MonsterRecord> {
	const [row] = await executor.insert(monsters).values(monster).returning();
	return row as MonsterRecord;
}

/** Les monstres du bestiaire, par saison puis par chapitre. */
export async function listMonsters(
	executor: Executor,
): Promise<MonsterRecord[]> {
	return executor
		.select()
		.from(monsters)
		.orderBy(monsters.season, monsters.chapter);
}

/** Le monstre de nom `name`, ou `undefined` quand aucun ne le porte. */
export async function findMonsterByName(
	executor: Executor,
	name: string,
): Promise<MonsterRecord | undefined> {
	const [found] = await executor
		.select()
		.from(monsters)
		.where(eq(monsters.name, name));
	return found;
}

/**
 * Retire le monstre de nom `name` et le rend tel qu'il était, l'avant de l'audit ; `undefined`
 * quand aucun ne le porte : rejoué, le retrait ne retire rien. Ses fichiers 3D (`model_files`) ne
 * sont pas touchés : aucune clé ne les lie à la table.
 */
export async function deleteMonsterByName(
	executor: Executor,
	name: string,
): Promise<MonsterRecord | undefined> {
	const [removed] = await executor
		.delete(monsters)
		.where(eq(monsters.name, name))
		.returning();
	return removed;
}
