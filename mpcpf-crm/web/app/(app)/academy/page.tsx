import { ref } from "@/lib/supabase";
import Dashboard, { type Send } from "./Dashboard";

export const dynamic = "force-dynamic";

async function load() {
  let sends: Send[] = [];
  let tableExists = true;
  let err: string | null = null;
  try {
    const c = ref();
    const s = await c
      .from("abacus_academy_sends")
      .select(
        "id,structure,email,type,pays,dirigeant,statut,sent_at,delivered_at,opened_at,replied_at,bounce_raison,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (s.error) {
      // Dégradation gracieuse : table pas encore créée dans oezaby.
      tableExists = false;
      err = s.error.message;
    } else {
      sends = (s.data as Send[]) ?? [];
    }
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
    tableExists = false;
  }
  return { sends, tableExists, err };
}

export default async function AcademyPage() {
  const { sends, tableExists, err } = await load();
  return <Dashboard sends={sends} tableExists={tableExists} err={err} />;
}
