import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { SiteFrame } from "./frame.tsx";
import { siteSettings } from "./site.ts";
import { THEME_SCRIPT } from "./theme.ts";
import "./globals.css";

// Direction artistique § 2, « Typographie » : une seule famille, graisses 400 à 800, que la police
// variable porte toutes.
const font = Bricolage_Grotesque({ subsets: ["latin"] });

export const metadata: Metadata = { title: "Wizard Army" };

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html lang="fr" className={font.className} suppressHydrationWarning>
			<head>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: le script du thème, une constante du code, sans donnée reçue.
					dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
				/>
			</head>
			<body>
				<SiteFrame settings={siteSettings()}>{children}</SiteFrame>
			</body>
		</html>
	);
}
