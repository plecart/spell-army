// L'adresse de l'annuaire : la recherche, le filtre et la page y vivent (`?q=`, `?classe=`,
// `?page=`), lus côté serveur. C'est une frontière de confiance : chaque paramètre se lit répété,
// vide ou hors forme, et ce qui n'est pas reconnu vaut absent.
import { CLASS_KEYS, type ClassKey } from "personnages";

/**
 * Le nom de chaque classe à l'écran (game design § 1, « Classe ») et dans l'adresse, en minuscules
 * sans accent.
 */
export const CLASS_NAMES = {
	wizard: { label: "Magicien", slug: "magicien" },
	golem: { label: "Golem", slug: "golem" },
	warrior: { label: "Guerrier", slug: "guerrier" },
	dwarf: { label: "Nain", slug: "nain" },
	vampire: { label: "Vampire", slug: "vampire" },
	druid: { label: "Druide", slug: "druide" },
	peasant: { label: "Paysan", slug: "paysan" },
	fairy: { label: "Fée", slug: "fee" },
} as const satisfies Record<ClassKey, { label: string; slug: string }>;

/**
 * La longueur d'une recherche au plus : celle d'un pseudo Instagram (`INSTAGRAM_USERNAME_PATTERN`
 * de `donnees`).
 */
export const MAX_SEARCH_LENGTH = 30;

/** Ce que demande l'adresse de l'annuaire. */
export interface DirectoryQuery {
	/** Une partie du pseudo ; vide : pas de recherche. */
	search: string;
	/** La classe du filtre ; absente : toutes. */
	classKey?: ClassKey;
	/** La page, un entier d'au moins 1. */
	page: number;
}

/** Les paramètres de l'adresse, tels que Next.js les donne à une page (`searchParams`). */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Lit l'adresse de l'annuaire. Un paramètre répété vaut sa première valeur, comme
 * `URLSearchParams.get`. La recherche perd ses blancs et un « @ » de tête, puis se tronque à la
 * longueur d'un pseudo ; une classe inconnue ne filtre pas ; une page qui n'est pas un entier
 * d'au moins 1 vaut 1.
 */
export function readDirectoryQuery(params: SearchParams): DirectoryQuery {
	const search = (first(params.q) ?? "")
		.trim()
		.replace(/^@/, "")
		.slice(0, MAX_SEARCH_LENGTH);
	const slug = first(params.classe);
	const page = first(params.page) ?? "";
	return {
		search,
		classKey: CLASS_KEYS.find(
			(classKey) => CLASS_NAMES[classKey].slug === slug,
		),
		page: /^\d+$/.test(page) ? Math.max(1, Number(page)) : 1,
	};
}

/**
 * L'adresse de l'annuaire pour `query`. Ce qui vaut son défaut ne s'y écrit pas : recherche vide,
 * aucune classe, page 1.
 */
export function directoryHref({
	search,
	classKey,
	page = 1,
}: Partial<DirectoryQuery>): string {
	const params = new URLSearchParams();
	if (search) {
		params.set("q", search);
	}
	if (classKey) {
		params.set("classe", CLASS_NAMES[classKey].slug);
	}
	if (page > 1) {
		params.set("page", String(page));
	}
	const query = params.toString();
	return query ? `/?${query}` : "/";
}

// La première valeur d'un paramètre, répété ou non.
function first(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
