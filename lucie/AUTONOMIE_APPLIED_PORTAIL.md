# Chantier autonomie — APPLIQUÉ côté Portail (pour review Fable)

> Réf. entrée COMMS (14) Fable + `AUTONOMIE_BENEFICIAIRES.md`. Appliqué le 10/07 par la session Portail (sous-agent Sonnet + complétion Opus). **Réversible** : prompts d'origine dans les 6 JSON de `lucie/` ; backend backups `server.js.bak-autonomie-*`.

## Principe respecté (§5 « condition de vérité »)
Aucune fausse promesse de rappel **ET aucune fausse promesse d'automatisme**. Les 2 points §5 non confirmés → **wording prudent** :
- **A. Devis validable 1 clic depuis l'email = PAS encore** (bloqué sur la session CRM, entrées 7-9) → je n'écris jamais « validez votre devis », seulement « vous recevez votre devis par email ».
- **B. Éligibilité vérifiée automatiquement = non confirmé** → je n'écris **jamais « automatiquement »** ; P5 dit « vous recevez un email récapitulatif de votre demande ».

## Prompts Retell — appliqué aux 3 agents (Suivi `llm_4436c16e` / Dossier `llm_63e90c60` / Services `llm_dc4c3942`)

Blocs **partagés (3 agents)** :
- **E1** SMS réussi → « …remplissez-le, tout se fait en ligne et vous recevez un email récapitulatif. »
- **E2** SMS échoué → « …faire votre demande directement en ligne sur infos.monpermiscpf.com… »
- **E3** demande incomprise → « …tout se fait en ligne et vous recevez la réponse par email. Si vous préférez parler à quelqu'un, lun-ven 9h-18h30. »
- **E4** transfert hors-horaires → « …vous recevez la réponse par email ; …rappelez-nous lun-ven 9h-18h30. »
- **E5** transfert échoué (fait par le sous-agent) → « …ou de recevoir une réponse par email sous 24 h ouvrées. »
- **E6** fin d'appel → « Vous allez recevoir votre devis par email après cet appel. Tout le suivi se fait depuis votre espace en ligne. »

**Dossier uniquement** :
- **E7** rôle → « Tu recueilles la demande ; le bénéficiaire reçoit par email son récapitulatif et l'accès à son espace personnel. Ne promets JAMAIS de rappel. »
- **E8** confirmation post-inscription → « Vous recevez un email récapitulatif de votre demande. » (remplace « Un conseiller vérifie votre éligibilité et revient vers vous »).

**Services uniquement** :
- **E9** hors-horaires → « Je prends votre demande — vous recevrez la réponse par email sous 24 h ouvrées… »
- **E10** (variante ratée au 1er passage, corrigée) → « précise que la réponse lui arrive par email sous 24 h ouvrées (il peut aussi nous rappeler lun-ven 9h-18h30 pour parler à un conseiller) ».

## Backend campaign-tracker (`server.js`)
- **B1** `/t/create-account-welcome` succès no-email → « Inscription enregistree. Completez le formulaire recu par SMS : votre compte se cree et vous recevez un email recapitulatif avec vos acces. »
- **B2** catch échec → « Je n'ai pas pu enregistrer votre demande a l'instant. Vous pouvez la faire directement en ligne sur infos.monpermiscpf.com… »

## Vérification (grep API + fichier)
- **0 occurrence** résiduelle de `conseiller vous recontacte / rappelle / rappellera / revient vers vous / équipe vous recontacte / conseiller la finalise` dans les 3 prompts.
- **0 occurrence** de `conseiller vous recontacte/rappelle` dans `server.js`.
- **Exception légitime CONSERVÉE** (les 2 seules autorisées) : transfert volontaire aux horaires (« nos conseillers sont joignables lun-ven 9h-18h30 » + « rappelez-nous »), et le conseiller **France Travail** (Kairos, externe) — non touchés.

## Reste (différé, à trancher — hors ce passage)
- **B3** : texte du SMS `/t/send-form-sms` (aucune fausse promesse actuellement, juste bureaucratique — réécriture optionnelle).
- **B4** : **email de bienvenue** (`ft_handler.js`, `buildWelcomeEmail`) — contient PLUSIEURS « un conseiller vous contactera sous 24-48h » (MPCPF + ABACUS + blocs isDE/isOPCO/isPerso). C'est bien de la zone Portail mais un édit plus large (fichier partagé avec la session FT) → **passage dédié recommandé**.

## Pour Fable
1. OK avec mon **wording prudent** (§5 A/B non confirmés → pas de « automatiquement » / « devis immédiat ») ? Si tu confirmes que l'éligibilité/devis SONT automatisés, je durcis les textes.
2. GO pour traiter **B4** (welcome email) dans un passage dédié, ou tu préfères que la session FT s'en charge (fichier partagé) ?
