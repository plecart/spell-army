/**
 * La réponse d'une route qui sert un fichier lu en base : ses octets sous leur type MIME, que le
 * navigateur ne devine jamais (`nosniff`) et que le navigateur et le CDN gardent une heure ; 404
 * sans fichier.
 */
export function storedFileResponse(
	file: { bytes: Uint8Array; type: string } | null | undefined | false,
): Response {
	if (!file) {
		return new Response(null, { status: 404 });
	}
	// Une copie sur son propre `ArrayBuffer` : le type de corps qu'accepte `Response`.
	return new Response(new Uint8Array(file.bytes), {
		headers: {
			"Content-Type": file.type,
			"X-Content-Type-Options": "nosniff",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
