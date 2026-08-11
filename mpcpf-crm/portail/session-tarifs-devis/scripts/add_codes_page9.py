# -*- coding: utf-8 -*-
# Phase 2 (simulateur) : ajoute data-code (code catalogue) aux options CACES + envoie `code` au payload.
import urllib.request, json, base64, ssl, re
USER="md@abacus-rh.com"; APP="<REDACTED_WP_APP_PASSWORD>"
auth=base64.b64encode(("%s:%s"%(USER,APP)).encode()).decode()
ctx=ssl.create_default_context()
req=urllib.request.Request("https://monpermiscpf.com/wp-json/wp/v2/pages/9?context=edit&_fields=content",
  headers={"Authorization":"Basic "+auth,"User-Agent":"Mozilla/5.0"})
c=json.load(urllib.request.urlopen(req,timeout=60,context=ctx))["content"]["raw"]
open("C:/Users/ThinkPad/Desktop/MPCPF_landing_mobile_v2/_accueil_page9_BAK4.html","w",encoding="utf-8").write(c)
orig=c

# (value, prix, CODE catalogue, data-label, label court)
INIT=[
 ("r489-1c-i",865,"R489","CACES R489 - 1 catégorie - Initiation","R489 — 1 catégorie"),
 ("r489-2c-i",1150,"R489_2CAT","CACES R489 - 2 catégories - Initiation","R489 — 2 catégories"),
 ("r489-3c-i",1360,"R489_3CAT","CACES R489 - 3 catégories - Initiation","R489 — 3 catégories"),
 ("r489-4c-i",1500,"R489_4CAT","CACES R489 - 4 catégories - Initiation","R489 — 4 catégories"),
 ("r482-1c-i",1956,"R482","CACES R482 - 1 catégorie - Initiation","R482 — 1 catégorie"),
 ("r482-2c-i",2600,"R482_2CAT","CACES R482 - 2 catégories - Initiation","R482 — 2 catégories"),
 ("r482-3c-i",3075,"R482_3CAT","CACES R482 - 3 catégories - Initiation","R482 — 3 catégories"),
 ("r482-4c-i",3390,"R482_4CAT","CACES R482 - 4 catégories - Initiation","R482 — 4 catégories"),
 ("r485-1c-i",708,"R485","CACES R485 - 1 catégorie - Initiation","R485 — 1 catégorie"),
 ("r485-2c-i",940,"R485_2CAT","CACES R485 - 2 catégories - Initiation","R485 — 2 catégories"),
 ("r486-1c-i",1560,"R486","CACES R486 - 1 catégorie - Initiation","R486 — 1 catégorie"),
 ("r486-2c-i",2075,"R486_2CAT","CACES R486 - 2 catégories - Initiation","R486 — 2 catégories"),
 ("r484-1c-i",995,"R484","CACES R484 - 1 catégorie - Initiation","R484 — 1 catégorie"),
 ("r484-2c-i",1320,"R484_2CAT","CACES R484 - 2 catégories - Initiation","R484 — 2 catégories"),
 ("r490-i",1261,"R490","CACES R490 grue de chargement - Initiation","R490 — Grue de chargement"),
]
RECYC=[
 ("r489-1c-r",735,"R489_RECYC","CACES R489 - Recyclage 1 catégorie","R489 — Recyclage 1 catégorie"),
 ("r489-2c-r",980,"R489_2CAT_RECYC","CACES R489 - Recyclage 2 catégories","R489 — Recyclage 2 catégories"),
 ("r489-3c-r",1155,"R489_3CAT_RECYC","CACES R489 - Recyclage 3 catégories","R489 — Recyclage 3 catégories"),
 ("r489-4c-r",1275,"R489_4CAT_RECYC","CACES R489 - Recyclage 4 catégories","R489 — Recyclage 4 catégories"),
 ("r482-1c-r",1665,"R482_RECYC","CACES R482 - Recyclage 1 catégorie","R482 — Recyclage 1 catégorie"),
 ("r482-2c-r",2210,"R482_2CAT_RECYC","CACES R482 - Recyclage 2 catégories","R482 — Recyclage 2 catégories"),
 ("r482-3c-r",2615,"R482_3CAT_RECYC","CACES R482 - Recyclage 3 catégories","R482 — Recyclage 3 catégories"),
 ("r482-4c-r",2880,"R482_4CAT_RECYC","CACES R482 - Recyclage 4 catégories","R482 — Recyclage 4 catégories"),
 ("r485-1c-r",600,"R485_RECYC","CACES R485 - Recyclage 1 catégorie","R485 — Recyclage 1 catégorie"),
 ("r485-2c-r",800,"R485_2CAT_RECYC","CACES R485 - Recyclage 2 catégories","R485 — Recyclage 2 catégories"),
 ("r486-1c-r",1325,"R486_RECYC","CACES R486 - Recyclage 1 catégorie","R486 — Recyclage 1 catégorie"),
 ("r486-2c-r",1765,"R486_2CAT_RECYC","CACES R486 - Recyclage 2 catégories","R486 — Recyclage 2 catégories"),
 ("r484-1c-r",845,"R484_RECYC","CACES R484 - Recyclage 1 catégorie","R484 — Recyclage 1 catégorie"),
 ("r484-2c-r",1120,"R484_2CAT_RECYC","CACES R484 - Recyclage 2 catégories","R484 — Recyclage 2 catégories"),
 ("r490-r",1070,"R490_RECYC","CACES R490 - Recyclage","R490 — Recyclage"),
]
def opts(rows): return "\n".join('                            <option value="%s" data-prix="%d" data-code="%s" data-label="%s">%s</option>'%(v,p,cd,dl,lc) for v,p,cd,dl,lc in rows)
open_tag=re.search(r'(<select[^>]*id="devis-caces"[^>]*>)',c).group(1)
new_select=(open_tag+"\n"
 +'                        <option value="" disabled selected>Choisissez votre catégorie</option>\n'
 +'                        <optgroup label="Formation initiale">\n'+opts(INIT)+"\n                        </optgroup>\n"
 +'                        <optgroup label="Recyclage">\n'+opts(RECYC)+"\n                        </optgroup>\n"
 +"                    </select>")
