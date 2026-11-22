import { expect, test, vi } from "vitest";
import { once } from "../app/once.ts";

// La garde de la fermeture de la fiche (`app/fiche/sheet.tsx`), que partagent « Fermer », Échap et
// l'appui hors de la feuille.
test("deux fermetures coup sur coup ne naviguent qu'une fois", () => {
	const navigate = vi.fn();
	const close = once(navigate);
	close();
	close();
	expect(navigate).toHaveBeenCalledOnce();
});
