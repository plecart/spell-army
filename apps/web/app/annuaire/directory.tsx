import type { VisiblePlayer, VisiblePlayersPage } from "joueurs";
import { CLASS_KEYS, type ClassKey, PEDESTALS } from "personnages";
import { BACKDROP_IMAGES, classColor } from "../class-style.ts";
import { instagramUrl } from "../site.ts";
import { Figure } from "../vignettes/figure.tsx";
import {
	CLASS_NAMES,
	type DirectoryQuery,
	directoryHref,
	MAX_SEARCH_LENGTH,
} from "./address.ts";
import { FilterSheet } from "./filter-sheet.tsx";

/**
 * L'annuaire des recrues (direction artistique § 3) : la page `result` de la lecture des joueurs
 * visibles, sous la recherche, le filtre et la page de `query`. Le titre mène au compte Instagram
 * `instagramHandle` quand il est réglé.
 */
export function Directory({
	query,
	result,
	instagramHandle,
}: {
	query: DirectoryQuery;
	result: VisiblePlayersPage;
	instagramHandle?: string;
}) {
	// Sans recherche, le nombre par classe compte toutes les recrues visibles : tout à zéro, l'armée
	// est vide, filtre de classe ou non.
	const emptyArmy =
		!query.search && CLASS_KEYS.every((key) => result.classCounts[key] === 0);
	return (
		<main className="directory">
			<p className="banderole">
				<span>SAISON 1 · L'ARMÉE SE RASSEMBLE</span>
			</p>
			<h1>
				L'armée
				{instagramHandle && (
					<>
						{" "}
						de <a href={instagramUrl(instagramHandle)}>@{instagramHandle}</a>
					</>
				)}
			</h1>
			<p className="lede">
				Chaque abonné du compte est une recrue, avec sa classe, ses stats et son
				sort. Trouve la tienne.
			</p>
			<div className="toolbar">
				<SearchForm query={query} />
				<FilterSheet>
					<ClassOptions query={query} classCounts={result.classCounts} />
				</FilterSheet>
			</div>
			{query.classKey && (
				<FilterChip search={query.search} classKey={query.classKey} />
			)}
			{result.total > 0 ? (
				<>
					<Counter query={query} result={result} />
					<ul className="cards">
						{result.players.map((player) => (
							<Card key={player.instagramId} player={player} />
						))}
					</ul>
					<Pagination
						query={query}
						page={result.page}
						pageCount={result.pageCount}
					/>
				</>
			) : (
				<p className="empty">
					{emptyArmy
						? "L'armée attend ses premières recrues."
						: "Aucune recrue ne porte ce pseudo."}
				</p>
			)}
		</main>
	);
}

const COUNT_FORMAT = new Intl.NumberFormat("fr-FR");

// `noun`, au pluriel à partir de 2 `count`.
const plural = (count: number, noun: string) =>
	count >= 2 ? `${noun}s` : noun;

// La recherche : un formulaire GET vers l'annuaire, qui garde la classe du filtre et revient à la
// page 1.
function SearchForm({
	query: { search, classKey },
}: {
	query: DirectoryQuery;
}) {
	return (
		<search className="search">
			<form action="/" method="get">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="11" cy="11" r="6" />
					<path d="M16 16l4 4" />
				</svg>
				<input
					type="search"
					name="q"
					defaultValue={search}
					placeholder="Ton pseudo Instagram"
					aria-label="Ton pseudo Instagram"
					maxLength={MAX_SEARCH_LENGTH}
					autoComplete="off"
					autoCapitalize="none"
					spellCheck={false}
					enterKeyHint="search"
				/>
				{classKey && (
					<input
						type="hidden"
						name="classe"
						value={CLASS_NAMES[classKey].slug}
					/>
				)}
			</form>
		</search>
	);
}

// Le contenu de la feuille du filtre : « Toutes les classes », puis chaque classe, avec son nombre
// de recrues sous la recherche. Chaque lien garde la recherche et revient à la page 1.
function ClassOptions({
	query,
	classCounts,
}: {
	query: DirectoryQuery;
	classCounts: Record<ClassKey, number>;
}) {
	const option = (classKey: ClassKey | undefined, count: number) => (
		<li key={classKey ?? "all"}>
			<a
				href={directoryHref({ search: query.search, classKey })}
				aria-current={classKey === query.classKey ? "true" : undefined}
			>
				{classKey && <span className="dot" style={classColor(classKey)} />}
				{classKey ? CLASS_NAMES[classKey].label : "Toutes les classes"}
				<span className="count">{COUNT_FORMAT.format(count)}</span>
			</a>
		</li>
	);
	const total = CLASS_KEYS.reduce(
		(sum, classKey) => sum + classCounts[classKey],
		0,
	);
	return (
		<ul className="class-options">
			{option(undefined, total)}
			{CLASS_KEYS.map((classKey) => option(classKey, classCounts[classKey]))}
		</ul>
	);
}

// L'étiquette du filtre actif, dont le lien le retire en gardant la recherche.
function FilterChip({
	search,
	classKey,
}: {
	search: string;
	classKey: ClassKey;
}) {
	const { label } = CLASS_NAMES[classKey];
	return (
		<a
			className="chip"
			href={directoryHref({ search })}
			aria-label={`Retirer le filtre ${label}`}
		>
			{label}
			<span aria-hidden="true">×</span>
		</a>
	);
}

// « N recrues · K classes » : les recrues sous la recherche et le filtre, et le nombre de leurs
// classes.
function Counter({
	query,
	result: { total, classCounts },
}: {
	query: DirectoryQuery;
	result: VisiblePlayersPage;
}) {
	const classes = CLASS_KEYS.filter(
		(classKey) =>
			classCounts[classKey] > 0 &&
			(!query.classKey || classKey === query.classKey),
	).length;
	return (
		<p className="counter">
			<strong>{COUNT_FORMAT.format(total)}</strong> {plural(total, "recrue")} ·{" "}
			{classes} {plural(classes, "classe")}
		</p>
	);
}

// Une carte : la vignette — le personnage sur son socle, posé sur le décor de sa classe quand il est
// rendu —, le pseudo, la pastille et le nom de la classe. Pas de clic au MVP de l'annuaire : il
// vient avec la fiche (#18).
function Card({ player: { username, classKey } }: { player: VisiblePlayer }) {
	return (
		<li className="card" style={classColor(classKey)}>
			<div
				className="vignette"
				style={{ backgroundImage: BACKDROP_IMAGES[classKey] }}
			>
				<Figure classKey={classKey} pedestal={PEDESTALS[classKey]} />
			</div>
			<p className="handle">@{username}</p>
			<p className="class-name">
				<span className="dot" />
				{CLASS_NAMES[classKey].label}
			</p>
		</li>
	);
}

// « Précédente », « Page N sur M », « Suivante » : des liens sous la même recherche et le même
// filtre, inertes aux bornes.
function Pagination({
	query,
	page,
	pageCount,
}: {
	query: DirectoryQuery;
	page: number;
	pageCount: number;
}) {
	const step = (target: number, label: string) =>
		target >= 1 && target <= pageCount ? (
			<a className="button" href={directoryHref({ ...query, page: target })}>
				{label}
			</a>
		) : (
			<span className="button disabled">{label}</span>
		);
	return (
		<nav className="pagination" aria-label="Pages de l'annuaire">
			{step(page - 1, "Précédente")}
			<span>
				Page {page} sur {pageCount}
			</span>
			{step(page + 1, "Suivante")}
		</nav>
	);
}
