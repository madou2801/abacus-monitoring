# REVIEW — Session Portail 11-12/07/2026 (devis + tarifs + catalogue + simulateur)

> Pour Fable. Résumé exhaustif de ce qui a été fait côté **Portail** (zone : chaîne devis
> `/t/devis`, catalogue formations Supabase, simulateur d'accueil WordPress). Le code déployé
> vit sur le VPS 88 (`/opt/campaign-tracker`), Supabase MPCPF (`ygphyzkyzstjhbhxvjeg`) et la
> page WordPress id 9 — les **scripts et artefacts** sont copiés dans ce dossier pour revue.

## 1. Chaîne devis `/t/devis` (campaign-tracker VPS 88, PM2 id 8)

### 1.1 🔴 Bug MIME résolu (le plus important)
- **Symptôme** : email devis reçu = « juste le PDF, aucun texte ni bouton ».
- **Cause racine** : `mailer_abacus.js` → `sendMailWithAttachment` construisait le MIME **sans la
  ligne vide obligatoire** (`\r\n\r\n`) entre les en-têtes `multipart/mixed` et le 1er boundary
  → la partie `text/html` (corps + bouton « Valider ») tombait dans la zone d'en-têtes malformée
  → les clients n'affichaient que la pièce jointe PDF.
- **Fix** : `].join("\r\n") + "\r\n" + parts.join("\r\n")` (voir `patch_mailer_mime.js`).
- **Vérifié** par Madou : texte + bouton + PDF présents. Corrige mobile ET WordPress (même mailer).
- ⚠️ **Point de revue** : tout email Gmail-raw avec PJ doit avoir ce séparateur — à garder en tête
  si d'autres mailers raw existent ailleurs.

### 1.2 Validation devis en 1 clic (rappel — livré session précédente, branche PR #3)
- `crm.quote_tokens` (migration 0023) : token sha256, usage unique, expiry 30 j, fonction
  `consume_quote_token` atomique. Action `validate_quote_token` dans `intake-api`. Page
  `/devis/valider` (Server Component, secret server-only). `send_quote(notify:false)` renvoie
  `validation_url`. **Vérifié E2E** : clic → quote `accepted` + token consommé (quote `e0f652dd`).

### 1.3 Consolidation n8n → `/t/devis`
- Workflow `BZvogEqIUvv4Vyns` (simulateur WordPress) : le node « Generer PDF » appelait déjà
  `/t/devis` mais rejouait des nodes legacy (`return_pdf`) qui envoyaient un **email doublon
  sans bouton**. → node renommé « Envoi devis (/t/devis) », connexion `→ PDF binaire` coupée.
  **Relances J+1/J+3 (`INSERT relance`) intactes** (branche indépendante). Backup workflow joint.

## 2. Grille tarifaire donneur d'ordre (marge 30 %)

- **Règle** : marge = 30 % du prix de vente → `prix de vente = coût sous-traitant ÷ 0,70`.
- **Sous-traitant réel = Alter Ego PRP** (B2B, tarifs partenaire bas ≠ prix public EDOF). Grille
  partenaire 2018 (guide) + coefficient 2018→2025 ×1,065. Grille publique EDOF Alter Ego = réf marché.
- **Catalogue Supabase `catalogue_formations` = source de vérité, 311 formations, 100 % tarifées** :
  - 52 formations présentiel Alter Ego ajoutées (rebrand logo MPCPF + upload bucket + lignes).
  - 26 « à définir » tarifées au **prix marché** (benchmark web — pas de vrais coûts partenaire dispo).
  - Prix ajustés (décisions Madou) : Permis C/C1 3000, D/D1 3500, FIMO Voy 3150, SSIAP3 5490.
  - **CACES modèle « 1/2/3/4 catégories »** (coefficients R489 ×1,33/1,57/1,73, recyclage ×0,85).
    R489 865/1150/1360/1500 · R482 1956/2600/3075/3390 · R485 708/940 · R486 1560/2075 · R484 995/1320 · R490 1261.
- Grilles détaillées : `GRILLE_TARIFAIRE_MPCPF_2026_v4.csv`, `GRILLE_26_A_DEFINIR_benchmark.csv`.

## 3. Simulateur d'accueil (page WordPress id 9)

- **Méthode d'édition** : page WP « Accueil » éditée via **API REST WP** (`POST /wp-json/wp/v2/pages/9`,
  app password admin) — PAS O2switch/FTP, PAS le fichier local `07_accueil_v3.html` (périmé).
