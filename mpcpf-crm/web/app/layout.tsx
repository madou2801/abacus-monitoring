import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Super-CRM MonPermisCPF",
  description: "CRM bénéficiaires — parcours jusqu'à facturation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
