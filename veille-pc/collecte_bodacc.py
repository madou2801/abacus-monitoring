# -*- coding: utf-8 -*-
"""Collecte exhaustive des procédures collectives sur les 5 secteurs ciblés.

Interroge l'API BODACC Open Data (Opendatasoft v2.1), filtre sur les codes NAF
du référentiel, et écrit un CSV au format attendu par genere_excel.py.

    python3 collecte_bodacc.py --depuis 2025-01-01 --sortie cas_bodacc.csv
    python3 genere_excel.py veille_complete.xlsx   # après avoir pointé le CSV

À exécuter depuis une machine dont le réseau n'est pas restreint (VPS ABACUS
76.13.59.88, ou poste local). Depuis un environnement Claude Code dont
l'allowlist ne couvre pas bodacc-datadila.opendatasoft.com, le proxy renvoie un
403 sur le CONNECT et le script s'arrête avec un message explicite.

Aucune authentification n'est requise : le jeu de données est public.
"""
import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from referentiel import SECTEURS  # noqa: E402

BASE = ("https://bodacc-datadila.opendatasoft.com/api/explore/v2.1"
        "/catalog/datasets/annonces-commerciales/records")
PAGE = 100          # plafond Opendatasoft par requête
PLAFOND = 10000     # plafond d'offset de l'API
PAUSE = 0.4         # politesse entre deux appels

# NAF -> secteur, aplati une fois pour toutes.
NAF_VERS_SECTEUR = {
    code: secteur
    for secteur, d in SECTEURS.items()
    for code in d["codes"]
}


def variantes(code):
    """BODACC stocke l'APE tantôt « 22.21Z », tantôt « 2221Z »."""
    return {code, code.replace(".", "")}


TOUTES_VARIANTES = {v: NAF_VERS_SECTEUR[c]
                    for c in NAF_VERS_SECTEUR for v in variantes(c)}


def appel(params):
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "abacus-veille-pc/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as rep:
            return json.loads(rep.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise SystemExit("BODACC a répondu %s sur %s\n%s"
                         % (exc.code, url, exc.read()[:500].decode("utf-8", "replace")))
    except urllib.error.URLError as exc:
        raise SystemExit(
            "Impossible de joindre le BODACC : %s\n"
            "Si le message mentionne un 403 sur le CONNECT, le proxy réseau de "
            "l'environnement bloque le domaine. Exécuter ce script depuis le VPS, "
            "ou ajouter bodacc-datadila.opendatasoft.com à l'allowlist." % exc.reason)


def moissonne(depuis, jusqua):
    """Parcourt les annonces de procédure collective sur la période."""
    where = ('familleavis_lib LIKE "%%Procédure collective%%" '
             'AND dateparution >= date\'%s\' AND dateparution <= date\'%s\''
             % (depuis, jusqua))
    total = appel({"where": where, "limit": 1})["total_count"]
    print("BODACC : %d annonces de procédure collective du %s au %s"
          % (total, depuis, jusqua), file=sys.stderr)
    if total > PLAFOND:
        print("ATTENTION : au-delà de %d résultats l'API refuse de paginer. "
              "Découper la période en tranches mensuelles." % PLAFOND, file=sys.stderr)

    offset = 0
    while offset < min(total, PLAFOND):
        lot = appel({"where": where, "limit": PAGE, "offset": offset,
                     "order_by": "dateparution"})
        for rec in lot.get("results", []):
            yield rec
        offset += PAGE
        print("  ... %d / %d" % (min(offset, total), total), file=sys.stderr)
        time.sleep(PAUSE)


def ape_de(rec):
    """L'APE se niche à plusieurs endroits selon le type d'annonce."""
    for cle in ("cat_ape", "ape", "codeape"):
        val = rec.get(cle)
        if val:
            return str(val).strip().upper()
    for cle in ("jugement", "personnes", "listepersonnes"):
        brut = rec.get(cle)
        if not brut:
            continue
        if isinstance(brut, str):
            try:
                brut = json.loads(brut)
            except ValueError:
                continue
        pile = [brut]
        while pile:
            noeud = pile.pop()
            if isinstance(noeud, dict):
                for k, v in noeud.items():
                    if k.lower().replace("_", "") in ("ape", "codeape", "activite"):
                        if v:
                            return str(v).strip().upper()
                    pile.append(v)
            elif isinstance(noeud, list):
                pile.extend(noeud)
    return ""


def champ(rec, *cles):
    for cle in cles:
        val = rec.get(cle)
        if val:
            return str(val).strip()
    return "n.d."


def convertit(rec, secteur, ape):
    ville = champ(rec, "ville")
    cp = champ(rec, "cp")
    dept = champ(rec, "numerodepartement")
    localisation = " ".join(x for x in (cp, ville) if x != "n.d.") or "n.d."
    if dept != "n.d.":
        localisation += " (%s)" % dept
    numero = champ(rec, "id", "publicationavis")
    return {
        "secteur": secteur,
        "raison_sociale": champ(rec, "commercant", "denomination"),
        "siren": champ(rec, "registre").split(",")[0].strip() or "n.d.",
        "localisation": "%s — tribunal : %s" % (localisation, champ(rec, "tribunal")),
        "effectif": "n.d.",
        "ca_eur": "n.d.",
        "procedure": champ(rec, "familleavis_lib", "typeavis_lib"),
        "date_jugement": champ(rec, "dateparution"),
        "statut": "APE %s — annonce BODACC %s" % (ape or "n.d.", numero),
        "actifs_industriels": "À qualifier — visite de site requise",
        "source_url": "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:%s"
                      % numero,
        "fiabilite": "BODACC — jugement publié",
        "commentaire_mali": "",
    }


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--depuis", default="2025-01-01", help="date de début (AAAA-MM-JJ)")
    p.add_argument("--jusqua", default=time.strftime("%Y-%m-%d"),
                   help="date de fin (AAAA-MM-JJ), défaut aujourd'hui")
    p.add_argument("--sortie", default="cas_bodacc.csv", help="CSV de sortie")
    args = p.parse_args()

    retenus, vus, sans_ape = [], 0, 0
    for rec in moissonne(args.depuis, args.jusqua):
        vus += 1
        ape = ape_de(rec)
        if not ape:
            sans_ape += 1
            continue
        secteur = TOUTES_VARIANTES.get(ape) or TOUTES_VARIANTES.get(ape.replace(".", ""))
        if secteur:
            retenus.append(convertit(rec, secteur, ape))

    champs = ["secteur", "raison_sociale", "siren", "localisation", "effectif",
              "ca_eur", "procedure", "date_jugement", "statut", "actifs_industriels",
              "source_url", "fiabilite", "commentaire_mali"]
    with open(args.sortie, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=champs, delimiter=";")
        w.writeheader()
        w.writerows(retenus)

    print("\n%d annonces parcourues — %d retenues sur les 5 secteurs "
          "(%d sans code APE exploitable)." % (vus, len(retenus), sans_ape),
          file=sys.stderr)
    print("Écrit : %s" % args.sortie, file=sys.stderr)
    print("Étape suivante : renseigner effectif, CA et actifs (les annonces "
          "BODACC ne les portent pas), puis regénérer le classeur.", file=sys.stderr)


if __name__ == "__main__":
    main()
