# Lucie — Étape 3 (backend campaign-tracker) : code exact pour review Fable

> Déposé par la **session Portail** pour contrôle croisé de Fable (réf. COMMS entrée 12).
> Fichier patché : `/opt/campaign-tracker/server.js` (VPS 88, pm2 id 8). Backup `server.js.bak-lucie-*`.
> **Aucun secret** dans ces blocs. Déployé + testé le 09/07 (voir tests en bas).

Répond à ton contrat (LUCIE_REVIEW.md) : **Q3.2** (réponse structurée), **Q3.4** (inscription sans email), **Q4** (idempotence SMS au backend). Les couches Q3.1 (`speak_after_execution=true`) et Q3.3 (prompt) + Q1/Q2 sont **config Retell = étapes 1-2, non incluses ici**.

---

## Edit 1 — `/t/create-account-welcome` : inscription vocale SANS email (Q3.4)
**Avant** (c'était le refus qui a causé « échec masqué ») :
```js
    if (!email) {
      return res.json({ success: false, error: "Email requis" });
    }
```
**Après** :
```js
    // [LUCIE] Inscription vocale SANS email : ne pas refuser — on enregistre la demande
    // (lead par telephone, statut "a_completer") ; l'email est collecte via le formulaire SMS.
    if (!email) {
      if (!telephone) {
        return res.json({ ok: false, success: false, error: "contact_required", message: "Telephone ou email requis pour enregistrer l'inscription." });
      }
      try {
        const { data: exL } = await supabase.from("leads").select("id").eq("telephone", telephone).order("created_at", { ascending: false }).limit(1);
        const patchL = { prenom: prenom || null, nom: nom || null, source: source || "voix-inscription", statut: "a_completer", type_demande: formation_name || formation_code || null, updated_at: new Date().toISOString() };
        if (exL && exL.length) await supabase.from("leads").update(patchL).eq("id", exL[0].id);
        else await supabase.from("leads").insert({ telephone: telephone, email: "", ...patchL, data: { inscription_voix: { formation: formation_name || formation_code || null, at: new Date().toISOString() } } });
      } catch (eL) { console.error("[Create Account] voix-inscription lead:", eL.message); }
      return res.json({ ok: true, success: true, status: "a_completer", message: "Inscription enregistree. Un conseiller vous recontacte ; completez vos informations via le formulaire envoye par SMS." });
    }
```

## Edit 2 — réponse succès : ajout `ok:true` (Q3.2)
```js
    res.json({
      ok: true,          // <-- ajouté : l'agent ne confirme QUE si ok:true
      success: true,
      account_created: accountResult ? accountResult.success : false,
      ...
```

## Edit 3 — catch : réponse structurée 200 (jamais 5xx nu) (Q3.2)
**Avant** : `res.status(500).json({ success: false, error: err.message });`
**Après** :
```js
    res.json({ ok: false, success: false, error: "server_error", message: err.message });
```

## Edit 4 — `lucieSmsAlreadySent` : idempotence 7 j + ré-arme si rempli (Q4)
**Avant** (dédup « pour toujours », sans fenêtre) :
```js
    const { data, error } = await supabase.from('sms_log').select('id').eq('telephone', e164).eq('workflow', 'lucie_form_sms').limit(1);
    ...
    return Array.isArray(data) && data.length > 0;
```
**Après** :
```js
    // Idempotence 7 jours (Fable Q4) : skip si envoye < 7 j ET formulaire non rempli depuis.
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { data, error } = await supabase.from('sms_log').select('sms_date').eq('telephone', e164).eq('workflow', 'lucie_form_sms').gte('sms_date', since).order('sms_date', { ascending: false }).limit(1);
    if (error) { console.error('[Lucie SMS dedup] check', error.message); return false; }
    if (!Array.isArray(data) || data.length === 0) return false;
    const lastSent = data[0].sms_date;
    const telLocal = e164.replace(/^\+33/, '0');
    const { data: filled } = await supabase.from('leads').select('id').or('telephone.eq.' + e164 + ',telephone.eq.' + telLocal).eq('statut', 'qualifie').gte('updated_at', lastSent).limit(1);
    if (filled && filled.length) return false; // rempli depuis -> on re-arme l'envoi
    return true; // envoye < 7 j et non rempli -> skip
```

## Edit 5 — `/t/send-form-sms` : réponses structurées (Q4 + Q3.2)
**Avant** : `return res.status(400).json({ error: 'phone invalide' });` puis `res.json({ ok: ok, sent_to, deduped: ok === 'dedup' });`
**Après** :
```js
    if (!phone || phone.replace(/\D/g,'').length < 9) return res.json({ ok: false, error: 'phone_invalide', message: 'Numero invalide.' });
    ...
    const r = await sendFormSmsOnce(phone, message, b.call_id || null);
    if (r === 'dedup') return res.json({ ok: true, sent_to: phone, skipped: 'already_sent' });
    res.json({ ok: !!r, sent_to: phone });
  } catch (e) { console.error('[Form SMS]', e.message); res.json({ ok: false, error: 'server_error', message: e.message }); }
```

---

## Tests exécutés (09/07, données de test purgées)
1. `POST /t/create-account-welcome` **sans email** (`telephone` + `formation_name`) → `{"ok":true,"success":true,"status":"a_completer","message":"..."}` (HTTP 200). ✅
2. Dédup SMS : pré-insertion d'un `sms_log` (aujourd'hui) puis `POST /t/send-form-sms` même numéro → `{"ok":true,"sent_to":"...","skipped":"already_sent"}` (aucun SMS envoyé). ✅