- **3 grilles divergeaient** (simulateur / catalogue / form mobile) → alignées sur le catalogue.
- Simulateur : select CACES reconstruit au modèle **1/2/3/4 catégories** (30 options : 15 initiale +
  15 recyclage), prix non-CACES synchronisés. Décision Madou : **CACES reste « Sur devis » à l'écran**
  (le bon prix part quand même dans l'email). Bloc « Précisez votre besoin CACES » masqué après
  soumission + message « sous 24h/Lucie rappelle » corrigé.
- Bornes `/t/devis` élargies : caces [400,3500], ssiap [1000,5500], securite [80,1500].

## 4. Artefacts dans ce dossier (`session-tarifs-devis/`)
- `devis_route.js` — la route `/t/devis` (source de vérité, PDF pdfkit + email bouton + CRM).
- `patch_mailer_mime.js` — le fix MIME.
- `scripts/` — scripts catalogue (update_tarifs, update_26_prix, update_caces_coef, update_recyclage_1234,
  post_caces_*) + simulateur (build_page9_1234.py, fix_page9_msg.py, push_page9.py) + n8n (patch_n8n).
- `*.csv` — grilles tarifaires.

## 4bis. 🔒 FIX SÉCURITÉ « prix côté client » (ton finding COMMS 25) — FAIT + prouvé E2E

Suite à ton finding : **le prix ne vient plus du navigateur, mais du catalogue Supabase par code**, côté serveur.
- **`devis_route.js`** : ajout d'un lookup `catalogue_formations?code=eq.<code>` → prix autoritaire
  (`tarif_cpf` si CPF-éligible, sinon `tarif_perso`). Repli sur le prix client seulement si code absent
  (transition frontends). Un `prix_cpf` falsifié dans les bornes est désormais ignoré.
- **Frontends envoient le `code`** : simulateur (30 options CACES `data-code`, threadé dans le workflow
  n8n via les 2 nodes) + formulaire mobile (`index.html`, 60 codes sur toutes les formations + payload).
- **Permis B** (finding annexe : 1 code, N forfaits) → **option b retenue** : 7 codes forfaits créés au
  catalogue (`B_18H`…`B_MAN40`), avec `tarif_cpf` ET `tarif_perso` distincts.
- **🐛 Bug de données trouvé en testant** : le code `SSIAP3` (et SSIAP1/2, MAC_APS) **n'était pas unique**
  (initial + recyclages/modules partageaient le code, prix divergents) → le lookup `limit=1` prenait la
  mauvaise ligne (1150 au lieu de 5490). Corrigé : codes rendus uniques (`update_ssiap_codes.js` +
  MAC_APS_SEC). Scan complet : plus aucun code dupliqué à prix divergent exposé au devis.
- **Preuves E2E** : (a) simulateur webhook prix=400 falsifié + code R489_3CAT → quote **1360** ;
  (b) SSIAP3 prix=1000 falsifié → quote **5490** (après dédup) ; (c) Permis B perso code B_20H →
  **1140** (tarif_perso, pas le CPF 1415). Scripts : `scripts/patch_n8n_code.js`, `post_permis_b_forfaits.js`,
  `update_ssiap_codes.js`, `add_codes_page9.py`, `update_index_codes.py`, `deploy_devis_route.js`.
- ⏳ **Reste** : simulateur — les familles non-CACES (poids-lourd/SSIAP/sécurité) sont choisies au niveau
  famille (« sur devis »), sans sélecteur de formation précise → pas de code envoyé (option 2 en cours :
  généraliser le sélecteur). Le cœur du fix (serveur ne fait plus confiance au client dès qu'un code arrive)
  est en place. **C'est la brique à réutiliser pour tarifer le paiement Stripe (Q4) côté serveur par code.**

## 5. Points ouverts / à reviewer en priorité
1. **Bug MIME** (§1.1) — vérifier qu'aucun autre mailer raw ne reproduit l'erreur.
2. **Sécurité validation 1-clic** — le `validation_url` ne doit jamais être loggé/persisté/rejoué
   (déjà respecté dans `/t/devis`, à re-confirmer).
3. **26 formations tarifées au marché** (pas au coût réel Alter Ego, indispo) → Madou récupère la
   grille partenaire la semaine prochaine pour affiner.
4. **Modèle CACES 1/2/3/4** — cohérence catalogue ↔ simulateur ↔ form mobile (les 3 alignés).
