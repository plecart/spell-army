import type { ClassKey } from "./character.ts";

/** Direction artistique § 2 : une couleur sourde par classe. */
export const CLASS_COLORS: Readonly<Record<ClassKey, string>> = {
	wizard: "#2e4a7d",
	golem: "#857c6c",
	warrior: "#a33b2f",
	dwarf: "#b06a2c",
	vampire: "#6e1f33",
	druid: "#4f7a3a",
	peasant: "#c4a052",
	fairy: "#3f9c95",
};
