# Format `.tabackup` version 2

Archive ZIP inspectable :

```text
manifest.json
settings.json
participants.json
equipment.json
devices.json
calibrations.json
activity-groups.json
segments.json
sessions/index.json
sessions/raw/*
profiles/analysis.json
statistics/analysis-runs.json
```

La restauration rejette les versions inconnues, réécrit les RAW par chunks, vérifie leur SHA-256 puis restaure les objets métier. La fonction de migration accepte les manifestes historiques versions 0 et 1 et les convertit explicitement en version 2. L’absence historique de `segments.json` produit une liste vide sans inventer de segment.
