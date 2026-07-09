# Lucie (Retell) — export config + analyse des erreurs (2 appels test 09/07)

> Demandé par Madou : export de la config Lucie pour revue par **Fable** (qui a participé à la configuration hier).
> Config tirée en lecture seule via l'API Retell le 2026-07-09. **Aucun secret dans les JSON** (scan fait). Numéro : **09 74 99 15 15**.

## Architecture (3 agents Retell, multi-agent avec `agent_swap`)

| Agent | agent_id | llm_id | Rôle | Fichiers |
|---|---|---|---|---|
| **Lucie - Suivi** | `agent_a4c7ca25e5e5a07b598bf388c9` | `llm_4436c16ee0e5d766b623c6172fba` | Appelant **reconnu** (KnownCaller), lit le dossier | `lucie_suivi_agent.json` / `lucie_suivi_llm.json` |
| **Lucie - Dossier** | `agent_f0f085e57c266f051c4ee1db89` | `llm_63e90c60393b269bd3d9372fd4d0` | **Inscription** nouvelle formation | `lucie_dossier_agent.json` / `lucie_dossier_llm.json` |
| **Lucie - Services** | `agent_29fabe27d666f18469e1d9089d` | `llm_dc4c3942277edb00c09a96faf600` | Questions admin / autres prestations | `lucie_services_agent.json` / `lucie_services_llm.json` |

- Voix : `custom_voice_21aac332b0ba56fbdc78853d07`, fr-FR. Modèle LLM : `gpt-4.1-mini`, temp 0. Post-call analysis : gpt-4.1.
- `webhook_url` (post-call) = `https://api.monpermiscpf.com/t/transfer-failed` (campaign-tracker VPS 88).
- Tools : `Rechercher_dossier` (→ `/t/camille/dossier`), `Enregistrer_inscription` (Dossier), `Envoyer_formulaire_SMS` (→ `/t/send-form-sms`), transferts + agent_swap.

## Appels test (preuves)

- **Appel 1** `call_0f1fefe951a17fdf3bcf3d86792` — 139 s, sentiment **positif**, `call_successful: true`. Reconnaissance OK, envoi SMS OK.
- **Appel 2** `call_d7fb6f607e23a1f2c2f74450197` — 172 s, sentiment neutre, **`call_successful: false`**. Demande CACES R489 → re-collecte identité + échec d'enregistrement masqué.

## Erreurs constatées + cause racine

### 1. Redemande l'identité malgré la reconnaissance (le plus visible)
Lucie-Suivi reçoit bien l'identité (prompt : `CONTEXTE : Prénom={{beneficiaire_prenom}}, Nom={{beneficiaire_nom}}, Dossier={{numero}}`) → salue « Bonjour Mahamadou ». MAIS pour une **nouvelle formation**, elle fait `agent_swap → transfer_to_lucie_dossier` avec **`inherit_conversation: undefined`** → l'agent **Dossier démarre sans contexte** ni dynamic variables → son prompt « CAPTURE D'IDENTITÉ (essentiel) — Demande le prénom, puis le nom… » **re-collecte tout** (prénom/nom/email/tél), alors que Madou dit « c'est Mamadou tu l'as déjà ».
**Pistes (à trancher par Fable)** : (a) passer les dynamic variables au swap / activer l'héritage de conversation ; (b) l'agent Dossier doit réutiliser le KnownCaller (sauter la capture si déjà connu) ; (c) traiter l'inscription DANS l'agent Suivi (qui a déjà l'identité) sans swap.

### 2. Succès annoncé sur un échec backend (grave)
Résumé Retell appel 2 : *« encountered an error due to an email requirement »* → le tool **`Enregistrer_inscription`** a échoué, mais Lucie confirme « votre demande est bien enregistrée ». **Elle masque l'échec.**
**Piste** : le prompt de l'agent Dossier doit, en cas d'erreur du tool, dire « je transmets à un conseiller » et **ne jamais confirmer** un enregistrement raté ; vérifier le contrat d'erreur du tool `Enregistrer_inscription` (que renvoie `/t/...` en cas d'email manquant/invalide).

### 3. ASR / prononciation
- « CACES R489 » **entendu** comme « casse-tête… quatre-cent-quatre-vingt-neuf ». ⚠️ Le `pronunciation_dictionary` agit sur ce que Lucie **dit (TTS)**, PAS sur ce qu'elle **entend (ASR)** ; c'est `boosted_keywords` qui aide l'ASR — « CACES » y est déjà, mais insuffisant sur cet énoncé.
- Nom « Diaby » entendu « Giabi » (2 essais). Email épelé laborieusement **alors que** le prompt dit « ne lui demande JAMAIS d'épeler lettre par lettre ».
**Pistes** : renforcer la confirmation de la formation (répéter/valider), revoir la capture email (le prompt et le comportement divergent).

### 4. Formulaire SMS renvoyé à chaque appel
`Envoyer_formulaire_SMS` déclenché aux 2 appels, sans idempotence.
**Piste** : ne pas renvoyer si déjà envoyé/rempli récemment (état dossier).

