# -*- coding: utf-8 -*-
# Option 2 : généralise le sélecteur du simulateur (CACES) à toutes les familles sur-devis
# (poids-lourd, ssiap, sécurité) → chacune envoie son code catalogue.
import urllib.request, json, base64, ssl, re
USER="md@abacus-rh.com"; APP="<REDACTED_WP_APP_PASSWORD>"
auth=base64.b64encode(("%s:%s"%(USER,APP)).encode()).decode()
ctx=ssl.create_default_context()
req=urllib.request.Request("https://monpermiscpf.com/wp-json/wp/v2/pages/9?context=edit&_fields=content",
  headers={"Authorization":"Basic "+auth,"User-Agent":"Mozilla/5.0"})
c=json.load(urllib.request.urlopen(req,timeout=60,context=ctx))["content"]["raw"]
open("C:/Users/ThinkPad/Desktop/MPCPF_landing_mobile_v2/_accueil_page9_BAK5.html","w",encoding="utf-8").write(c)
orig=c

# (label, code, prix) par famille
CACES=[("R489 Chariots — 1 catégorie","R489",865),("R489 Chariots — 2 catégories","R489_2CAT",1150),("R489 Chariots — 3 catégories","R489_3CAT",1360),("R489 Chariots — 4 catégories","R489_4CAT",1500),
("R482 Engins — 1 catégorie","R482",1956),("R482 Engins — 2 catégories","R482_2CAT",2600),("R482 Engins — 3 catégories","R482_3CAT",3075),("R482 Engins — 4 catégories","R482_4CAT",3390),
("R485 Gerbeurs — 1 catégorie","R485",708),("R485 Gerbeurs — 2 catégories","R485_2CAT",940),("R486 Nacelles — 1 catégorie","R486",1560),("R486 Nacelles — 2 catégories","R486_2CAT",2075),
("R484 Ponts roulants — 1 catégorie","R484",995),("R484 Ponts roulants — 2 catégories","R484_2CAT",1320),("R490 Grue de chargement","R490",1261),
("R489 — Recyclage 1 catégorie","R489_RECYC",735),("R489 — Recyclage 2 catégories","R489_2CAT_RECYC",980),("R489 — Recyclage 3 catégories","R489_3CAT_RECYC",1155),("R489 — Recyclage 4 catégories","R489_4CAT_RECYC",1275),
("R482 — Recyclage 1 catégorie","R482_RECYC",1665),("R482 — Recyclage 2 catégories","R482_2CAT_RECYC",2210),("R482 — Recyclage 3 catégories","R482_3CAT_RECYC",2615),("R482 — Recyclage 4 catégories","R482_4CAT_RECYC",2880),
("R485 — Recyclage 1 catégorie","R485_RECYC",600),("R485 — Recyclage 2 catégories","R485_2CAT_RECYC",800),("R486 — Recyclage 1 catégorie","R486_RECYC",1325),("R486 — Recyclage 2 catégories","R486_2CAT_RECYC",1765),
("R484 — Recyclage 1 catégorie","R484_RECYC",845),("R484 — Recyclage 2 catégories","R484_2CAT_RECYC",1120),("R490 — Recyclage","R490_RECYC",1070)]
PL=[("Permis C — Marchandises > 3,5t","C",3000),("Permis CE — C + remorque","CE",3500),("Permis C1 — 3,5t à 7,5t","C1",3000),("Permis C1E — C1 + remorque","PL_C1E",3500),
("Permis D — Bus / Car","D",3500),("Permis D1 — Minibus ≤ 16 places","D1",3500),("Permis D1E — D1 + remorque","PL_D1E",3500),("Permis DE — D + remorque","DE",3500),
("FIMO Marchandises — 140h","FIMOM",3000),("FIMO Voyageurs — 140h","FIMOV",3150),("FCO Marchandises — 35h","FCOM",1500),("FCO Voyageurs — 35h","FCOV",1500)]
SSIAP=[("SSIAP 1 — Agent","SSIAP1",1200),("SSIAP 2 — Chef d'équipe","SSIAP2",2400),("SSIAP 3 — Chef de service","SSIAP3",5490)]
SEC=[("Habilitation électrique — Non-électricien (H0/B0)","HAB_NON_ELEC",230),("Habilitation électrique — Électricien BT","HAB_BT_COMPLEXE",535),("Habilitation électrique — Haute Tension","HAB_HT",535),
("Travail en hauteur / Port du harnais","HAUT_TRAVAIL",185),("Échafaudage roulant","ECHAF_ROULANT",230),("Échafaudage de pied / fixe","ECHAF_PIED",400),
("AIPR Opérateur — présentiel","AIPR_OP_PRES",275),("AIPR Encadrant — présentiel","AIPR_ENC_PRES",430),("AIPR Concepteur — présentiel","AIPR_CONC_PRES",430),
("AIPR Opérateur (e-learning)","EL_AIPR_OP",39),("AIPR Encadrant (e-learning)","EL_AIPR_ENC",59),("AIPR Concepteur (e-learning)","EL_AIPR_CONC",79),
("SST — Sauveteur Secouriste du Travail (14h)","SST",300),("MAC SST — recyclage","MAC_SST_PRES",155),("Gestes et postures","RP_GESTES_POSTURES",155),("PRAP (e-learning)","EL_PRAP",390)]
def js(rows): return ",".join("{label:%s,code:'%s',prixCpf:%d}"%(json.dumps(l,ensure_ascii=False),cd,p) for l,cd,p in rows)
DETAIL="var DETAIL_OPTS={'caces':["+js(CACES)+"],'poids-lourd':["+js(PL)+"],'ssiap':["+js(SSIAP)+"],'securite':["+js(SEC)+"]};\n"
HELPER="""function populateDetailSelect(f){var el=document.getElementById('devis-caces');if(!el)return false;var opts=DETAIL_OPTS[f];if(!opts)return false;var h='<option value=\\"\\" disabled selected>Choisissez votre formation</option>';for(var i=0;i<opts.length;i++){var o=opts[i];h+='<option value=\\"'+i+'\\" data-prix=\\"'+o.prixCpf+'\\" data-code=\\"'+(o.code||'')+'\\" data-label=\\"'+String(o.label).replace(/\\"/g,'&quot;')+'\\">'+o.label+'</option>';}el.innerHTML=h;return true;}\n"""

