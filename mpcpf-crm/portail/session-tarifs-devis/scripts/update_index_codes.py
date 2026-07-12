# -*- coding: utf-8 -*-
# Phase 2 (form mobile index.html) : SUB avec `code` catalogue + synchro prix caces + envoi `code` au payload.
import re
p="C:/Users/ThinkPad/Desktop/MPCPF_landing_mobile_v2/index.html"
c=open(p,encoding="utf-8").read()
orig=c

NEW_SUB="""var SUB={
 'permis-b':[
   {label:'Boîte auto (BVA) — 13h',code:'B',prixCpf:960,prixPerso:776},
   {label:'BVA — 18h',code:'B_18H',prixCpf:1285,prixPerso:1036},
   {label:'BVA — 20h',code:'B_20H',prixCpf:1415,prixPerso:1140},
   {label:'BVA — 30h',code:'B_30H',prixCpf:2065,prixPerso:1660},
   {label:'Manuelle — 20h',code:'B_MAN20',prixCpf:1415,prixPerso:1140},
   {label:'Manuelle — 25h',code:'B_MAN25',prixCpf:1740,prixPerso:1400},
   {label:'Manuelle — 30h',code:'B_MAN30',prixCpf:2065,prixPerso:1660},
   {label:'Manuelle — 40h',code:'B_MAN40',prixCpf:2715,prixPerso:2180}
 ],
 'moto':[{label:'Permis A2 — 20h (éval + exam inclus)',code:'A2',prixCpf:1415,prixPerso:1420}],
 'permis-be':[
   {label:'BE — 5h + éval (examen inclus)',code:'BE',prixCpf:570,prixPerso:570},
   {label:'BE — 10h + éval (examen inclus)',code:'BE_10H',prixCpf:1040,prixPerso:1040},
   {label:'BE — 20h + éval (examen inclus)',code:'BE_20H',prixCpf:1940,prixPerso:1940}
 ],
 'code':[{label:'Code de la route (ENPC)',code:'CODE_ETG',prixCpf:120,prixPerso:79}],
 'poids-lourd':[
   {label:'Permis C — Marchandises > 3,5t',code:'C',prixCpf:3000,prixPerso:3000},
   {label:'Permis CE — C + remorque',code:'CE',prixCpf:3500,prixPerso:3500},
   {label:'Permis C1 — 3,5t à 7,5t',code:'C1',prixCpf:3000,prixPerso:3000},
   {label:'Permis C1E — C1 + remorque',code:'PL_C1E',prixCpf:3500,prixPerso:3500},
   {label:'Permis D — Bus / Car',code:'D',prixCpf:3500,prixPerso:3500},
   {label:'Permis D1 — Minibus ≤ 16 places',code:'D1',prixCpf:3500,prixPerso:3500},
   {label:'Permis D1E — D1 + remorque',code:'PL_D1E',prixCpf:3500,prixPerso:3500},
   {label:'Permis DE — D + remorque',code:'DE',prixCpf:3500,prixPerso:3500},
   {label:'FIMO Marchandises — 140h',code:'FIMOM',prixCpf:3000,prixPerso:3000},
   {label:'FIMO Voyageurs — 140h',code:'FIMOV',prixCpf:3150,prixPerso:3150},
   {label:'FCO Marchandises — 35h',code:'FCOM',prixCpf:1500,prixPerso:1500},
   {label:'FCO Voyageurs — 35h',code:'FCOV',prixCpf:1500,prixPerso:1500}
 ],
 'caces':[
   {label:'R489 Chariots — 1 catégorie',code:'R489',prixCpf:865,prixPerso:865},
   {label:'R489 Chariots — 2 catégories',code:'R489_2CAT',prixCpf:1150,prixPerso:1150},
   {label:'R489 Chariots — 3 catégories',code:'R489_3CAT',prixCpf:1360,prixPerso:1360},
   {label:'R489 Chariots — 4 catégories',code:'R489_4CAT',prixCpf:1500,prixPerso:1500},
   {label:'R482 Engins — 1 catégorie',code:'R482',prixCpf:1956,prixPerso:1956},
   {label:'R482 Engins — 2 catégories',code:'R482_2CAT',prixCpf:2600,prixPerso:2600},
   {label:'R482 Engins — 3 catégories',code:'R482_3CAT',prixCpf:3075,prixPerso:3075},
   {label:'R482 Engins — 4 catégories',code:'R482_4CAT',prixCpf:3390,prixPerso:3390},
   {label:'R485 Gerbeurs — 1 catégorie',code:'R485',prixCpf:708,prixPerso:708},
   {label:'R485 Gerbeurs — 2 catégories',code:'R485_2CAT',prixCpf:940,prixPerso:940},
   {label:'R486 Nacelles — 1 catégorie',code:'R486',prixCpf:1560,prixPerso:1560},
   {label:'R486 Nacelles — 2 catégories',code:'R486_2CAT',prixCpf:2075,prixPerso:2075},
   {label:'R484 Ponts roulants — 1 catégorie',code:'R484',prixCpf:995,prixPerso:995},
   {label:'R484 Ponts roulants — 2 catégories',code:'R484_2CAT',prixCpf:1320,prixPerso:1320},
   {label:'R490 Grues de chargement',code:'R490',prixCpf:1261,prixPerso:1261}
 ],
 'ssiap':[
   {label:'SSIAP 1 — Agent',code:'SSIAP1',prixCpf:1200,prixPerso:1200},
   {label:'SSIAP 2 — Chef d\\'équipe',code:'SSIAP2',prixCpf:2400,prixPerso:2400},
   {label:'SSIAP 3 — Chef de service',code:'SSIAP3',prixCpf:5490,prixPerso:5490}
 ],
 'securite':[
   {label:'Habilitation électrique — Non-électricien (H0/B0)',code:'HAB_NON_ELEC',prixCpf:230,prixPerso:230},
   {label:'Habilitation électrique — Électricien BT',code:'HAB_BT_COMPLEXE',prixCpf:535,prixPerso:535},
   {label:'Habilitation électrique — Haute Tension',code:'HAB_HT',prixCpf:535,prixPerso:535},
   {label:'Travail en hauteur / Port du harnais',code:'HAUT_TRAVAIL',prixCpf:185,prixPerso:185},
   {label:'Échafaudage roulant',code:'ECHAF_ROULANT',prixCpf:230,prixPerso:230},
   {label:'Échafaudage de pied / fixe',code:'ECHAF_PIED',prixCpf:400,prixPerso:400},
   {label:'AIPR Opérateur — présentiel',code:'AIPR_OP_PRES',prixCpf:275,prixPerso:275},
   {label:'AIPR Encadrant — présentiel',code:'AIPR_ENC_PRES',prixCpf:430,prixPerso:430},
   {label:'AIPR Concepteur — présentiel',code:'AIPR_CONC_PRES',prixCpf:430,prixPerso:430},
   {label:'AIPR Opérateur (e-learning)',code:'EL_AIPR_OP',prixCpf:39,prixPerso:39},
   {label:'AIPR Encadrant (e-learning)',code:'EL_AIPR_ENC',prixCpf:59,prixPerso:59},
   {label:'AIPR Concepteur (e-learning)',code:'EL_AIPR_CONC',prixCpf:79,prixPerso:79},
   {label:'SST — Sauveteur Secouriste du Travail (14h)',code:'SST',prixCpf:300,prixPerso:300},
   {label:'MAC SST — recyclage',code:'MAC_SST_PRES',prixCpf:155,prixPerso:155},
   {label:'Gestes et postures',code:'RP_GESTES_POSTURES',prixCpf:155,prixPerso:155},
   {label:'PRAP (e-learning)',code:'EL_PRAP',prixCpf:390,prixPerso:390},
   {label:'Autre formation sécurité (sur devis)',code:'',prixCpf:0,prixPerso:0}
 ]
};"""

