# -*- coding: utf-8 -*-
import urllib.request, json, base64, ssl
content=open("C:/Users/ThinkPad/Desktop/MPCPF_landing_mobile_v2/_accueil_page9_NEW.html",encoding="utf-8").read()
USER="md@abacus-rh.com"; APP="<REDACTED_WP_APP_PASSWORD>"
auth=base64.b64encode(("%s:%s"%(USER,APP)).encode()).decode()
body=json.dumps({"content":content}).encode("utf-8")
req=urllib.request.Request("https://monpermiscpf.com/wp-json/wp/v2/pages/9",data=body,method="POST",
  headers={"Authorization":"Basic "+auth,"Content-Type":"application/json","User-Agent":"Mozilla/5.0"})
ctx=ssl.create_default_context()
try:
    r=urllib.request.urlopen(req,timeout=60,context=ctx)
    d=json.load(r)
    print("HTTP",r.status,"| page id",d.get("id"),"| modified",d.get("modified"))
except urllib.error.HTTPError as e:
    print("HTTPError",e.code,e.read().decode()[:300])
