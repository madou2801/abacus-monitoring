"use client";

// Filet de sécurité : au lieu du crash blanc « Application error », on affiche un
// écran lisible avec un bouton Réessayer. Le digest reste visible pour le diagnostic.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <div className="mb-2 text-2xl" aria-hidden="true">⚠️</div>
        <h2 className="text-lg font-semibold text-amber-900">Une erreur est survenue</h2>
        <p className="mt-2 text-sm text-amber-800">
          La page n&apos;a pas pu se charger complètement. Cela peut être temporaire
          (connexion à la base). Réessayez ; si le problème persiste, signalez-le.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => reset()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Tableau de bord
          </a>
        </div>
        {error?.digest && (
          <p className="mt-3 text-[11px] text-amber-500">Réf. technique : {error.digest}</p>
        )}
      </div>
    </div>
  );
}
