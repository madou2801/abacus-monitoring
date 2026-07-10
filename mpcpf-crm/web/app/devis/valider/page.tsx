// page.tsx — Validation de devis par lien 1-clic (Server Component, route publique).
// Le token (hex brut) est reçu en query param `t`, hashé côté serveur et
// transmis à l'intake-api. Le secret INTAKE_API_SECRET n'est jamais exposé
// au navigateur. Le token lui-même n'est jamais loggué.

interface Props {
  searchParams: { t?: string };
}

type ValidationResult =
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "already_processed" }
  | { kind: "validated" };

async function validateToken(token: string): Promise<ValidationResult> {
  const apiUrl = process.env.INTAKE_API_URL;
  const apiSecret = process.env.INTAKE_API_SECRET;

  if (!apiUrl || !apiSecret) return { kind: "error" };

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "validate_quote_token", token }),
      cache: "no-store",
    });

    if (!res.ok) return { kind: "error" };

    const data = (await res.json()) as {
      ok?: boolean;
      validated?: boolean;
      already_processed?: boolean;
    };

    if (!data.ok) return { kind: "error" };
    if (data.validated) return { kind: "validated" };
    return { kind: "already_processed" };
  } catch {
    return { kind: "error" };
  }
}

export default async function DevisValiderPage({ searchParams }: Props) {
  const token = searchParams.t;

  const result: ValidationResult = token
    ? await validateToken(token)
    : { kind: "missing" };

  const isConfirmed = result.kind === "validated";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
        {isConfirmed ? (
          <>
            <div className="mb-4 text-4xl">✅</div>
            <h1 className="mb-2 text-xl font-bold text-slate-900">Devis validé</h1>
            <p className="text-sm text-slate-600">
              Votre devis de formation a bien été validé. Notre équipe prendra contact
              avec vous très prochainement pour finaliser votre dossier.
            </p>
            <p className="mt-4 text-xs text-slate-400">MonPermisCPF — merci de votre confiance</p>
          </>
        ) : (
          <>
            <div className="mb-4 text-4xl">🔗</div>
            <h1 className="mb-2 text-xl font-bold text-slate-900">Lien de validation</h1>
            <p className="text-sm text-slate-600">
              Ce lien n'est plus disponible. Il a peut-être déjà été utilisé ou
              a expiré. Si vous avez besoin d'aide, contactez notre équipe.
            </p>
            <p className="mt-4 text-xs text-slate-400">MonPermisCPF</p>
          </>
        )}
      </div>
    </div>
  );
}
