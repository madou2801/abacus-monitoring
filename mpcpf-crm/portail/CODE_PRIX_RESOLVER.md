# Mapping `code formation → prix` — pour la session PAIEMENT (Q4)

> Portail → session Paiement. Exposé pour que le paiement Stripe résolve le montant depuis le
> **catalogue** (source de vérité), par **code explicite**, jamais depuis un libellé parsé ni un
> prix côté navigateur. Rejoint la note Fable (COMMS 25/27) : sur le chemin paiement, fermer le
> repli prix-client.

## Source de vérité
Table Supabase MPCPF (`ygphyzkyzstjhbhxvjeg`) : **`public.catalogue_formations`**, colonne **`code`**.
Chaque code → `tarif_cpf`, `tarif_perso`, `intitule`, `famille`, `actif`. Résolution serveur uniquement
(clé service). **Le simulateur et le formulaire mobile envoient DÉJÀ ce `code`** dans leur payload
(`code:` — mis en place 12/07). Le paiement peut le récupérer tel quel.

## Résolveur réutilisable
Module prêt à l'emploi : **`code-price-resolver.js`** (même dossier). Node 18+ (`fetch` global).
```js
const { resolveFormationPrice } = require("./code-price-resolver");
// PAIEMENT : strict=true → throw si code absent/introuvable (PAS de repli client)
const f = await resolveFormationPrice(code, { cpfEligible: false, strict: true });
// f.amount_cents = montant Stripe autoritaire ; f.intitule = nom produit ; f.prix = € entier
```
- **`cpfEligible`** : true → `tarif_cpf` (repli perso) ; false → `tarif_perso` (repli cpf). Certaines
  formations n'ont qu'un `tarif_perso` (CACES/SSIAP/sécurité = non CPF) — le résolveur gère le repli.
- **`strict:true` = mode PAIEMENT** : un paiement sans code résoluble → **erreur** (refus), jamais le
  prix du navigateur. `strict:false` = mode devis (repli toléré, document + bornes).

## ⚠️ Q4 — passer le CODE, pas un libellé
Ne PAS déduire `type_boite` en parsant un libellé (`detectTypeBoite`) : un libellé qui change ou mal
mappé = mauvais montant, **débité instantanément** en redirection directe. Le formulaire/simulateur
doit passer le **`code` structuré** (issu de la sélection) dans l'URL/POST → le serveur résout le prix.
Exemple : `?code=B_20H&situation=perso` (pas `?forfait=BVA%2020h`).

## Familles de codes (extrait — énumération complète = requête catalogue)
- **permis** (22) : `B` (960 cpf / 776 perso), `B_18H` `B_20H` `B_30H` `B_MAN20` `B_MAN25` `B_MAN30`
  `B_MAN40`, `A2` (1415/1420), `BE` `BE_10H` `BE_20H`, `CODE_ETG` `CODE_ETM` (120/79), `C` `C1` (3000),
  `CE` `D` `D1` `DE` `PL_C1E` `PL_D1E` (3500).
- **fimo_fco** (4) : `FIMOM` 3000, `FIMOV` 3150, `FCOM` `FCOV` 1500.
- **caces** (36) : `R489` 865 + `R489_2CAT` 1150 / `_3CAT` 1360 / `_4CAT` 1500 (+ `_RECYC` variants),
  idem `R482` (1956/2600/3075/3390), `R485` (708/940), `R486` (1560/2075), `R484` (995/1320), `R490` 1261.
  ⚠️ chaque R a **2 lignes même code** (fiche « Conduite » + « Formation test ») **au même prix** →
  `limit=1` OK (prix déterministe). Recyclages = suffixe `_RECYC` / `_2CAT_RECYC`…
- **securite** (71) : SSIAP `SSIAP1/2/3` (initial) + `SSIAP{1,2,3}_RECYC/_RAN/_MOD…` (codes rendus
  UNIQUES le 12/07 — avant, `SSIAP3` non unique cassait le lookup) ; hab élec `HAB_*` ; hauteur/échaf
  `HAUT_*`/`ECHAF_*` ; AIPR `AIPR_*_PRES` ; SST `SST`/`MAC_SST_PRES` ; APS `CQP_APS`/`MAC_APS`/`MAC_APS_SEC` ;
  prévention `PREV_*` ; incendie `INC_*` ; secourisme `SECOUR_*` ; chimie `CHIM_*` ; `SURETE_ATTAQUE_TERRORISTE`.
- **elearning** (`EL_*`, `AB_*`) : e-learning E Forma pro / ABACUS. ⚠️ le code ABACUS `AB_ENGLISH_…`
  est non-unique à prix divergents — hors périmètre paiement permis/sécurité, à ne pas utiliser tel quel.

## Résumé sécurité (devis + paiement)
1. Prix **toujours** résolu serveur depuis le catalogue par `code`. Jamais le prix du navigateur.
2. Paiement : `strict:true` (refus si code non résoluble). Devis : repli toléré.
3. Frontends passent le **code structuré**, pas un libellé à parser.
4. `intitule` du catalogue = libellé produit (UTF-8 correct, évite les « ? » d'accents).
