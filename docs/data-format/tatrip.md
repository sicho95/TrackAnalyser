# Format `.tatrip` version 1

Archive ZIP inspectable :

```text
manifest.json
session.json
summary.json
analysis/runs.json
normalized/samples.ndjson
raw/*
```

Le manifeste contient `format`, `formatVersion`, `schemaVersion`, date et identifiant de session. L’import restaure les métadonnées et échantillons utilisables, puis impose un nouveau choix du participant avant création ou enrichissement. L’archive originale est également conservée en RAW.

