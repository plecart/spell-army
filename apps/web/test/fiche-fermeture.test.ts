import { expect, test, vi } from "vitest";
import { sheetCloseOf } from "../app/fiche/sheet.tsx";
import { once } from "../app/once.ts";

test("deux appels coup sur coup n'exécutent l'action qu'une fois", () => {
	const navigate = vi.fn();
	const close = once(navigate);
	close();
	close();
	expect(navigate).toHaveBeenCalledOnce();
});

// La fermeture que partagent « Fermer », Échap et l'appui hors de la feuille (`app/fiche/sheet.tsx`) :
// deux gestes coup sur coup ne naviguent qu'une fois, vers la destination de la page.
test.each([
	{ onClose: "back", back: 1, push: [] },
	{ onClose: "home", back: 0, push: [["/"]] },
] as const)("deux fermetures « $onClose » coup sur coup ne naviguent qu'une fois", ({
	onClose,
	back,
	push,
}) => {
	const router = { back: vi.fn(), push: vi.fn() };
	const close = sheetCloseOf(onClose, router);
	close();
	close();
	expect({ back: router.back.mock.calls.length, push: router.push.mock.calls }).toEqual({
		back,
		push,
	});
});
