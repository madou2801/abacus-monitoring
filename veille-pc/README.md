# Veille procédures collectives — transférabilité vers le Mali

Identification des entreprises françaises sous procédure collective (sauvegarde,
redressement, liquidation) dans cinq secteurs, et évaluation de la
transférabilité de leur activité ou de leurs actifs vers le Mali.

Secteurs ciblés : transport & logistique · fabrication de matériel électrique ·
fabrication de machines-outils · transformation plastique · fabrication de
médicaments génériques.

## Contenu

| Fichier | Rôle |
|---|---|
| `referentiel.py` | 37 codes NAF répartis sur les 5 secteurs, et la grille de 7 critères pondérés |
| `cas_identifies.csv` | Échantillon de 11 dossiers sourcés, une URL par ligne |
| `collecte_bodacc.py` | Moissonnage exhaustif du BODACC, filtré sur les codes NAF |
| `genere_excel.py` | Construction du classeur à partir du CSV et du référentiel |
| `procedures_collectives_transfert_mali.xlsx` | Le livrable |

## Utilisation

```bash
pip install openpyxl

# Régénérer le classeur depuis l'échantillon sourcé
python3 genere_excel.py

# Collecte exhaustive (réseau non restreint requis), puis régénération
python3 collecte_bodacc.py --depuis 2025-01-01 --sortie cas_identifies.csv
python3 genere_excel.py veille_complete.xlsx
```

`collecte_bodacc.py` n'exige aucune authentification : le jeu de données BODACC
est public. Il découpe la période par pages de 100 et s'arrête proprement au
plafond de 10 000 résultats de l'API — au-delà, découper en tranches mensuelles.

## Limites connues

**Le classeur livré n'est pas exhaustif.** Il n'a pas pu l'être : depuis
l'environnement Claude Code où il a été produit, le proxy réseau bloque le
BODACC, l'INPI, l'API `recherche-entreprises.api.gouv.fr` et Gaïa
(`gaia.abacus-rh.com`) — un 403 sur le CONNECT. Seule la recherche web
généraliste répondait, et elle remonte des articles de presse, pas un extrait de
registre. Les 11 dossiers de `cas_identifies.csv` sont donc un échantillon, pas
une population. Pour mesurer l'écart : le seul secteur transport compte 857
défaillances au premier trimestre 2026.

Pour lever la limite, au choix : exécuter `collecte_bodacc.py` depuis le VPS
ABACUS, ou ajouter `bodacc-datadila.opendatasoft.com` à l'allowlist réseau de
l'environnement.

**Nomenclature NAF.** Les codes du référentiel suivent la NAF rév. 2. La
rév. 3 s'applique aux nouvelles immatriculations depuis 2026 : remapper avant
d'exploiter des jugements postérieurs.

**Les notes sont des hypothèses sectorielles**, pas des mesures. Elles
proviennent de `referentiel.py` et sont appliquées uniformément à tous les
dossiers d'un même secteur. Elles sont en bleu dans le classeur, donc
modifiables, et destinées à être ajustées dossier par dossier après visite de
site.

**Le BODACC ne publie ni effectif ni chiffre d'affaires.** Ces colonnes
ressortent à `n.d.` après collecte ; les compléter depuis l'INPI ou Pappers.

## Grille de transférabilité

| Critère | Poids | Ce qu'il mesure |
|---|---|---|
| C1 Intensité main-d'œuvre | 20 % | Un process automatisé ne tire aucun bénéfice du coût du travail malien |
| C2 Sobriété énergétique | 20 % | Délestages et coût du kWh chez EDM-SA : l'électro-intensif impose une centrale captive |
| C3 Simplicité technologique | 15 % | Vivier étroit en maintenance industrielle de précision |
| C4 Transportabilité des actifs | 15 % | Une presse à injecter se déplace, une ligne coulée dans le génie civil non |
| C5 Marché Mali / AES / UEMOA | 15 % | Mali toujours dans l'UEMOA, sorti de la CEDEAO au profit de l'AES |
| C6 Faiblesse des barrières réglementaires | 10 % | BPF/GMP et AMM en pharmacie, marquage CE en matériel électrique |
| C7 Autonomie en intrants | 5 % | Pays enclavé : corridors Dakar, Abidjan, Lomé, Conakry |

Score = moyenne pondérée sur 5. Classe A ≥ 4 · B ≥ 3 · C ≥ 2 · D < 2.

## Avertissement

Une reprise en plan de cession se joue devant le tribunal de commerce dans un
délai d'offre court (4 mois à compter de l'ouverture, souvent moins). Le
transfert d'actifs hors de France se heurte au maintien de l'emploi, critère
légal de sélection des offres, et peut relever du contrôle des investissements
étrangers sur les actifs sensibles — la pharmacie en particulier. Chaque dossier
doit être vérifié au registre et validé par un conseil avant tout engagement.
