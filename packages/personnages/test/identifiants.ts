// Les identifiants « 1 » à « count », en texte : les populations que lisent les critères de #10.
export function identifiers(count: number): string[] {
	return Array.from({ length: count }, (_, index) => String(index + 1));
}
