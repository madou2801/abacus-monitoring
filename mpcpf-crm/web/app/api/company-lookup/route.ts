import { NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Recherche d'entreprise via l'API publique recherche-entreprises.api.gouv.fr
// (DINUM — agrège SIRENE + RNE/INPI). Par SIREN, SIRET, nom ou adresse. Sans clé.
export type CompanyHit = {
  raison_sociale: string;
  siren: string;
  siret: string;
  adresse: string;
  code_postal: string;
  ville: string;
  naf: string;
  contact_prenom: string;
  contact_nom: string;
};

export async function POST(req: Request) {
  const me = await getStaffUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let q = "";
  try {
    const b = (await req.json()) as { q?: string };
    q = (b?.q || "").trim();
  } catch {
    /* corps invalide */
  }
  if (q.length < 3) return NextResponse.json({ ok: false, error: "Requête trop courte (min. 3 caractères)." }, { status: 400 });

  try {
    const url =
      "https://recherche-entreprises.api.gouv.fr/search?q=" +
      encodeURIComponent(q) +
      "&page=1&per_page=6";
    const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
    if (!res.ok) return NextResponse.json({ ok: false, error: `API indisponible (${res.status})` }, { status: 502 });
    const data = (await res.json()) as { results?: any[]; total_results?: number };

    const results: CompanyHit[] = (data.results || []).map((r: any) => {
      const s = r.siege || {};
      const street =
        [s.numero_voie, s.type_voie, s.libelle_voie].filter(Boolean).join(" ") || s.adresse || "";
      const dir = Array.isArray(r.dirigeants) && r.dirigeants[0] ? r.dirigeants[0] : {};
      let contact_prenom = "";
      let contact_nom = "";
      if (dir.type_dirigeant === "personne physique") {
        contact_prenom = dir.prenoms ? String(dir.prenoms).split(/\s+/)[0] : "";
        contact_nom = dir.nom || "";
      } else if (dir.denomination) {
        contact_nom = dir.denomination;
      }
      return {
        raison_sociale: r.nom_raison_sociale || r.nom_complet || "",
        siren: r.siren || "",
        siret: s.siret || "",
        adresse: street,
        code_postal: s.code_postal || "",
        ville: s.libelle_commune || "",
        naf: r.activite_principale || s.activite_principale || "",
        contact_prenom,
        contact_nom,
      };
    });

    return NextResponse.json({ ok: true, total: data.total_results ?? results.length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
