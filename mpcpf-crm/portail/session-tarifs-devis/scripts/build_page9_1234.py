# -*- coding: utf-8 -*-
import urllib.request, json, base64, ssl, re
USER="md@abacus-rh.com"; APP="<REDACTED_WP_APP_PASSWORD>"
auth=base64.b64encode(("%s:%s"%(USER,APP)).encode()).decode()
ctx=ssl.create_default_context()
# 1) GET live content.raw
req=urllib.request.Request("https://monpermiscpf.com/wp-json/wp/v2/pages/9?context=edit&_fields=content",
  headers={"Authorization":"Basic "+auth,"User-Agent":"Mozilla/5.0"})
c=json.load(urllib.request.urlopen(req,timeout=60,context=ctx))["content"]["raw"]
open("C:/Users/ThinkPad/Desktop/MPCPF_landing_mobile_v2/_accueil_page9_BAK2.html","w",encoding="utf-8").write(c)
orig=c
# 2) nouveau select 1/2/3/4
INIT=[
 ("r489-1c-i",865,"CACES R489 - 1 catégorie - Initiation","R489 — 1 catégorie"),
 ("r489-2c-i",1150,"CACES R489 - 2 catégories - Initiation","R489 — 2 catégories"),
 ("r489-3c-i",1360,"CACES R489 - 3 catégories - Initiation","R489 — 3 catégories"),
 ("r489-4c-i",1500,"CACES R489 - 4 catégories - Initiation","R489 — 4 catégories"),
 ("r482-1c-i",1956,"CACES R482 - 1 catégorie - Initiation","R482 — 1 catégorie"),
 ("r482-2c-i",2600,"CACES R482 - 2 catégories - Initiation","R482 — 2 catégories"),
 ("r482-3c-i",3075,"CACES R482 - 3 catégories - Initiation","R482 — 3 catégories"),
 ("r482-4c-i",3390,"CACES R482 - 4 catégories - Initiation","R482 — 4 catégories"),
 ("r485-1c-i",708,"CACES R485 - 1 catégorie - Initiation","R485 — 1 catégorie"),
 ("r485-2c-i",940,"CACES R485 - 2 catégories - Initiation","R485 — 2 catégories"),
 ("r486-1c-i",1560,"CACES R486 - 1 catégorie - Initiation","R486 — 1 catégorie"),
 ("r486-2c-i",2075,"CACES R486 - 2 catégories - Initiation","R486 — 2 catégories"),
 ("r484-1c-i",995,"CACES R484 - 1 catégorie - Initiation","R484 — 1 catégorie"),
 ("r484-2c-i",1320,"CACES R484 - 2 catégories - Initiation","R484 — 2 catégories"),
 ("r490-i",1261,"CACES R490 grue de chargement - Initiation","R490 — Grue de chargement"),
]
RECYC=[
 ("r489-1c-r",735,"CACES R489 - Recyclage 1 catégorie","R489 — Recyclage 1 catégorie"),
 ("r489-2c-r",980,"CACES R489 - Recyclage 2 catégories","R489 — Recyclage 2 catégories"),
 ("r489-3c-r",1155,"CACES R489 - Recyclage 3 catégories","R489 — Recyclage 3 catégories"),
 ("r489-4c-r",1275,"CACES R489 - Recyclage 4 catégories","R489 — Recyclage 4 catégories"),
 ("r482-1c-r",1665,"CACES R482 - Recyclage 1 catégorie","R482 — Recyclage 1 catégorie"),
 ("r482-2c-r",2210,"CACES R482 - Recyclage 2 catégories","R482 — Recyclage 2 catégories"),
 ("r482-3c-r",2615,"CACES R482 - Recyclage 3 catégories","R482 — Recyclage 3 catégories"),
 ("r482-4c-r",2880,"CACES R482 - Recyclage 4 catégories","R482 — Recyclage 4 catégories"),
 ("r485-1c-r",600,"CACES R485 - Recyclage 1 catégorie","R485 — Recyclage 1 catégorie"),
 ("r485-2c-r",800,"CACES R485 - Recyclage 2 catégories","R485 — Recyclage 2 catégories"),
 ("r486-1c-r",1325,"CACES R486 - Recyclage 1 catégorie","R486 — Recyclage 1 catégorie"),
 ("r486-2c-r",1765,"CACES R486 - Recyclage 2 catégories","R486 — Recyclage 2 catégories"),
 ("r484-1c-r",845,"CACES R484 - Recyclage 1 catégorie","R484 — Recyclage 1 catégorie"),
 ("r484-2c-r",1120,"CACES R484 - Recyclage 2 catégories","R484 — Recyclage 2 catégories"),
 ("r490-r",1070,"CACES R490 - Recyclage","R490 — Recyclage"),
]
def opts(rows): return "\n".join('                            <option value="%s" data-prix="%d" data-label="%s">%s</option>'%(v,p,dl,lc) for v,p,dl,lc in rows)
open_tag=re.search(r'(<select[^>]*id="devis-caces"[^>]*>)',c).group(1)
new_select=(open_tag+"\n"
 +'                        <option value="" disabled selected>Choisissez votre catégorie</option>\n'
 +'                        <optgroup label="Formation initiale">\n'+opts(INIT)+"\n                        </optgroup>\n"
 +'                        <optgroup label="Recyclage">\n'+opts(RECYC)+"\n                        </optgroup>\n"
 +"                    </select>")
c2=re.sub(r'<select[^>]*id="devis-caces".*?</select>',lambda m:new_select,c,count=1,flags=re.S)
assert c2!=c and c2.count("<select")==orig.count("<select"), "remplacement select KO"
c=c2
open("C:/Users/ThinkPad/Desktop/MPCPF_landing_mobile_v2/_accueil_page9_v2.html","w",encoding="utf-8").write(c)
print("select balance:",c.count("<select"),c.count("</select>"),"| optgroup:",c.count("<optgroup"),c.count("</optgroup>"),"| script:",c.count("<script"),c.count("</script>"))
print("options CACES:",new_select.count("<option"))
# 3) PUSH
body=json.dumps({"content":c}).encode("utf-8")
req=urllib.request.Request("https://monpermiscpf.com/wp-json/wp/v2/pages/9",data=body,method="POST",
  headers={"Authorization":"Basic "+auth,"Content-Type":"application/json","User-Agent":"Mozilla/5.0"})
r=urllib.request.urlopen(req,timeout=60,context=ctx)
print("PUSH HTTP",r.status,"modified",json.load(r).get("modified"))
