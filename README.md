# AbacusPay 🌍💳

**Passerelle de paiement africaine unifiée — un « Stripe africain ».**

AbacusPay expose **une seule API** aux marchands et route en interne vers les
agrégateurs et opérateurs locaux (LigDiCash, et bientôt Flutterwave, PayDunya,
Orange Money, Wave, MTN MoMo…). Vous intégrez **une fois**, vous encaissez et
décaissez partout en Afrique.

> Inspiré du fonctionnement de **LigDiCash** (zone UEMOA) et **Flutterwave**
> (panafricain) : checkout hébergé, charges directes, payouts, webhooks signés,
> vérification de transaction.

---

## 🎯 Le principe (comment ça marche)

```
  Marchand ──HTTP──▶  AbacusPay  ──adaptateur──▶  Fournisseur ──▶ Opérateur
   (1 API)            (cœur unifié)               (LigDiCash…)   (Orange Money…)
                          │
                          └── webhooks signés ◀── notifications fournisseur
```

- **API unifiée** : `charges` (encaissement), `payouts` (décaissement),
  `webhooks` (notifications). Montants, statuts et erreurs **normalisés**,
  indépendants du fournisseur.
- **Couche d'abstraction** : chaque fournisseur implémente l'interface
  `PaymentProvider`. Ajouter Flutterwave = écrire **une classe**, sans toucher au
  cœur.
- **Routing** : le `ProviderRegistry` choisit le bon fournisseur selon la méthode
  et la devise (extensible : coût, géo, disponibilité, préférence marchand).

État actuel : **MVP mono-provider** opérationnel avec **LigDiCash** (mode `mock`
par défaut → développable sans clés réelles).

---

## 🚀 Démarrage rapide

```bash
npm install
cp .env.example .env          # ajustez MERCHANT_API_KEYS et WEBHOOK_SIGNING_SECRET
npm run dev                   # http://localhost:4000  (LIGDICASH_MOCK=true)
```

Vérifs : `npm run typecheck` · `npm test` · `npm run build && npm start`

### Exemple — créer un encaissement

```bash
curl -X POST http://localhost:4000/v1/charges \
  -H "Authorization: Bearer sk_test_changeme" \
  -H "Idempotency-Key: cmd-2026-0001" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "currency": "XOF",
    "method": "mobile_money",
    "customer": { "phone": "+22670000000", "name": "Awa" },
    "description": "Abonnement Premium"
  }'
```

Réponse :

```json
{
  "id": "chg_…",
  "object": "charge",
  "status": "pending",
  "amount": 5000,
  "currency": "XOF",
  "provider": "ligdicash",
  "checkout_url": "https://app.ligdicash.com/pay/v01/…",
  "...": "..."
}
```

Le client paie via `checkout_url`. Le fournisseur notifie ensuite
`POST /v1/webhooks/ligdicash`, AbacusPay met à jour la charge et émet à son tour
un **webhook signé** vers le marchand (`charge.succeeded` / `charge.failed`).

---

## 📡 API

| Méthode | Endpoint | Description |
|--------|-----------------------------|-------------------------------------------|
| `GET`  | `/health`                   | Santé du service |
| `POST` | `/v1/charges`               | Créer un encaissement |
| `GET`  | `/v1/charges/:id`           | Statut d'un encaissement (rafraîchi) |
| `POST` | `/v1/payouts`               | Créer un décaissement |
| `GET`  | `/v1/payouts/:id`           | Statut d'un décaissement |
| `POST` | `/v1/webhooks/:provider`    | Réception des webhooks fournisseurs |

**Auth marchand** : `Authorization: Bearer <clé sk_…>`
**Idempotence** : en-tête `Idempotency-Key` (rejouer ⇒ même ressource, pas de
double débit).

Devises : `XOF`, `XAF`, `NGN`, `GHS`, `KES`, `ZAR`, `UGX`, `RWF`, `USD`, `EUR`.
Montants en **plus petite unité** (ex. `5000` = 5000 F CFA en XOF, 0 décimale).

---

## 🔐 Sécurité (intégrée)

- Montants en **entiers** (jamais de flottants) — module `money`.
- **Idempotence** sur charges & payouts.
- **Webhooks entrants** vérifiés par **HMAC-SHA256** + comparaison en temps
  constant (anti-timing).
- **Webhooks sortants signés** vers le marchand.
- Clés API comparées en **temps constant**.
- `helmet`, **rate-limiting**, validation stricte **Zod**, **fail-fast** sur
  config invalide, garde-fous **production** (refus des secrets par défaut,
  refus du mode mock).
- **Redaction** des secrets/OTP dans les logs.

---

## 🏗️ Architecture & roadmap

Voir **[ARCHITECTURE.md](./ARCHITECTURE.md)** pour le schéma détaillé, le modèle
de données, le flux complet et la feuille de route (Flutterwave, base de données,
réconciliation, tableau de bord, KYC…).

```
src/
  config.ts            Config validée (fail-fast)
  money/               Type Money + devises africaines
  domain/              Modèle (Charge, Payout, statuts) + repository
  providers/           Interface PaymentProvider + adaptateur LigDiCash + registre
  services/            Logique métier (charge, payout, webhook, notifier)
  middleware/          Auth, validation, idempotence HTTP, erreurs
  routes/              Endpoints HTTP + (dé)sérialisation
  crypto/              Signatures HMAC
  app.ts / index.ts    Assemblage Express + bootstrap
tests/                 Tests unitaires & d'intégration (vitest)
```

---

## 📦 Monitoring (héritage)

Ce dépôt contenait initialement des scripts de monitoring VPS
(`health-check.sh`, `health-server.js`, `nginx-health.conf`, `deploy.sh`). Ils
restent présents et indépendants de la plateforme de paiement.
