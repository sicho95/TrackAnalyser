# Architecture V1

`SPEC.md` reste l’unique source produit normative. Ce document décrit l’implémentation V1.

## Monorepo

- `apps/web` : PWA React/Vite, routage par hash et service worker contrôlé ;
- `packages/domain` : modèle métier, pipeline, profils, analyses et comparaison ;
- `packages/storage` : repositories IndexedDB, chunks RAW et préférence OPFS ;
- `packages/sensors` : sources smartphone, diagnostics et coordination d’acquisition ;
- `packages/importers` : FIT, GPX, TCX, JSON, Apple Health fichier et `.tatrip` ;
- `packages/exporters` : JSON, CSV, `.tatrip` et `.tabackup` ;
- `packages/fusion` : synchronisation UTC et sélection/fusion par canal ;
- `packages/visualization` : registre sémantique et graphiques SVG ;
- `packages/ui` : composants de navigation et de présentation ;
- `core/analytics` : cœur C++20, tests natifs et façade Emscripten ;
- `firmware` : point d’intégration ESP-IDF futur.

## Pipeline

```text
SensorSource / ImportedFileSource
        │
        ▼
RAW immuable, chunké, horodaté et attribué à un participant
        │
        ▼
NORMALIZED en unités SI
        │
        ▼
SYNCHRONIZED en UTC avec rapport d’offset et de confiance
        │
        ▼
FUSED, source de vérité choisie séparément pour chaque canal
        │
        ▼
DERIVED, valeurs calculées sans remplacer leurs sources
        │
        ▼
ANALYSIS / AnalysisRun immuable et versionné
        │
        ├── visualisation
        ├── comparaison
        └── profils statistiques agrégés
```

Une transition non adjacente est refusée. `executeAnalysis` exige un jeu `DERIVED`. Le fingerprint d’entrée inclut les échantillons, le participant, la version moteur et le profil.

## Frontières

Le domaine ne dépend ni du navigateur, ni de MapLibre, ni d’IndexedDB. Les capteurs ne connaissent pas les écrans. La PWA orchestre les ports et les repositories. Le cœur C++ n’utilise aucune API Web ou ESP-IDF, ce qui permet la compilation native, WebAssembly et firmware.

## Versions techniques

Le build expose `APP_VERSION`, `BUILD_ID`, `GIT_COMMIT`, `SCHEMA_VERSION` et `ANALYSIS_VERSION`. `version.json` permet une vérification distante. Le service worker prépare la nouvelle version mais l’application ne l’active jamais pendant une session active.

Les copies principales sont regroupées dans un catalogue français typé. Les paquets d’interface reçoivent leurs libellés ou utilisent leur propre catalogue afin de préparer l’anglais sans modifier le domaine.

L’ordre d’autorisation et les repères des capteurs sont détaillés dans [acquisition-smartphone.md](./acquisition-smartphone.md).
