# Design — Routeur d'intention pour le Type 2 (FT auto-répondeur)

> Auteur : Fable (revue croisée), 11/07. Destinataire : session FT (`brief-analysis-solutions`,
> propriétaire de `ft_handler.js` + `decideResponse()`). Objet : remplacer le pitch générique
> du Type 2 par une **compréhension d'intention** qui répond juste et route vers le libre-service.
> Objectif Madou : automatiser au maximum + autonomiser le bénéficiaire, sans le risque du
> pitch aveugle. **Prérequis : garder T2 en brouillon jusqu'à validation de ce routeur.**

## Problème

Depuis le retrait du Type 3, le Type 2 = fourre-tout majoritaire (tout email FT non
structuré). En envoi direct, il répond à TOUS le même pitch commercial Lucie/Sarah, sans
lire la question. Risque conformité (pitch à un non-bénéficiaire) + occasion manquée
(la vraie question n'est pas traitée).

## Solution : une étape de classification d'intention dans `decideResponse()`

Insertion APRÈS les gardes existantes (expéditeur, mots négatifs, fil 7 j — inchangées,
elles restent devant), AVANT le choix du template.

```
email → gardes P0 → classifyIntent(email) → {intent, confidence, brand, formation}
      → routage par (intent × confidence)
```

### 1. `classifyIntent()` — GLM structured output (glm-4-flash, thinking disabled)

Prompt système : « Tu classes un email entrant. Réponds UNIQUEMENT en JSON. » Sortie
forcée (schéma) :
```json
{ "intent": "question_formation | question_financement | veut_s_inscrire | suivi_dossier
             | tarif | partenariat | presse | spam | hors_sujet | reclamation | ambigu",
  "confidence": 0.0-1.0,
  "brand": "mpcpf | abacus",
  "formation": "permis_b | caces_r489 | ... | null",
  "resume": "une phrase" }
```
Coût ~négligeable (glm-4-flash). RGPD : le contenu part déjà à GLM au triage → aucun
nouveau transfert (cadre DPA B inchangé).

### 2. Routage par intention × confiance

| Intention | Confiance ≥ seuil | Action |
|---|---|---|
| `question_formation` / `question_financement` / `tarif` | haute | **Réponse auto ciblée** (template de l'intention, marque, formation) + CTA libre-service |
| `veut_s_inscrire` | haute | Réponse auto → lien formulaire qualification (libre-service) |
| `suivi_dossier` | haute | Réponse auto → lien espace en ligne |
| `reclamation` | toute | Escalade (déjà couvert par mots négatifs — filet redondant) |
| `partenariat` / `presse` / `spam` / `hors_sujet` | toute | **PAS de réponse commerciale** (skip ou brouillon interne « à voir ») |
| `ambigu` OU confiance < seuil | — | **Brouillon** (revue humaine) |

### 3. Génération de la réponse — anti-hallucination obligatoire

- **Contenu réglementaire (financement, éligibilité, montants) = TEMPLATE validé**, jamais
  de texte libre du LLM. Le LLM choisit le template et remplit des variables sûres
  (prénom, nom de la formation) — il n'invente aucune phrase sur le CPF/AIF/montants.
  C'est la même règle que pour la colonne « Inscrit » : le LLM comprend/route, il n'engage
  pas de promesse réglementaire.
- **Contenu non sensible** (accusé, orientation) : template aussi, ou génération courte
  encadrée. Toujours terminer par le CTA libre-service (formulaire / espace en ligne),
  cohérent avec le chantier autonomie (zéro promesse de rappel).

## Faisabilité — l'infra existe

- GLM câblé (z.ai) → 1 appel classification/email.
- `decideResponse()` = fonction pure déjà testée (56 cas) → point d'insertion + table de test.
- Mode brouillon existant → repli naturel pour ambigu/faible confiance.

## Calibration & garde-fous avant ouverture de l'envoi auto

1. **Table de test étendue** : 30-50 vrais emails FT anonymisés (dont partenariat/presse/
   candidatures spontanées = les faux positifs actuels du T2) → vérifier intention +
   action à la main. Réutiliser le harnais `decideResponse.test`.
2. **Seuil de confiance** calibré sur cette table (viser 0 faux positif sur les
   non-bénéficiaires avant d'ouvrir l'auto ; sinon → brouillon).
3. **Les gardes P0 restent devant** la classification (jamais les remplacer).
4. **Ouverture progressive** : d'abord `mode:draft` avec l'intention classée (on vérifie
   que le routeur voit juste sur du réel), PUIS envoi auto par intention à haute confiance,
   `ambigu` restant en brouillon durable.
5. **Suivi** : la classification est loggée (`metadata.intent/confidence`) → revue hebdo
   d'échantillon `mode:sent`, règle « 1 réponse manifestement à côté = le type/intent
   repasse brouillon » (réversible).

## Séquencement recommandé

1. T2 reste **brouillon** (correctif par-type COMMS 22) — ne pas laisser le pitch aveugle
   partir en attendant.
2. Session FT construit `classifyIntent()` + table de test + templates par intention.
3. Validation sur la table → ouverture `mode:draft` avec intention (contrôle réel).
4. Sur bons résultats → envoi auto des intentions haute-confiance ; ambigu/non-bénéficiaire
   jamais en auto.

→ Résultat visé : le bénéficiaire obtient une **vraie réponse à sa question** + le chemin
libre-service (autonomie max), et les non-bénéficiaires / cas flous ne reçoivent plus de
pitch automatique (risque conformité fermé). — Fable, 11/07

## MAJ 13/07 — GO Madou + exigence email d'alerte

Madou a tranché (DECISIONS.md 13/07) : **GO pour passer T2 en brouillon + construire le routeur
d'intention.** Une exigence s'ajoute au design :

**Email d'alerte à `md@abacus-rh.com` à chaque brouillon produit.** Objectif autonomie : Madou
reste seul mais veut être notifié qu'un cas est en attente de revue (sans surveiller une file).
Spéc :
- Déclencheur : tout email routé en `mode:draft` (ambigu, faible confiance, ou intention
  non-bénéficiaire mise en « à voir »).
- Contenu : expéditeur (anonymisé selon §5 — `d***@gmail.com`), `intent` + `confidence`
  classés, `resume` une phrase, marque/formation, et le lien vers le brouillon.
- Canal : le même `N8N_EMAIL_WEBHOOK` déjà utilisé (Gmail OAuth2) — pas de nouveau secret.
- Anti-spam : si volume élevé, **digest** (1 email groupé toutes les N min/heure) plutôt qu'un
  email par brouillon — à calibrer, mais l'alerte ne doit pas devenir du bruit.
- Réversible : `FT_DRAFT_ALERT=on/off`.

Reste inchangé : gardes P0 devant, contenu réglementaire = template validé (jamais de texte
libre LLM sur CPF/AIF/montants), ouverture progressive (draft → auto haute-confiance, ambigu
durablement en brouillon). — Fable, 13/07
