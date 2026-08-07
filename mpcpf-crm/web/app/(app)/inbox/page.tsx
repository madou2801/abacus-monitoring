import { crm } from "@/lib/supabase";
import { fetchInbox, counterpartEmail } from "@/lib/gmail";
import { InboxClient, type Conversation } from "./InboxClient";

export const dynamic = "force-dynamic";

// Boîte de réception globale (contact@monpermiscpf.com), façon HubSpot Conversations :
// liste des fils à gauche, message + réponse à droite, rapprochement automatique avec
// la fiche bénéficiaire quand l'adresse correspond.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: { q?: string; filter?: string };
}) {
  const filter = searchParams.filter === "unread" ? "unread" : "all";
  const search = (searchParams.q || "").trim();

  // Construit la requête Gmail : recherche libre + éventuel filtre non-lus.
  let gq = search || "in:inbox";
  if (filter === "unread") gq = search ? `${search} is:unread` : "is:unread in:inbox";

  const messages = await fetchInbox(gq, 40);

  // Regroupe par fil de discussion (le message le plus récent représente le fil ;
  // le fil est « non lu » si au moins un de ses messages l'est).
  const byThread = new Map<string, Conversation>();
  for (const m of messages) {
    const key = m.threadId || m.id;
    const existing = byThread.get(key);
    if (!existing) {
      byThread.set(key, { ...m, count: 1, counterpart: counterpartEmail(m), benef: null });
    } else {
      existing.count += 1;
      if (m.unread) existing.unread = true;
    }
  }
  const conversations = Array.from(byThread.values()).sort((a, b) => b.internalDate - a.internalDate);

  // Rapprochement bénéficiaires : une seule requête sur les adresses des interlocuteurs.
  const emails = Array.from(new Set(conversations.map((c) => c.counterpart).filter(Boolean)));
  if (emails.length) {
    const { data } = await crm()
      .from("beneficiaries")
      .select("id, first_name, last_name, email")
      .in("email", emails);
    const map = new Map<string, { id: string; name: string }>();
    for (const b of (data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]) {
      const em = (b.email || "").toLowerCase();
      if (em) map.set(em, { id: b.id, name: [b.first_name, b.last_name].filter(Boolean).join(" ") || em });
    }
    for (const c of conversations) {
      const hit = map.get(c.counterpart);
      if (hit) c.benef = hit;
    }
  }

  const unreadCount = conversations.filter((c) => c.unread).length;

  return (
    <div className="flex h-[calc(100vh-1rem)] flex-col p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Boîte de réception</h1>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          contact@monpermiscpf.com
        </span>
        {unreadCount > 0 && (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
            {unreadCount} non lu{unreadCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <InboxClient conversations={conversations} filter={filter} search={search} />
    </div>
  );
}
