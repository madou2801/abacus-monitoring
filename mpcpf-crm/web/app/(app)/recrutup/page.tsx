import { ref } from "@/lib/supabase";
import Dashboard, { type Prospect, type Lead, type Send } from "./Dashboard";

export const dynamic = "force-dynamic";

async function load() {
  let prospects: Prospect[] = [];
  let leads: Lead[] = [];
  let sends: Send[] = [];
  let sendsTableExists = true;
  let err: string | null = null;
  try {
    const c = ref();
    const p = await c
      .from("v_recrutup_prospects")
      .select(
        "siren,entreprise,code_postal,commune,departement,nb_offres,score_max,secteurs,postes,email_principal,tous_emails,email_mx_valide,has_email",
      )
      .order("score_max", { ascending: false })
      .limit(2000);
    if (p.error) throw new Error(p.error.message);
    prospects = (p.data as Prospect[]) ?? [];

    const l = await c
      .from("recrutup_leads")
      .select("id,societe,ville,code_postal,nb_profils,dispositif,email,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (l.error) throw new Error(l.error.message);
    leads = (l.data as Lead[]) ?? [];

    const s = await c.from("recrutup_sends").select("id,email,statut,ts").order("ts", { ascending: false }).limit(2000);
    if (s.error) sendsTableExists = false;
    else sends = (s.data as Send[]) ?? [];
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  return { prospects, leads, sends, sendsTableExists, err };
}

export default async function RecrutupPage() {
  const { prospects, leads, sends, sendsTableExists, err } = await load();
  return (
    <Dashboard prospects={prospects} leads={leads} sends={sends} sendsTableExists={sendsTableExists} err={err} />
  );
}
