# Matrice d’acceptation V1

Cette matrice complète `SPEC.md` sans le remplacer.

| Critère | Preuve dans le dépôt |
|---|---|
| PWA iOS, Pages, HashRouter, offline | manifeste, `vite.config.ts`, `sw.ts`, CI et E2E offline Chromium |
| Session smartphone | DeviceMotion, Geolocation, permissions, acquisition progressive et checkpoints |
| Participant obligatoire | domaine, écran de démarrage/import et tests multi-participant |
| Dix analyseurs | registre exhaustif et test paramétré sur les dix activités |
| RAW immuable | OPFS avec miroir/fallback IndexedDB, SHA-256, test de réécriture interdite |
| Diagnostic capteurs | fréquence observée, jitter, trous, couverture, précision et qualité |
| FIT réel | SDK officiel, fixture de 122 330 octets, 1 319 records et champs inconnus |
| Fusion par canal | `DataFusionEngine`, provenance et tests AUTO/FUSION |
| Historique | AnalysisProfile/AnalysisRun, profils immutables, original/dernier et réanalyse manuelle depuis les RAW |
| Import/export | FIT, GPX, TCX, Apple XML, JSON, `.tatrip`, CSV, `.tabackup` |
| Cartographie | MapLibre, OSM/OpenTopoMap interchangeables, analyse sans carte |
| Visualisations | registre, courbes, histogrammes, jauges signées et huit axes de comparaison à échelle commune |
| Internationalisation | catalogue français typé, copies principales externalisées et navigation injectée dans le paquet UI |
| C++/WASM/ESP-IDF | CMake, CTest, Emscripten et composant firmware commun |
| Hot refresh sûr | version distante, prompt, persistance `pendingUpdate`, blocage pendant session et test de politique |

## Validations qui restent matérielles

Les API capteurs iOS et l’installation écran d’accueil doivent être validées sur un iPhone réel. La cadence, le verrouillage écran, les interruptions Safari, les permissions et les limites OPFS ne peuvent pas être reproduits fidèlement par Playwright.

Les seuils de calibration, freinage, inclinaison, impact, thermique et phase de vol sont opérationnels et versionnés mais doivent être calibrés par acquisitions terrain contrôlées. Toute modification créera une nouvelle version de profil.

Le déploiement Pages ne se produit qu’après merge sur `main` et CI verte ; une branche de PR ne modifie donc pas la production.