# 1) remplace tout le bloc SUB
c2=re.sub(r"var SUB=\{.*?\n\};", NEW_SUB, c, count=1, flags=re.S)
assert c2!=c, "bloc SUB non remplacé"
c=c2
# 2) pickDetail : ajoute S.code
old_pd="function pickDetail(it){S.detail=labelForFamily()+' — '+it.label;S.prixCpf=it.prixCpf;S.prixPerso=it.prixPerso;}"
new_pd="function pickDetail(it){S.detail=labelForFamily()+' — '+it.label;S.prixCpf=it.prixCpf;S.prixPerso=it.prixPerso;S.code=it.code||'';}"
assert c.count(old_pd)==1, "pickDetail introuvable"
c=c.replace(old_pd,new_pd,1)
# 3) payload /t/devis : ajoute code
old_pl="route:S.route||null,prix_cpf:S.prixCpf||null,prix_perso:S.prixPerso||null,cpf_eligible:S.cpf_eligible,"
new_pl="route:S.route||null,code:S.code||null,prix_cpf:S.prixCpf||null,prix_perso:S.prixPerso||null,cpf_eligible:S.cpf_eligible,"
assert c.count(old_pl)==1, "payload /t/devis introuvable"
c=c.replace(old_pl,new_pl,1)

open(p,"w",encoding="utf-8").write(c)
print("OK. delta %+d car | SUB codes: %d | S.code payload: %s"%(len(c)-len(orig), c.count("code:'"), "code:S.code" in c))
