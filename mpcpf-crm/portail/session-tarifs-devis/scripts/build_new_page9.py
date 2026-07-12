# -*- coding: utf-8 -*-
import re
src="C:/Users/ThinkPad/Desktop/MPCPF_landing_mobile_v2/_accueil_page9_content.html"
c=open(src,encoding="utf-8").read()
orig=c

# ---- 1) Nouveau select CACES (catégorie exacte + polyvalent + recyclage, prix catalogue) ----
INIT=[
 ("r489-1a-i",865,"CACES R489 cat 1A (transpalette) - Initiation","R489 cat 1A — Transpalette"),
 ("r489-1b-i",865,"CACES R489 cat 1B (gerbeur accompagnant) - Initiation","R489 cat 1B — Gerbeur accompagnant"),
 ("r489-3-i",865,"CACES R489 cat 3 (chariot frontal) - Initiation","R489 cat 3 — Chariot élévateur frontal"),
 ("r489-5-i",865,"CACES R489 cat 5 (mat rétractable) - Initiation","R489 cat 5 — Mât rétractable"),
 ("r489-multi-i",1360,"CACES R489 cat 1A+3+5 (polyvalent) - Initiation","R489 cat 1A+3+5 — Polyvalent"),
 ("r482-a-i",1956,"CACES R482 cat A (compacts) - Initiation","R482 cat A — Engins compacts"),
 ("r482-b1-i",1956,"CACES R482 cat B1 (pelles) - Initiation","R482 cat B1 — Pelles hydrauliques"),
 ("r482-c1-i",1956,"CACES R482 cat C1 (chargeuses) - Initiation","R482 cat C1 — Chargeuses"),
 ("r482-d-i",1956,"CACES R482 cat D (compacteurs) - Initiation","R482 cat D — Compacteurs"),
 ("r482-e-i",1956,"CACES R482 cat E (tombereaux) - Initiation","R482 cat E — Tombereaux"),
 ("r482-f-i",1956,"CACES R482 cat F (chariots télescopiques) - Initiation","R482 cat F — Chariots télescopiques"),
 ("r482-g-i",1956,"CACES R482 cat G (hors production) - Initiation","R482 cat G — Conduite hors production"),
 ("r482-multi-i",3390,"CACES R482 polyvalent - Initiation","R482 — Polyvalent (plusieurs catégories)"),
 ("r485-1-i",708,"CACES R485 cat 1 (gerbeur ≤2,5m) - Initiation","R485 cat 1 — Gerbeur ≤ 2,5 m"),
 ("r485-2-i",708,"CACES R485 cat 2 (gerbeur >2,5m) - Initiation","R485 cat 2 — Gerbeur > 2,5 m"),
 ("r485-multi-i",940,"CACES R485 cat 1+2 polyvalent - Initiation","R485 cat 1+2 — Polyvalent"),
 ("r486-a-i",1560,"CACES R486 cat A (nacelle verticale) - Initiation","R486 cat A — Nacelle verticale"),
 ("r486-b-i",1560,"CACES R486 cat B (nacelle multidirectionnelle) - Initiation","R486 cat B — Nacelle multidirectionnelle"),
 ("r486-ab-i",2075,"CACES R486 A&amp;B polyvalent - Initiation","R486 A&amp;B — Polyvalent"),
 ("r484-1-i",995,"CACES R484 cat 1 (commande au sol) - Initiation","R484 cat 1 — Commande au sol"),
 ("r484-2-i",995,"CACES R484 cat 2 (commande en cabine) - Initiation","R484 cat 2 — Commande en cabine"),
 ("r484-multi-i",1320,"CACES R484 cat 1+2 polyvalent - Initiation","R484 cat 1+2 — Polyvalent"),
 ("r490-i",1261,"CACES R490 grue de chargement - Initiation","R490 — Grue de chargement"),
]
RECYC=[
 ("r489-r",735,"CACES R489 (1 catégorie) - Recyclage","R489 — Recyclage (1 catégorie)"),
 ("r489-multi-r",1155,"CACES R489 cat 1A+3+5 - Recyclage","R489 cat 1A+3+5 — Recyclage"),
 ("r482-r",1665,"CACES R482 - Recyclage","R482 — Recyclage"),
 ("r482-multi-r",2880,"CACES R482 polyvalent - Recyclage","R482 — Recyclage polyvalent"),
 ("r485-r",600,"CACES R485 - Recyclage","R485 — Recyclage"),
 ("r485-multi-r",800,"CACES R485 cat 1+2 - Recyclage","R485 1+2 — Recyclage"),
 ("r486-r",1325,"CACES R486 - Recyclage","R486 — Recyclage"),
 ("r486-multi-r",1765,"CACES R486 A&amp;B - Recyclage","R486 A&amp;B — Recyclage"),
 ("r484-r",845,"CACES R484 - Recyclage","R484 — Recyclage"),
 ("r484-multi-r",1120,"CACES R484 cat 1+2 - Recyclage","R484 1+2 — Recyclage"),
 ("r490-r",1070,"CACES R490 - Recyclage","R490 — Recyclage"),
]
def opts(rows):
    return "\n".join('                            <option value="%s" data-prix="%d" data-label="%s">%s</option>'%(v,p,dl,lc) for v,p,dl,lc in rows)
