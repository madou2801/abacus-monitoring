"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Tableau de bord", icon: "📊" },
  { href: "/beneficiaires", label: "Bénéficiaires", icon: "🧑" },
  { href: "/pipeline", label: "Pipeline", icon: "🗂️" },
  { href: "/entreprises", label: "Entreprises", icon: "🏢" },
  { href: "/auto-ecoles", label: "Auto-écoles", icon: "🏫" },
  { href: "/facturation", label: "Facturation", icon: "🧾" },
  { href: "/parametres", label: "Paramètres", icon: "⚙️" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
