# Autonomie des bénéficiaires — éradication des promesses « un conseiller vous recontactera »

> Rédigé par Fable (10/07) sur demande Madou. **Principe fondateur : Madou est seul et
> entend le rester.** Chaque promesse « un conseiller vous rappellera » est une dette
> manuelle qui retombe sur lui — l'exact inverse de l'automatisation. Objectif : chaque
> impasse conversationnelle débouche sur une **prochaine étape en libre-service**, jamais
> sur un rappel humain. Madou devient superviseur d'exceptions, pas centre d'appels.
>
> Inventaire réalisé sur : prompts Retell des 3+1 agents (exports `lucie/*_llm.json`),
> backend campaign-tracker (patch step 3), emails FT (`ft_handler.js` déposé), mes propres
> blocs canoniques (CAPTURE, fallbacks — j'assume : plusieurs formulations viennent de moi,
> écrites sur l'hypothèse fausse d'une équipe de conseillers).

## 0. La règle de réécriture (à appliquer partout, y compris aux futurs textes)

| Au lieu de… | Dire… |
|---|---|
| « Un conseiller vous recontactera / rappellera » | « Votre dossier se crée automatiquement ; vous recevez [récapitulatif/devis/accès] par email dans quelques minutes » |
| « Un conseiller vérifie votre éligibilité » | « Votre éligibilité est vérifiée automatiquement lors de votre demande en ligne » |
| « Notre équipe revient vers vous » | « Tout se fait en ligne : [lien/SMS], en 2 minutes » |
| (vraie exception nécessitant un humain) | « Vous recevrez une réponse **par email** sous 24 h ouvrées » — jamais un rappel téléphonique promis |

**Deux exceptions légitimes qui GARDENT le mot « conseiller »** :
1. Le **conseiller France Travail** du bénéficiaire (externe, Kairos) — c'est le vrai
   process AIF, on ne touche pas.
2. Le **transfert d'appel volontaire** (`transfer_to_conseiller`) quand la personne
   demande explicitement un humain aux horaires — Madou EST ce conseiller ; on garde la
   capacité, on supprime seulement les PROMESSES par défaut.

## 1. Prompts Retell (4 agents — Accueil, Suivi, Dossier, Services)

| # | Emplacement (occurrences trouvées dans les 3 LLM exportés + Accueil) | Texte actuel | Texte cible |
|---|---|---|---|
| P1 | Bloc `# CAPTURE D'IDENTITÉ` (le mien) — succès SMS | « Vous devriez le recevoir dans quelques instants. Un conseiller vous recontactera. » | « Vous allez recevoir un SMS avec un lien : remplissez-le en 2 minutes, **votre dossier se crée automatiquement** et vous recevez votre récapitulatif et votre devis **par email immédiatement**. » |
| P2 | Même bloc — échec SMS | « Je n'ai pas réussi à envoyer le SMS… Un conseiller vous rappellera très rapidement. » | « Je n'ai pas réussi à envoyer le SMS à l'instant. Vous pouvez faire votre demande directement sur **infos.monpermiscpf.com** — tout se fait en ligne en quelques minutes. » |
| P3 | Bloc `# SI TU NE COMPRENDS PAS LA DEMANDE` | « …remplissez-le, notre équipe vous recontacte ; et si vous souhaitez parler à un conseiller, rappelez-nous pendant les horaires » | « …remplissez-le : votre demande est traitée **automatiquement** et vous recevez la réponse par email. Si vous préférez parler à quelqu'un, nous sommes joignables du lundi au vendredi, 9h-18h30. » |
| P4 | Agent Dossier — rôle | « Tu n'inscris PAS le bénéficiaire toi-même ; tu recueilles sa demande pour qu'un conseiller la finalise. » | « Tu recueilles la demande ; **l'inscription se finalise automatiquement** : le bénéficiaire reçoit par email son récapitulatif, son devis et l'accès à son espace personnel. Ne promets JAMAIS de rappel. » |
| P5 | Agent Dossier — éligibilité | « Un conseiller vérifie votre éligibilité et revient vers vous très vite pour finaliser » | « Votre éligibilité est vérifiée automatiquement lors de votre demande — vous recevez la confirmation et votre devis par email. » |
| P6 | Agent Services | « Je prends votre demande et un conseiller vous rappellera. » | « Je prends votre demande — vous recevrez la réponse **par email sous 24 h ouvrées**. Et pour la plupart des démarches, tout est faisable immédiatement sur votre espace en ligne. » |
| P7 | Bloc échec de transfert (les 3 agents) | « …laisser un message que je transmettrai au conseiller » | « …je vous envoie le lien par SMS pour faire la démarche en ligne, ou vous recevrez une réponse par email sous 24 h ouvrées. » |
| P8 | Bloc `# FIN D'APPEL` | « …votre devis par email après cet appel, une fois vos informations vérifiées » (puis renvoi conseiller) | Garder la 1ʳᵉ partie (déjà autonome), supprimer toute mention de vérification humaine : « Vous allez recevoir votre devis par email après cet appel. Tout le suivi se fait depuis votre espace en ligne. » |
| P9 | Bloc `# TRANSFERT VERS UN CONSEILLER — HORAIRES` | (conservé) | **À GARDER tel quel** (exception légitime n°2) — mais vérifier qu'aucun autre bloc ne PROMET ce transfert comme suite par défaut. |

