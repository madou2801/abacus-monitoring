// deno.d.ts — déclaration minimale du runtime Deno pour permettre le
// typecheck des edge functions avec tsc (Node). À l'exécution, Supabase
// fournit le vrai runtime Deno.
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
  env: { get(key: string): string | undefined };
};
