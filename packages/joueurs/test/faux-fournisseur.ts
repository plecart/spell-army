import {
	type FollowerEntry,
	type FollowerPage,
	type FollowerProvider,
	ProviderError,
} from "../src/index.ts";

/** Les réglages d'un faux fournisseur, tous facultatifs. */
export interface FakeProviderOptions {
	/** Le nombre d'entrées d'une page : 50 par défaut. */
	pageSize?: number;
	/** Appelé à chaque lecture de page, avant qu'elle rende ou échoue : de quoi avancer une horloge. */
	onPageRead?: () => void;
}

/**
 * Un faux fournisseur pour les tests : il joue une liste connue, découpée en pages de `pageSize`
 * entrées, sous des curseurs opaques (`cursorOf`). Doublons et désordre se jouent par la liste
 * elle-même. Il enregistre les curseurs demandés et compte les lectures du nombre d'abonnés ; on
 * lui règle le nombre d'abonnés affiché et la page dont la lecture échoue.
 */
export class FakeFollowerProvider implements FollowerProvider {
	/** Les curseurs demandés, dans l'ordre des lectures de page. */
	readonly cursors: (string | null)[] = [];
	/** Le nombre de lectures du nombre d'abonnés. */
	followerCountReads = 0;
	/** Le nombre d'abonnés affiché : la longueur de la liste par défaut, plus pour une liste tronquée. */
	followerCount: number;
	/** La page, comptée depuis 1, dont la lecture lève une `ProviderError` ; `null` : aucune. */
	failingPage: number | null = null;
	readonly #pages: (readonly FollowerEntry[])[];
	readonly #onPageRead: () => void;

	constructor(
		followers: readonly FollowerEntry[],
		{ pageSize = 50, onPageRead = () => {} }: FakeProviderOptions = {},
	) {
		this.followerCount = followers.length;
		this.#onPageRead = onPageRead;
		this.#pages = Array.from(
			{ length: Math.max(1, Math.ceil(followers.length / pageSize)) },
			(_, index) => followers.slice(index * pageSize, (index + 1) * pageSize),
		);
	}

	/** Le curseur de la page `page`, comptée depuis 1 : nul pour la première, le haut de la liste. */
	cursorOf(page: number): string | null {
		return page === 1 ? null : `curseur-opaque-${page}`;
	}

	async readPage(cursor: string | null): Promise<FollowerPage> {
		this.cursors.push(cursor);
		this.#onPageRead();
		const page = this.#pageOf(cursor);
		if (page === this.failingPage) {
			throw new ProviderError(`panne injectée à la page ${page}`);
		}
		return {
			entries: this.#pages[page - 1] ?? [],
			next: page < this.#pages.length ? this.cursorOf(page + 1) : null,
		};
	}

	async readFollowerCount(): Promise<number> {
		this.followerCountReads++;
		return this.followerCount;
	}

	// La page d'un curseur rendu par ce fournisseur ; un autre est une erreur du code sous test.
	#pageOf(cursor: string | null): number {
		for (let page = 1; page <= this.#pages.length; page++) {
			if (this.cursorOf(page) === cursor) {
				return page;
			}
		}
		throw new Error(`curseur inconnu du faux fournisseur : ${cursor}`);
	}
}