# récupère l'ouverture exacte du select
mo=re.search(r'(<select[^>]*id="devis-caces"[^>]*>)',c)
open_tag=mo.group(1)
new_select=(open_tag+"\n"
  +'                        <option value="" disabled selected>Choisissez votre catégorie</option>\n'
  +'                        <optgroup label="Formation initiale">\n'+opts(INIT)+"\n                        </optgroup>\n"
  +'                        <optgroup label="Recyclage">\n'+opts(RECYC)+"\n                        </optgroup>\n"
  +"                    </select>")
c2=re.sub(r'<select[^>]*id="devis-caces".*?</select>', lambda m:new_select, c, count=1, flags=re.S)
assert c2!=c, "select CACES non remplacé"
c=c2

# ---- 2) Prix non-CACES alignés catalogue (remplacements exacts, assert count==1) ----
REP=[
 ("label: 'Permis C — Marchandises > 3,5t (≈105h)', prixCpf: 2500, prixPerso: 2500","label: 'Permis C — Marchandises > 3,5t (≈105h)', prixCpf: 3000, prixPerso: 3000"),
 ("label: 'Permis C1 — 3,5t à 7,5t', prixCpf: 2500, prixPerso: 2500","label: 'Permis C1 — 3,5t à 7,5t', prixCpf: 3000, prixPerso: 3000"),
 ("label: 'Permis D — Bus / Car (≈105h)', prixCpf: 3150, prixPerso: 3150","label: 'Permis D — Bus / Car (≈105h)', prixCpf: 3500, prixPerso: 3500"),
 ("label: 'Permis D1 — Minibus ≤ 16 places', prixCpf: 3150, prixPerso: 3150","label: 'Permis D1 — Minibus ≤ 16 places', prixCpf: 3500, prixPerso: 3500"),
 ("label: 'FIMO Voyageurs — 140h', prixCpf: 3000, prixPerso: 3000","label: 'FIMO Voyageurs — 140h', prixCpf: 3150, prixPerso: 3150"),
 ("label: 'SSIAP 3 — Chef de service', prixCpf: 3200, prixPerso: 3200","label: 'SSIAP 3 — Chef de service', prixCpf: 5490, prixPerso: 5490"),
 ("label: 'R489 — Chariots élévateurs', prixCpf: 950, prixPerso: 950","label: 'R489 — Chariots élévateurs', prixCpf: 865, prixPerso: 865"),
 ("label: 'R482 — Engins de chantier', prixCpf: 1590, prixPerso: 1590","label: 'R482 — Engins de chantier', prixCpf: 1956, prixPerso: 1956"),
 ("label: 'R490 — Grues de chargement', prixCpf: 1400, prixPerso: 1400","label: 'R490 — Grues de chargement', prixCpf: 1261, prixPerso: 1261"),
 ('data-formation="poids-lourd" data-prix="2500"','data-formation="poids-lourd" data-prix="3000"'),
 ("'poids-lourd': { prix: 2500","'poids-lourd': { prix: 3000"),
 ('data-formation="caces" data-prix="870"','data-formation="caces" data-prix="865"'),
]
for old,new in REP:
    n=c.count(old)
    assert n==1, "REPLACE count=%d pour: %s"%(n,old[:50])
    c=c.replace(old,new,1)

open("C:/Users/ThinkPad/Desktop/MPCPF_landing_mobile_v2/_accueil_page9_NEW.html","w",encoding="utf-8").write(c)
print("OK. Taille avant=%d après=%d (delta %+d)"%(len(orig),len(c),len(c)-len(orig)))
print("options select initiale=%d, recyclage=%d"%(len(INIT),len(RECYC)))
print("balises <option> devis-caces:", new_select.count("<option"))
