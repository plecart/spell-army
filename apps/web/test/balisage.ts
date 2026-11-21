// Le balisage d'un composant du site, rendu comme au serveur, et de quoi le lire : son texte et
// ses liens.
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Les entités qu'écrit `renderToStaticMarkup` (react-dom 19.3.1, `escapeTextForBrowser`).
const ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#x27;": "'",
};

function decode(html: string): string {
	return html.replace(
		/&(?:amp|lt|gt|quot|#x27);/g,
		(entity) => ENTITIES[entity] ?? entity,
	);
}

/** Le balisage de `element`, rendu comme au serveur. */
export const render = (element: ReactElement): string =>
	renderToStaticMarkup(element);

/**
 * Le texte de `html` : sans balises, entités décodées, blancs ASCII resserrés. Les autres blancs
 * restent, dont l'espace fine insécable des milliers.
 */
export function textOf(html: string): string {
	return decode(html.replace(/<[^>]*>/g, " "))
		.replace(/[ \t\r\n]+/g, " ")
		.trim();
}

/** Les liens de `html`, dans l'ordre : leur adresse et leur texte. */
export function linksOf(html: string): { href: string; text: string }[] {
	return [
		...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g),
	].map(([, href = "", inner = ""]) => ({
		href: decode(href),
		text: textOf(inner),
	}));
}

/** Les éléments `<tag class="className">` de `html`, sans éléments `tag` imbriqués. */
export function elementsOf(
	html: string,
	tag: string,
	className: string,
): string[] {
	return [
		...html.matchAll(
			new RegExp(`<${tag} class="${className}"[\\s\\S]*?</${tag}>`, "g"),
		),
	].map(([element]) => element);
}