## Points ouverts pour ta review
- Le champ **`ok`** (mon choix) vs `success` : le prompt Retell devra brancher sur `ok:true`. OK pour toi, ou tu préfères un autre nom ?
- « Rempli » = lead `statut='qualifie'` mis à jour après l'envoi — définition suffisante, ou tu veux un autre marqueur (ex. `date_inscription`) ?
- Inscription vocale sans email : je crée/mets à jour un **lead** (`public.leads`, statut `a_completer`). Est-ce le bon réceptacle, ou tu veux que ça passe par `intake-api` (CRM) ?

---

## ✅ Contre-revue Fable (10/07) — validé avec 1 BUG à corriger avant le re-test

### 🔴 Bug (Edit 1) : le catch avale l'échec DB et répond quand même `ok:true`
```js
} catch (eL) { console.error("[Create Account] voix-inscription lead:", eL.message); }
return res.json({ ok: true, ... "Inscription enregistree..." });
```
Si l'INSERT/UPDATE `leads` échoue (Supabase down, contrainte), on logge… et on renvoie
`ok:true` → Lucie confirme « enregistré » alors que **rien n'est stocké**. C'est
littéralement l'erreur 2 de l'appel test (succès annoncé sur échec), déplacée d'un cran.
Correctif : dans le catch, `return res.json({ ok:false, error:"lead_write_failed",
message:"Je n'ai pas pu enregistrer — un conseiller rappellera." })` — l'agent bascule
alors sur son fallback parlé, comme prévu par le contrat Q3.

### 🟠 Incohérence de format téléphone (Edit 1 vs Edit 4) — risque de leads en double
Edit 4 matche les DEUX formats (`+33…` ET `0…`) ; Edit 1 fait `eq("telephone", telephone)`
sur le format brut reçu → si le lead existant est stocké dans l'autre format, on **crée un
doublon** au lieu de mettre à jour. Appliquer la même normalisation double-format dans
Edit 1 (et idéalement : normaliser en E.164 à l'écriture, partout).

### 🟡 Deux détails
- Edit 1 : `email: ""` à l'insert → préférer `null` (un `""` passe les tests `!email` mais
  peut polluer les exports/le CRM).
- Edit 4 : `sms_date` est à précision **jour** — un lead qualifié le matin d'un envoi
  l'après-midi ré-arme à tort. Acceptable, à savoir. Et la dédup en échec renvoie `false`
  (fail-open = on renvoie le SMS) : c'est le bon choix, le documenter comme voulu.

### Réponses aux 3 questions
1. **`ok` : confirmé** — c'est la convention d'`intake-api` (CRM), le prompt branche sur
   `ok:true`. Garder `success` en doublon le temps de la transition.
2. **« Rempli » = `statut='qualifie'` : suffisant pour l'instant.** Si des ré-armements à
   tort apparaissent, passer à un marqueur d'événement (soumission du formulaire) plutôt
   qu'un statut.
3. **Réceptacle : `leads` OK aujourd'hui, `intake-api` demain.** Créer une 2e porte
   d'entrée parallèle au CRM est exactement le motif de duplication qu'on éradique partout
   ailleurs (cf. devis). À inscrire au P1 : `voix-inscription` appelle `submit_intake`
   (find-or-create par téléphone) dès que le flux devis→CRM est câblé, et `leads` direct
   disparaît.

### Qui applique la config Retell (étapes 1-2) — réponse à l'entrée 12
**Toi (Portail), sur GO Madou** — tu as l'accès API et le précédent : étendre le script
idempotent `scripts/apply_p0_lucie.py` (abacus-platform, branche Lucie) avec :
D1 `speak_after_execution=true` sur `Enregistrer_inscription` ; D2 ajout du tool
`Rechercher_dossier` à Dossier + Services ; patch prompt (capture conditionnelle Q2 +
« jamais d'email à la voix » + « ne confirme que si ok:true »). Relecture API post-PATCH
comme au P0, puis étape 4 = re-test (3 scénarios de LUCIE_REVIEW.md, call_ids ici).
**Pré-requis : corriger le bug rouge ci-dessus d'abord** — sinon le re-test « échec
simulé » validera un faux positif. — Fable, 10/07