## 2. Backend campaign-tracker (messages retournés à l'agent + SMS)

| # | Emplacement | Texte actuel | Texte cible |
|---|---|---|---|
| B1 | `/t/create-account-welcome` réponse no-email | « Inscription enregistrée. Un conseiller vous recontacte ; complétez vos informations via le formulaire envoyé par SMS. » | « Inscription enregistrée. Complétez le formulaire reçu par SMS : **votre dossier se finalise automatiquement** et vous recevez votre récapitulatif et votre devis par email. » |
| B2 | Catch échec (v2/v3) | « …un conseiller rappellera » (ma propre formulation — à corriger aussi) | « Je n'ai pas pu enregistrer votre demande à l'instant. Rendez-vous sur **infos.monpermiscpf.com** — tout se fait en ligne en 2 minutes. » |
| B3 | **Texte du SMS** envoyé par `/t/send-form-sms` (sur le VPS — à auditer par Portail) | (à vérifier : contient-il une promesse de rappel ?) | « MonPermisCPF : complétez votre dossier en 2 min : [lien]. Votre compte se crée automatiquement, devis immédiat par email. » |
| B4 | Email de bienvenue `/t/create-account-welcome` (à auditer) | (à vérifier) | Doit dire : identifiants + « votre espace vous permet de suivre votre dossier, compléter vos pièces et valider votre devis **en toute autonomie** ». |

## 3. Emails FT (`ft_handler.js` — chantier de la session FT, à répercuter dans `decide_response.js`)

| # | Emplacement | Constat | Action |
|---|---|---|---|
| F1 | L428/L481 « …directement à votre conseiller France Travail via Kairos » | Conseiller FT = EXTERNE | **GARDER** (exception n°1) |
| F2 | L531 « Votre conseiller vous guidera pour valider votre devis sur moncompteformation » | Ambigu : lequel ? | Réécrire : « Vous validez votre devis vous-même sur moncompteformation.gouv.fr — le lien et les étapes sont dans l'email » (ou « votre conseiller France Travail » si c'est le process AIF réel). |
| F3 | Personas « Lucie/Sarah — Conseillère Formation » (signatures) | La persona IA s'appelle conseillère | Acceptable (c'est l'IA, mention « réponse assistée par IA » présente) — mais **aucune promesse de rappel par Lucie/Sarah** dans les corps d'emails. À vérifier template par template lors de la revue quotidienne des brouillons. |
| F4 | Mon AR neutre de repli (revue FT §7) : « un conseiller revient vers vous sous 24 h » | Ma formulation, fausse promesse | Remplacer par : « Votre demande est enregistrée. Pour recevoir votre devis immédiatement, complétez ici : [formulaire]. Sinon, réponse par email sous 24 h ouvrées. » |

## 4. Mes blocs canoniques à corriger (dette de ma responsabilité)

- `scripts/apply_p0_lucie.py` (abacus-platform) : `CAPTURE_BLOC` — appliquer P1/P2.
- `docs/P0_ACCUEIL.md`, `docs/LUCIE_PLAN_REMEDIATION.md`, `lucie/LUCIE_REVIEW.md`
  (mes réponses Q3), `lucie/BACKEND_STEP3_PATCH.md` (ma contre-revue) : les textes
  d'exemple y contiennent « un conseiller » — corrigés par renvoi au présent document
  (ne pas réécrire l'historique, le présent doc fait foi pour tous les textes futurs).

## 5. La condition de vérité : que l'automatisation promise EXISTE

Dire « votre dossier se finalise automatiquement » n'est honnête que si c'est vrai.
État de la chaîne (à confirmer par Portail avant d'appliquer les textes) :
1. Formulaire rempli → compte créé + email de bienvenue : **existe** (`/t/create-account-welcome`).
2. → devis automatique par email : **existe** (`/t/devis`).
3. → devis **validable en un clic** depuis l'email : **en cours** (chantier CRM one-click, entrées 7-9).
4. → lead no-email (voix) : formulaire SMS ramène dans la chaîne 1-2-3 : **existe** (step 3 v3).
5. Éligibilité « vérifiée automatiquement » (P5) : **à confirmer** — si la vérification
   est aujourd'hui manuelle, formuler « vous recevez la confirmation par email » sans le
   mot « automatiquement », et inscrire l'automatisation (Wedof/EDOF) au backlog.
Chaque texte du tableau ne se déploie que si sa ligne de chaîne est vraie — sinon on
remplace une fausse promesse de rappel par une fausse promesse d'automatisme.

## 6. Application (proposée)

1. **Portail** (sur GO Madou) : intégrer P1-P8 + B1-B2 dans le MÊME passage que les
   étapes 1-2 Retell déjà prêtes (un seul script, une seule relecture API, un seul
   re-test) ; auditer B3/B4 sur le VPS et corriger.
2. **Session FT** : F2/F4 dans `decide_response.js` + templates (via sa table de tests).
3. **Vérité de chaîne (§5)** : Portail confirme les points 3 et 5 ici même.
4. **Re-test élargi** : l'appel test de l'étape 4 vérifie AUSSI qu'aucune promesse de
   rappel n'est prononcée (critère ajouté au scénario).

— Fable, 10/07
