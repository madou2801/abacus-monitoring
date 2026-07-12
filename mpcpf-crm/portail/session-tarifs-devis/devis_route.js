// ==== ROUTE DEVIS PDF (ajout — remplace le pipeline n8n/Puppeteer) ====
// POST /t/devis : calcule le devis, genere le PDF (pdfkit) et l'envoie au beneficiaire (piece jointe).
app.post("/t/devis", async (req, res) => {
  try {
    const d = req.body || {};
    const prenom = (d.prenom || "").trim(), nom = (d.nom || "").trim();
    const email = (d.email || "").trim(), tel = (d.telephone || "").trim();
    const formation = d.formation || "", detail = d.formation_detail || d.formation || "";
    const situation = d.situation || "", cp = d.code_postal || "";
    const code = (d.code || "").trim();
    let prix = Math.round(Number(d.prix_cpf) || Number(d.prix_perso) || 0);
    let prixSource = prix > 0 ? "client" : "absent";
    const cpfElig = (d.cpf_eligible !== false && d.cpf_eligible !== "false"); // situation -> tarif CPF vs perso du catalogue
    // SECURITE (finding Fable 12/07) : le prix autoritaire vient du CATALOGUE Supabase, keye par
    // code formation, cote serveur — jamais du navigateur (falsifiable). Repli sur le prix client
    // si code absent (transition frontends) ou introuvable.
    if (code && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      try {
        const _h = { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + process.env.SUPABASE_SERVICE_KEY };
        const _r = await fetch(process.env.SUPABASE_URL + "/rest/v1/catalogue_formations?select=tarif_cpf,tarif_perso,actif&code=eq." + encodeURIComponent(code) + "&limit=1", { headers: _h });
        const _row = (await _r.json().catch(() => []))[0];
        if (_row && _row.actif !== false) {
          const catPrix = Math.round(Number(cpfElig ? (_row.tarif_cpf || _row.tarif_perso) : (_row.tarif_perso || _row.tarif_cpf)) || 0);
          if (catPrix > 0) {
            if (prix && prix !== catPrix) console.warn("[/t/devis] prix client " + prix + " != catalogue " + catPrix + " (code " + code + ") -> catalogue autoritaire");
            prix = catPrix; prixSource = "catalogue:" + code;
          }
        } else {
          console.warn("[/t/devis] code " + code + " introuvable/inactif au catalogue -> repli prix client " + prix);
        }
      } catch (e) { console.error("[/t/devis] lookup catalogue:", e && e.message); }
    }
    if (!email) return res.status(400).json({ ok: false, error: "email manquant" });

    const bounds = { caces: [400, 3500], "poids-lourd": [1000, 3500], ssiap: [1000, 5500], securite: [80, 1500], aipr: [150, 450] };
    const b = bounds[formation] || [30, 4000];
    const prixValide = prix > 0 && prix >= b[0] && prix <= b[1];

    let resteTxt, financeTxt, cpfTxt = "potentiellement jusqu'à 100%";
    if (!cpfElig) {
      resteTxt = "le montant indiqué";
      if (situation === "demandeur") financeTxt = "En tant que demandeur d'emploi, cette formation peut être prise en charge par France Travail (dispositif KAIROS) — nous vous accompagnons dans la démarche.";
      else if (situation === "salarie" || situation === "fonctionnaire" || situation === "employeur") financeTxt = "Cette formation est financée par votre employeur ou un OPCO (plan de développement des compétences).";
      else if (situation === "perso") financeTxt = "Vous financez cette formation à titre personnel — paiement en plusieurs fois possible.";
      else financeTxt = "Cette formation est financée par votre employeur, un OPCO, France Travail ou en financement personnel.";
    } else if (situation === "demandeur") {
      cpfTxt = "potentiellement jusqu'à 100% (complément France Travail possible)";
      resteTxt = "aucun (sous réserve de vos droits)";
      financeTxt = "Demandeur d'emploi : si vos droits CPF le permettent, la formation peut être prise en charge jusqu'à 100% (complément France Travail possible), sans participation forfaitaire.";
    } else if (situation === "salarie" || situation === "fonctionnaire") {
      cpfTxt = "potentiellement jusqu'à 100% + co-financement éventuel (employeur / OPCO)";
      resteTxt = "la participation forfaitaire";
      financeTxt = "Si votre CPF prend en charge la formation, un co-financement employeur ou OPCO peut venir en complément. Il vous reste uniquement la participation forfaitaire.";
    } else if (situation === "independant") {
      resteTxt = "la participation forfaitaire";
      financeTxt = "Si votre CPF prend en charge la formation en totalité, il vous reste la participation forfaitaire. Paiement en plusieurs fois possible.";
    } else {
      resteTxt = "la participation forfaitaire";
      financeTxt = "Votre CPF peut financer tout ou partie de la formation ; un paiement en plusieurs fois est aussi possible.";
    }

    const now = new Date();
    const pad = (x) => ("" + x).padStart(2, "0");
    const dateStr = pad(now.getDate()) + "/" + pad(now.getMonth() + 1) + "/" + now.getFullYear();
    const vd = new Date(now); vd.setMonth(vd.getMonth() + 1);
    const validStr = pad(vd.getDate()) + "/" + pad(vd.getMonth() + 1) + "/" + vd.getFullYear();
    const external_id = "DEVISWEB-" + now.getTime();

    const fmt = (n) => Number(n).toLocaleString("fr-FR");
    const famille = { caces: "CACES", "poids-lourd": "permis poids-lourd / transport", ssiap: "SSIAP", securite: "sécurité / habilitation", aipr: "AIPR" }[formation] || "formation";
    const MPCPF_FROM = "MonPermisCPF <contact@monpermiscpf.com>";

    if (prixValide) {
      // ---- Devis chiffré : PDF joint ----
      const pdf = await buildDevisPdf({ external_id, dateStr, validStr, prenom, nom, email, tel, detail, prix, cpfElig, cpfTxt, resteTxt, financeTxt });

      // [CRM] enregistre le devis (submit_intake + send_quote notify:false) et recupere le lien de validation 1-clic.
      // Best-effort / non bloquant. SECURITE : validation_url jamais loggee, jamais persistee, pas de retry avec l'URL.
      let validationUrl = null;
      try {
        const IURL = process.env.INTAKE_API_URL, ISEC = process.env.INTAKE_API_SECRET;
        if (IURL && ISEC) {
          const H = { "Authorization": "Bearer " + ISEC, "Content-Type": "application/json" };
          const si = await fetch(IURL, { method: "POST", headers: H, body: JSON.stringify({ action: "submit_intake", beneficiary: { email, phone: tel || null }, form_type: "devis", source: d.source || "devis-web", profile: { first_name: prenom || null, last_name: nom || null } }) });
          const bid = (await si.json().catch(() => ({}))).beneficiary_id;
          if (bid) {
            const financeur = situation === "employeur" ? "entreprise" : (d.route === "france_travail" ? "kairos" : (situation === "perso" ? "autofinancement" : "edof"));
            const sq = await fetch(IURL, { method: "POST", headers: H, body: JSON.stringify({ action: "send_quote", beneficiary_id: bid, financeur, amount_cents: prix * 100, formation_label: detail, notify: false, contact: { email, phone: tel || null } }) });
            const sqj = await sq.json().catch(() => ({}));
            if (sqj && sqj.validation_url) validationUrl = sqj.validation_url;
          }
        }
      } catch (e) { console.error("[/t/devis] CRM send_quote:", e && e.message); }

      const cpfLine = cpfElig ? '<tr><td>Prise en charge CPF</td><td style="text-align:right">' + cpfTxt + '</td></tr>' : "";
      const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;color:#2e3d49">' +
        '<h2 style="color:#1A6BB5">Votre devis</h2><p>Bonjour ' + prenom + ',</p>' +
        '<p>Veuillez trouver <strong>ci-joint votre devis au format PDF</strong> pour <strong>' + detail + '</strong> :</p>' +
        '<table cellpadding="8" style="width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:8px">' +
        '<tr><td>Formation</td><td style="text-align:right"><strong>' + detail + '</strong></td></tr>' +
        '<tr><td>Tarif de la formation</td><td style="text-align:right">' + fmt(prix) + ' EUR</td></tr>' + cpfLine + '</table>' +
        '<p>' + financeTxt + '</p>' +
        (validationUrl ? '<p style="text-align:center;margin:22px 0"><a href="' + validationUrl + '" style="background:#1A6BB5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block">✓ Valider mon devis en 1 clic</a></p><p style="text-align:center;font-size:12px;color:#6c757d">Lien personnel, valable 1 mois.</p>' : '') +
        '<p>Vous pouvez transmettre le PDF joint à votre employeur ou à votre OPCO.</p>' +
        '<p><strong>Durée de validité du devis : 1 mois.</strong></p>' +
        '<p style="font-size:12px;color:#6c757d">Organisme de formation non assujetti à la TVA (TVA non applicable — art. 261-4-4° du CGI). Devis indicatif, sous réserve de vérification de votre éligibilité.</p>' +
        '<p>Une question ? Lucie vous répond — <a href="tel:+33974991515">09 74 99 15 15</a>.</p>' +
        '<p style="color:#6c757d;font-size:13px">MonPermisCPF — certifié Qualiopi</p></div>';
      await mailerAbacus.sendMailWithAttachment({
        from: MPCPF_FROM, to: email,
        subject: "Votre devis " + (detail || "formation") + " — MonPermisCPF",
        html,
        attachments: [{ filename: "Devis-MonPermisCPF-" + external_id + ".pdf", content: pdf, contentType: "application/pdf" }],
      });
    } else {
      // ---- Formation « sur devis » / prix non déterminé : accusé de réception (pas de PDF chiffré à 0 EUR) ----
      const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;color:#2e3d49">' +
        '<h2 style="color:#1A6BB5">Accusé de réception de votre demande de devis</h2><p>Bonjour ' + prenom + ',</p>' +
        '<p>Nous avons bien reçu votre demande de devis concernant <strong>' + detail + '</strong>.</p>' +
        '<p>Un conseiller vérifie votre dossier et vous adresse votre <strong>devis détaillé sous 24 h</strong>.</p>' +
        '<p>' + financeTxt + '</p>' +
        '<p>Une question ? Lucie vous répond — <a href="tel:+33974991515">09 74 99 15 15</a>.</p>' +
        '<p style="color:#6c757d;font-size:13px">MonPermisCPF — certifié Qualiopi</p></div>';
      await mailerAbacus.sendMailWithAttachment({
        from: MPCPF_FROM, to: email,
        subject: "Accusé de réception de votre demande de devis — " + famille + " — MonPermisCPF",
        html, attachments: [],
      });
    }

    // Notif interne (sans PDF) — non bloquante
    mailerAbacus.sendAbacusEmail(
      "contact@monpermiscpf.com",
      (prixValide ? "" : "[A VERIFIER] ") + "Devis " + (detail || formation) + " — " + prenom + " " + nom + " (" + (cp || "?") + ")",
      '<h3>' + (prixValide ? "Devis chiffré émis" : "Demande de devis (à chiffrer sous 24 h)") + '</h3><p>' + prenom + ' ' + nom + ' — ' + email + ' — ' + (tel || "-") +
      '<br>Formation : ' + detail + '<br>Situation : ' + situation + '<br>Tarif : ' + (prix > 0 ? fmt(prix) + " EUR" : "-") +
      '<br>Contrôle prix : ' + (prixValide ? "OK" : "hors bornes / sur devis") + '<br>Source prix : ' + prixSource + (code ? ' (code ' + code + ')' : '') + '<br>N° ' + external_id + '</p>'
    ).catch(() => {});

    res.json({ ok: true, id: external_id, mode: prixValide ? "devis" : "accuse" });
  } catch (e) {
    console.error("[/t/devis] ", e && e.message);
    res.status(500).json({ ok: false, error: (e && e.message) || "erreur" });
  }
});
// ==== FIN ROUTE DEVIS PDF ====