## Questions pour Fable (config d'hier)
1. Le passage des **dynamic variables** au swap Suivi→Dossier : voulu absent, ou à corriger (héritage) ?
2. L'agent **Dossier** devrait-il réutiliser le KnownCaller quand l'appelant est déjà identifié ?
3. Contrat d'erreur de `Enregistrer_inscription` : que doit faire l'agent quand le backend refuse (email requis) ?
4. Idempotence de `Envoyer_formulaire_SMS` : où la mettre (agent vs backend `/t/send-form-sms`) ?

*(Config complète dans les 6 `.json` de ce dossier.)*

---

## ✅ Réponses Fable (09/07) — + 2 découvertes dans les JSON

**Lecture des 6 JSON faite. Le fil conducteur des erreurs 1/2/3 est le même : le système
re-capture par la voix des données qu'il possède déjà.** C'est la règle P1 du plan Lucie
(« zéro capture vocale d'expression exacte ») qui n'est pas encore appliquée à l'agent
Dossier. Deux découvertes préalables qui changent les réponses :

- **D1 — `Enregistrer_inscription` a `speak_after_execution=false`** (`lucie_dossier_llm.json`).
  C'est le bug EXACT du tool SMS au jour 1 : l'agent ne voit jamais le résultat du tool,
  donc il « suppose » le succès. L'erreur 2 (succès annoncé sur échec) est d'abord ÇA.
- **D2 — l'agent Dossier n'a PAS le tool `Rechercher_dossier`** (Suivi seul l'a). Après un
  swap, Dossier ne PEUT PAS retrouver l'appelant : re-capturer est son seul chemin possible.
  L'erreur 1 n'est pas seulement un problème d'héritage — c'est un agent sans accès au lookup.

### Q1 — Dynamic variables au swap : à corriger, MAIS ne pas s'appuyer dessus seul
Activer ce que Retell permet au `agent_swap` (héritage de conversation/variables selon la
version de l'API). Cependant, la correction **robuste** ne dépend pas du swap :
**donner `Rechercher_dossier` à l'agent Dossier** (D2) + règle de prompt en tête :
« Au démarrage : si `{{beneficiaire_prenom}}` est vide, appelle `Rechercher_dossier` avec
`{{caller_number}}`. » Ceinture et bretelles : peu importe ce que le swap transmet,
Dossier retrouve l'identité en 1 tool call. (Même correctif pour Services.)

### Q2 — Réutiliser le KnownCaller côté Dossier : OUI, capture conditionnelle
Le bloc « CAPTURE D'IDENTITÉ » actuel est inconditionnel — c'est lui qui re-collecte.
Le rendre conditionnel :
« **SI l'identité est connue** (variables présentes ou `Rechercher_dossier` OK) →
**confirme-la** (« C'est bien pour vous, {{beneficiaire_prenom}} ? ») et ne redemande
RIEN. La capture complète n'est autorisée QUE si le lookup ne rend rien. »
Ça règle aussi « Diaby »→« Giabi » : un appelant connu n'a jamais à redonner son nom.

### Q3 — Contrat d'erreur `Enregistrer_inscription` : 4 couches
1. **Config (immédiat)** : `speak_after_execution=true` (D1) — sans ça, tout le reste est inopérant.
2. **Backend** (`/t/create-account-welcome`, côté Portail) : réponse structurée
   `{ok:false, error:"email_required", message:"…"}` — jamais un 4xx nu.
3. **Prompt** : « Ne confirme JAMAIS un enregistrement si le tool n'a pas renvoyé `ok:true`.
   En cas d'échec : “Je n'ai pas pu finaliser votre inscription à l'instant — je vous envoie
   le formulaire par SMS et un conseiller confirme rapidement.” » (même patron que le
   fallback SMS validé au P0).
4. **Design (la vraie racine)** : l'échec vient d'un **email requis** → l'agent a tenté la
   capture vocale d'email (interdite par le prompt, d'où l'épellation laborieuse — le
   prompt et le tool se contredisent). Correctif : `Enregistrer_inscription` doit accepter
   une inscription **sans email** (statut « à compléter »), l'email arrivant par le
   formulaire SMS. L'email ne se capture JAMAIS à la voix — c'est la règle P1.

### Q4 — Idempotence SMS : au BACKEND, pas dans l'agent
Dans `/t/send-form-sms` (un seul point, couvre les 4+ agents ; une règle de prompt n'est
pas une garantie) : par téléphone/lead, **skip si déjà envoyé < 7 j et non rempli**, avec
réponse `{ok:true, skipped:"already_sent"}` pour que Lucie dise « vous l'avez déjà reçu,
il est toujours valable » au lieu de renvoyer. Le formulaire rempli réarme l'envoi.

### Ordre d'exécution proposé (Portail = backend, config Retell = script ×4)
1. D1 `speak_after_execution=true` sur `Enregistrer_inscription` (1 champ) ;
2. `Rechercher_dossier` ajouté à Dossier + Services (D2) + capture conditionnelle (Q2) ;
3. Backend : contrat d'erreur structuré (Q3.2) + inscription sans email (Q3.4) +
   idempotence SMS (Q4) ;
4. Re-test : 1 appel connu (zéro re-capture, confirmation d'identité) + 1 appel avec échec
   simulé d'inscription (Lucie annonce l'échec + SMS) + 2e appel même numéro (SMS non renvoyé).
Consigner call_ids + verdicts ici. — Fable, 09/07
