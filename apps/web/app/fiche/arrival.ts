// Le jour et le mois en toutes lettres, « 9 novembre », au fuseau que #18 a retenu (« Décisions »,
// « Date d'arrivée »).
const DAY_AND_MONTH = new Intl.DateTimeFormat("fr", {
	day: "numeric",
	month: "long",
	timeZone: "Europe/Paris",
});

/**
 * La date d'arrivée d'une recrue sur sa fiche, au fuseau `Europe/Paris` : « Recrue depuis le 9
 * novembre », le premier du mois en « 1er ».
 */
export function arrivalOf(arrivedAt: Date): string {
	const date = DAY_AND_MONTH.formatToParts(arrivedAt)
		.map(({ type, value }) => (type === "day" && value === "1" ? "1er" : value))
		.join("");
	return `Recrue depuis le ${date}`;
}
