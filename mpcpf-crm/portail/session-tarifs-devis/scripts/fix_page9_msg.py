# -*- coding: utf-8 -*-
import urllib.request, json, base64, ssl
USER="md@abacus-rh.com"; APP="<REDACTED_WP_APP_PASSWORD>"
auth=base64.b64encode(("%s:%s"%(USER,APP)).encode()).decode()
ctx=ssl.create_default_context()
req=urllib.request.Request("https://monpermiscpf.com/wp-json/wp/v2/pages/9?context=edit&_fields=content",
  headers={"Authorization":"Basic "+auth,"User-Agent":"Mozilla/5.0"})
c=json.load(urllib.request.urlopen(req,timeout=60,context=ctx))["content"]["raw"]
open("C:/Users/ThinkPad/Desktop/MPCPF_landing_mobile_v2/_accueil_page9_BAK3.html","w",encoding="utf-8").write(c)

REP=[
 # A+B combinés : masquer le bloc CACES après soumission + message corrigé (ancre = message, unique)
 ("els.devisFeedback.style.display = 'block';\n                els.devisFeedback.style.color = 'var(--success)';\n                els.devisFeedback.textContent = 'Merci ' + prenom + ' ! Votre devis arrive par email sous 24h. Lucie peut aussi vous rappeler.';",
  "if (els.devisCacesWrap) els.devisCacesWrap.style.display = 'none';\n                els.devisFeedback.style.display = 'block';\n                els.devisFeedback.style.color = 'var(--success)';\n                els.devisFeedback.textContent = 'Merci ' + prenom + ' ! Votre devis vient de vous être envoyé par email — validez-le en un clic directement depuis l\\'email.';"),
]
for old,new in REP:
    n=c.count(old)
    assert n==1, "count=%d pour %s"%(n,old[:45])
    c=c.replace(old,new,1)

body=json.dumps({"content":c}).encode("utf-8")
req=urllib.request.Request("https://monpermiscpf.com/wp-json/wp/v2/pages/9",data=body,method="POST",
  headers={"Authorization":"Basic "+auth,"Content-Type":"application/json","User-Agent":"Mozilla/5.0"})
r=urllib.request.urlopen(req,timeout=60,context=ctx)
print("PUSH HTTP",r.status,"modified",json.load(r).get("modified"))