# 1) injecte DETAIL_OPTS + helper après 'use strict';
assert c.count("'use strict';")==1
c=c.replace("'use strict';","'use strict';\n"+DETAIL+HELPER,1)
# 2) show condition (2x) : peuple + affiche pour toute famille de DETAIL_OPTS
old_show="els.devisCacesWrap.style.display = (state.formation === 'caces') ? 'block' : 'none';"
new_show="els.devisCacesWrap.style.display = populateDetailSelect(state.formation) ? 'block' : 'none';"
n=c.count(old_show); assert n>=1, "show condition introuvable"; c=c.replace(old_show,new_show)
# 3) submit override généralisé
assert c.count("if (state.formation === 'caces') {")==1
c=c.replace("if (state.formation === 'caces') {","if (DETAIL_OPTS[state.formation]) {",1)
# 4) message + label
c=c.replace("Merci de préciser votre catégorie CACES.","Merci de préciser votre formation.")
c=c.replace("Précisez votre besoin CACES *","Précisez votre formation *")

open("C:/Users/ThinkPad/Desktop/MPCPF_landing_mobile_v2/_accueil_page9_v4.html","w",encoding="utf-8").write(c)
print("show remplacés:",c.count(new_show),"| DETAIL_OPTS:",("var DETAIL_OPTS=" in c),"| helper:",("function populateDetailSelect" in c),"| submit gén:",("if (DETAIL_OPTS[state.formation])" in c))
body=json.dumps({"content":c}).encode("utf-8")
req=urllib.request.Request("https://monpermiscpf.com/wp-json/wp/v2/pages/9",data=body,method="POST",
  headers={"Authorization":"Basic "+auth,"Content-Type":"application/json","User-Agent":"Mozilla/5.0"})
r=urllib.request.urlopen(req,timeout=60,context=ctx)
print("PUSH HTTP",r.status,"modified",json.load(r).get("modified"))
