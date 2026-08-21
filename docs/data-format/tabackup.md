# Format `.tabackup` version 1

Archive ZIP inspectable :

```text
manifest.json
settings.json
participants.json
equipment.json
devices.json
calibrations.json
activity-groups.json
sessions/index.json
sessions/raw/*
profiles/analysis.json
statistics/analysis-runs.json
```

La restauration rejette les versions inconnues, réécrit les RAW par chunks, vérifie leur SHA-256 puis restaure les objets métier. La fonction de migration accepte le manifeste historique version 0 et le convertit explicitement en version 1.

