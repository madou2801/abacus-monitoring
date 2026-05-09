// Supabase Edge Function : /api/gaia/ae-fr/{opportunites|signaux}
// Deploy : supabase functions deploy gaia-ae-fr --project-ref <ref>
//
// GET /opportunites?region=11&min_score=60&limit=100
// GET /signaux?niveau=rouge|orange&region=93&limit=100
//
// Sécurité : exige header Authorization: Bearer <jwt> (RLS Supabase appliqué).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SCHEMA = "gaia_autoecoles_fr";

function getClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } }, db: { schema: SCHEMA } },
  );
}

async function handleOpportunites(url: URL, supa: ReturnType<typeof createClient>) {
  const region = url.searchParams.get("region");
  const minScore = Number(url.searchParams.get("min_score") ?? 0);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  let q = supa.from("vw_opportunites_commerciales_ae_fr").select("*").gte(
    "score_opportunite_commerciale",
    minScore,
  ).order("score_opportunite_commerciale", { ascending: false }).limit(limit);
  if (region) q = q.eq("code_region", region);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ count: data?.length ?? 0, data });
}

async function handleSignaux(url: URL, supa: ReturnType<typeof createClient>) {
  const region = url.searchParams.get("region");
  const niveau = url.searchParams.get("niveau") ?? "rouge";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  let q = supa.from("signaux_faibles_ae").select("*").eq("niveau_alerte", niveau)
    .order("score_fragilite", { ascending: false }).limit(limit);
  if (region) q = q.eq("code_region", region);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ count: data?.length ?? 0, data });
}

serve(async (req) => {
  const url = new URL(req.url);
  const supa = getClient(req);

  if (url.pathname.endsWith("/opportunites")) return handleOpportunites(url, supa);
  if (url.pathname.endsWith("/signaux"))      return handleSignaux(url, supa);

  return Response.json(
    {
      service: "gaia-ae-fr",
      endpoints: ["/opportunites?region=&min_score=&limit=", "/signaux?niveau=&region=&limit="],
    },
    { headers: { "content-type": "application/json" } },
  );
});
