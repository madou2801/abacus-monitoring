import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Super-CRM MonPermisCPF",
  description: "CRM bénéficiaires — parcours jusqu'à facturation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <div className="flex min-h-screen">
          <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
            <div className="mb-6 px-2">
              <div className="text-lg font-bold text-slate-900">Super-CRM</div>
              <div className="text-xs text-slate-500">MonPermisCPF</div>
            </div>
            <Nav />
          </aside>
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}
