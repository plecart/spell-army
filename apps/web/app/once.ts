/**
 * `action`, gardée : seul son premier appel l'exécute, les suivants ne font rien. Ainsi d'une
 * fermeture que plusieurs gestes peuvent déclencher coup sur coup, et qui ne doit agir qu'une fois.
 */
export function once(action: () => void): () => void {
	let done = false;
	return () => {
		if (!done) {
			done = true;
			action();
		}
	};
}
