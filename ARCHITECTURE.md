# Architecture — AbacusPay

Ce document explique comment AbacusPay s'inspire de **LigDiCash** et
**Flutterwave** pour bâtir une passerelle de paiement **africaine unifiée**, et
trace la feuille de route au-delà du MVP.

---

## 1. Ce qu'on a appris de LigDiCash & Flutterwave

| Concept | LigDiCash (UEMOA) | Flutterwave (panafricain) | Choix AbacusPay |
|---|---|---|---|
| Auth | `Apikey` + token Bearer | clés `secret`/`public`/`encryption` | Auth marchand par clé `sk_…` (Bearer), secrets fournisseurs côté serveur |
| Encaissement hébergé | « payin avec redirection » (LAR) → URL de checkout | Standard Checkout (redirect) | `checkout_url` renvoyé par la charge |
| Encaissement direct | « payin sans redirection » (LSR) + OTP/USSD | Direct Charge (carte/MoMo) | prévu (méthode `card`/`mobile_money` directe) |
| Décaissement | Payout vers wallet MoMo | Transfers | `POST /v1/payouts` |
| Confirmation | `confirm?invoiceToken=…` | `/verify` | polling `getChargeStatus` + webhooks |
| Notification | callback fournisseur | webhooks signés (secret hash) | webhooks entrants HMAC + sortants signés |

**Constat clé** : un « Stripe africain » n'est pas un PSP de plus — c'est une
**couche d'agrégation** qui *normalise* des fournisseurs hétérogènes derrière une
API stable. La valeur est dans l'abstraction, l'idempotence, la réconciliation et
la fiabilité des webhooks.

---

## 2. Schéma d'ensemble

```
                         ┌──────────────────────────────────────────┐
   Marchand              │                AbacusPay                  │
  (site/app)             │                                           │
      │  POST /v1/charges │   routes ─▶ services ─▶ ProviderRegistry │
      ├──────────────────▶│      │          │             │          │
      │  201 + checkout_url      │      idempotence    resolve(      │
      │◀──────────────────│      │      money/devise   method,cur)   │
      │                   │   repository (état)          │           │
      │                   │                              ▼           │
      │                   │                     ┌─────────────────┐  │
      │                   │                     │ PaymentProvider │  │
      │                   │                     │  (LigDiCash…)   │──┼──▶ API fournisseur
      │   webhook signé   │   notifier ◀── webhook.service ◀───────┼── callback fournisseur
      │◀──────────────────│                                          │
                          └──────────────────────────────────────────┘
```

---

## 3. Flux d'un encaissement (charge)

1. Marchand → `POST /v1/charges` (auth + `Idempotency-Key`).
2. Validation Zod → `makeMoney` (entier + devise supportée).
3. `ChargeService` : si clé d'idempotence connue ⇒ renvoie la charge existante.
4. `ProviderRegistry.resolve(method, currency)` choisit le fournisseur.
5. **Persiste la charge `pending` AVANT** l'appel fournisseur (réconciliable même
   en cas de crash).
6. `provider.createCharge()` → `providerReference` + `checkout_url`.
7. Client paie → fournisseur appelle `POST /v1/webhooks/:provider`.
8. `WebhookService` vérifie la signature, retrouve la charge par
   `providerReference`, applique le statut (transition **idempotente**, figée à
   l'état terminal).
9. Sur état terminal, `WebhookNotifier` émet `charge.succeeded|failed` **signé**
   au marchand.
10. Filet de sécurité : `GET /v1/charges/:id` re-interroge le fournisseur si le
    statut n'est pas terminal (polling).

Le **payout** suit le même cycle de vie.

---

## 4. Décisions de conception

- **Argent = entiers** en plus petite unité. Les francs CFA (XOF/XAF) ont **0
  décimale** : un bug de ×100 est une faute classique qu'on élimine au niveau du
  type.
- **Statuts unifiés** (`pending|processing|succeeded|failed|cancelled`) : le
  marchand ne voit jamais les statuts propriétaires.
- **Idempotence partout** : clés sur charges/payouts, webhooks rejouables.
- **Persistance avant effet de bord** : aucune transaction « fantôme ».
- **Fournisseurs = plugins** : `PaymentProvider` + `ProviderRegistry`.
- **Sécurité par défaut** : HMAC temps constant, helmet, rate-limit, validation,
  garde-fous production, redaction des logs.

---

## 5. Feuille de route

### Court terme (durcir le MVP)
- [ ] **Persistance Postgres** (Prisma) avec contrainte `UNIQUE(idempotency_key)`
      pour l'idempotence concurrente + table d'audit immuable.
- [ ] **File de webhooks sortants** (retries + backoff exponentiel, dead-letter).
- [ ] **Confirmer le contrat LigDiCash réel** (champs/headers/signature) avec la
      doc officielle et clés sandbox ; tester en bout-à-bout.
- [ ] Pagination + listing (`GET /v1/charges`).

### Moyen terme (multi-fournisseurs = la promesse)
- [ ] **Adaptateur Flutterwave** (Standard Checkout, Transfers, `verify`,
      webhook `verif-hash`).
- [ ] Adaptateurs **PayDunya**, **Wave**, **Orange Money**, **MTN MoMo**.
- [ ] **Routing intelligent** : coût, taux de succès, géo, bascule en cas de
      panne d'un fournisseur (failover).
- [ ] **Réconciliation** automatique (rapports fournisseurs vs. transactions).

### Long terme (produit type Stripe)
- [ ] **Multi-tenant** : comptes marchands, clés `pk_/sk_` `test|live`, RBAC.
- [ ] **Tableau de bord** (transactions, soldes, exports, remboursements).
- [ ] **Ledger** comptable double-entrée + soldes par devise.
- [ ] **KYC/AML**, conformité **PCI-DSS** (si cartes en direct), 3-D Secure.
- [ ] **Liens de paiement**, abonnements/récurrents, **split payments**.
- [ ] **SDKs** (JS, PHP, Python, mobile) + bibliothèque de plugins e-commerce.

---

## 6. Limites connues du MVP

- Stockage **en mémoire** (perdu au redémarrage) → à remplacer par Postgres.
- Webhooks sortants **logués**, pas encore réellement émis en HTTP.
- Le contrat LigDiCash est modélisé **de mémoire** : à valider avec la doc
  officielle et l'environnement sandbox avant toute mise en production.
- Mode `mock` actif par défaut (réponses simulées déterministes).
