// Le jour, le mois en toutes lettres et l'année, « 9 novembre 2026 », au fuseau que #18 a retenu
// (« Décisions », « Date d'arrivée »).
const ARRIVAL_DATE = new Intl.DateTimeFormat("fr", {
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "Europe/Paris",
});

/**
 * La date d'arrivée d'une recrue sur sa fiche, au fuseau `Europe/Paris` : « Recrue depuis le 9
 * novembre 2026 », le premier du mois en « 1er ».
 */
export function arrivalOf(arrivedAt: Date): string {
	const date = ARRIVAL_DATE.formatToParts(arrivedAt)
		.map(({ type, value }) => (type === "day" && value === "1" ? "1er" : value))
		.join("");
	return `Recrue depuis le ${date}`;
}
