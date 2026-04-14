# Templates /loop — Monitoring ponctuel

Commandes prêtes à copier-coller dans Claude Code pour du monitoring en temps réel.
Le `/loop` tourne dans la session active et s'arrête quand la session se ferme.

## Health check rapide (toutes les 5 min)

```
/loop 5m Vérifie les services VPS 76.13.59.88 : curl ports 3402,3700,3751,3760,3770,3780,3790,3800. Affiche un tableau OK/FAIL avec temps de réponse. Alerte si un service critique est DOWN.
```

## Suivi déploiement (auto-cadencé)

```
/loop Surveille le déploiement en cours sur VPS 76.13.59.88. Vérifie que les services redémarrent correctement après mise à jour PM2. Compare les versions avant/après si possible. Arrête quand tous les services sont stables.
```

## Hot leads temps réel (toutes les 10 min)

```
/loop 10m Récupère les hot-leads depuis http://76.13.59.88:3770/api/hot-leads. Affiche les nouveaux leads depuis le dernier check. Inclus nom, email, téléphone, source.
```

## SSL expiration check (toutes les 2h)

```
/loop 2h Vérifie les certificats SSL de tous les domaines : pilotcpf.monpermiscpf.com, api.monpermiscpf.com, abacus-rh.com, platform.abacus-rh.com, formations.abacus-rh.com, academy.abacus-rh.com, annuaire.monpermiscpf.com. Alerte si un certificat expire dans moins de 14 jours.
```

## Monitoring campagne email (toutes les 30 min)

```
/loop 30m Vérifie les stats campagne depuis http://76.13.59.88:3770/api/stats. Affiche : emails envoyés, ouvertures, clics, hot-leads. Calcule les taux de conversion.
```

## Suivi agents COMEX (toutes les heures)

```
/loop 1h Vérifie l'état des agents COMEX via http://76.13.59.88:3751/api/overview et le LLM Router via http://76.13.59.88:3800/health. Affiche le nombre de briefings générés et les erreurs éventuelles.
```