c=re.sub(r'<select[^>]*id="devis-caces".*?</select>',lambda m:new_select,c,count=1,flags=re.S)

# JS : codeFinal + envoi dans le payload
REP=[
 ("var detailFinal = state.label, prixFinal = state.prixCpf;",
  "var detailFinal = state.label, prixFinal = state.prixCpf, codeFinal = state.code || '';"),
 ("prixFinal = parseInt(copt.getAttribute('data-prix'), 10);",
  "prixFinal = parseInt(copt.getAttribute('data-prix'), 10);\n                codeFinal = copt.getAttribute('data-code') || '';"),
 ("prix_cpf: prixFinal, prix_perso: state.prixPerso, cpf_eligible: cpfEl,",
  "code: codeFinal, prix_cpf: prixFinal, prix_perso: state.prixPerso, cpf_eligible: cpfEl,"),
]
for old,new in REP:
    n=c.count(old); assert n==1, "count=%d pour %s"%(n,old[:45]); c=c.replace(old,new,1)

open("C:/Users/ThinkPad/Desktop/MPCPF_landing_mobile_v2/_accueil_page9_v3.html","w",encoding="utf-8").write(c)
print("balise select:",c.count("<select"),c.count("</select>"),"| data-code CACES:",new_select.count("data-code"),"| code payload:", "code: codeFinal" in c)
body=json.dumps({"content":c}).encode("utf-8")
req=urllib.request.Request("https://monpermiscpf.com/wp-json/wp/v2/pages/9",data=body,method="POST",
  headers={"Authorization":"Basic "+auth,"Content-Type":"application/json","User-Agent":"Mozilla/5.0"})
r=urllib.request.urlopen(req,timeout=60,context=ctx)
print("PUSH HTTP",r.status,"modified",json.load(r).get("modified"))
