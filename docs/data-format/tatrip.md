# Format `.tatrip` version 2

Archive ZIP inspectable :

```text
manifest.json
session.json
summary.json
analysis/runs.json
segments.json
normalized/samples.ndjson
raw/*
```

Le manifeste contient `format`, `formatVersion`, `schemaVersion`, date et identifiant de session. L’import restaure les métadonnées, les segments et les échantillons utilisables, puis impose un nouveau choix du participant avant création ou enrichissement. L’archive originale est également conservée en RAW. Une archive version 1 sans `segments.json` reste lisible et produit une liste vide.
