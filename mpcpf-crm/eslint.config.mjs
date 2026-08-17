// ESLint flat config — racine mpcpf-crm (edge functions Deno + tests node + scripts).
// Le back-office `web/` a sa propre config Next (`web/.eslintrc.json`, `next lint`).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "web/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      // Artefacts historiques (patchs déjà appliqués en prod ailleurs) — code MORT
      // au sens spec §2.4, hors périmètre produit. À supprimer dans un ticket dédié.
      "portail/session-tarifs-devis/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      // Edge functions Deno (Web APIs : fetch/crypto/Request/Response/TextEncoder…)
      // + tests/scripts node. `Deno` en lecture seule.
      globals: {
        ...globals.node,
        ...globals.browser,
        Deno: "readonly",
      },
    },
    rules: {
      // `any` toléré (edge functions au contrat souple) — la sûreté vient des tests + tsc.
      "@typescript-eslint/no-explicit-any": "off",
      // Variables/args inutilisés = erreur, sauf préfixe `_` (convention d'ignorance explicite).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // catch vide toléré UNIQUEMENT s'il est explicite (best-effort tracé ailleurs).
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
