# TrackAnalyser — Décisions d’implémentation V1.2

**Statut :** complément normatif à `SPEC.md`  
**Date :** 21 août 2026  
**Priorité :** en cas d’ambiguïté technique dans `SPEC.md`, les décisions de ce document prévalent pour la V1.

## 1. Hébergement, CI/CD et PWA

- Héberger exclusivement la V1 sur GitHub Pages.
- Utiliser GitHub Actions pour le CI, le build et le déploiement GitHub Pages.
- Déclencher le CI sur `pull_request` et `push` vers `main`.
- Déclencher le déploiement uniquement après succès du CI sur `main`.
- Ajouter `workflow_dispatch` pour permettre un lancement manuel.
- Configurer correctement le `base` Vite pour le chemin GitHub Pages `/TrackAnalyser/`.
- Utiliser un routage compatible GitHub Pages sans dépendre d’un serveur de réécriture ; privilégier `HashRouter` pour la V1.
- Utiliser un Service Worker PWA, pas un worker serveur. GitHub Pages reste un hébergement statique.
- Utiliser `vite-plugin-pwa` en mode `injectManifest` afin de contrôler précisément l’activation des nouvelles versions.
- Ne jamais activer ni recharger une nouvelle version pendant une session active.
- Vérifier une version distante au lancement et au retour au premier plan lorsque le réseau est disponible.
- Permettre la mise à jour automatique dès que la session active est terminée et correctement persistée.

## 2. Gestionnaire de paquets et monorepo

- Utiliser `pnpm` avec workspaces.
- Verrouiller la version utilisée dans `packageManager` du `package.json` racine et committer `pnpm-lock.yaml`.
- Utiliser une structure de monorepo cohérente avec `apps/`, `packages/`, `core/` et `firmware/` décrite dans `SPEC.md`.
- Ne pas utiliser plusieurs gestionnaires de paquets dans le dépôt.

## 3. Tests

Utiliser :

- Vitest pour les tests unitaires TypeScript ;
- React Testing Library pour les composants et comportements UI ;
- Playwright pour les tests end-to-end sur Chromium et WebKit ;
- tests C++ via CTest/CMake pour le cœur analytique ;
- fixtures et replays déterministes pour les algorithmes d’analyse ;
- mocks explicites pour DeviceMotion, Geolocation, stockage et sources distantes ;
- tests réels sur iPhone pour les APIs capteurs qui ne peuvent pas être reproduites fidèlement dans Playwright.

Le CI doit au minimum exécuter : lint, format check, typecheck, tests TS, tests C++, build WASM, build PWA et tests E2E essentiels.

## 4. Cœur C++ / WebAssembly

- Utiliser CMake comme système de build du cœur portable.
- Utiliser Emscripten pour produire la version WebAssembly utilisée par la PWA.
- Garder le cœur analytique indépendant du navigateur et d’ESP-IDF.
- Fournir des bindings minces entre TypeScript et WASM.
- Garder les données d’entrée/sortie du cœur versionnées et testables par replay.

## 5. Firmware ESP32

- Utiliser ESP-IDF natif pour TrackAnalyser.
- Utiliser CMake afin de partager autant que possible le cœur C++ avec le build WebAssembly.
- Séparer les drivers matériels, l’acquisition, le stockage, le protocole de communication et l’analytics core.
- Prévoir le Waveshare ESP32-S3 et le T-Beam Supreme comme premières cibles matérielles sans coder le domaine autour de ces cartes.

## 6. Cartographie V1

- Utiliser MapLibre GL JS comme moteur de rendu cartographique.
- Concevoir un `MapProvider` interchangeable afin de ne pas lier l’application à un fournisseur unique.
- Fournir en V1 au minimum :
  - une carte standard basée sur OpenStreetMap lorsque le service sélectionné l’autorise ;
  - une carte topographique OpenTopoMap avec attribution correcte ;
  - un mécanisme permettant d’ajouter ultérieurement d’autres sources raster/vector/WMTS.
- Prévoir un adaptateur optionnel IGN / Géoplateforme sans embarquer de clé, compte ou dépendance payante obligatoire.
- Respecter systématiquement les conditions d’utilisation et attributions des sources.
- Ne jamais utiliser les serveurs publics OpenStreetMap/OpenTopoMap pour du préchargement massif hors ligne.

## 7. Cartographie hors ligne V1.1

- Préparer dès la V1 l’architecture de cartographie hors ligne.
- Utiliser PMTiles comme format privilégié pour les fonds cartographiques hors ligne.
- Permettre à MapLibre de lire directement un fichier PMTiles.
- Prévoir l’import d’un fichier PMTiles local et son stockage en OPFS.
- Prévoir ensuite le téléchargement d’une zone choisie lorsque la source et sa licence l’autorisent.
- Autoriser des PMTiles vectoriels, raster et `raster-dem` afin de permettre relief, ombrage et terrain 3D lorsque les données sont disponibles.
- Le hors-ligne cartographique est une V1.1 ; l’enregistrement, l’analyse et les traces doivent déjà fonctionner hors connexion en V1.0.

## 8. Stockage local chaud / tiède / froid

### Chaud

- Garder en mémoire uniquement un ring buffer court et le chunk en cours de constitution.
- Persister régulièrement les données pendant une session ; ne jamais attendre la fin de session.
- Éviter qu’une fermeture ou un crash fasse perdre plus de quelques secondes de données.

### Tiède

- Utiliser OPFS (`navigator.storage.getDirectory`) pour les données RAW volumineuses et les chunks binaires lorsqu’il est disponible.
- Utiliser IndexedDB pour :
  - métadonnées ;
  - participants ;
  - équipements ;
  - DeviceProfiles ;
  - index des sessions ;
  - index des chunks ;
  - résultats DERIVED et ANALYSIS ;
  - provenance et paramètres d’analyse.
- Fournir un fallback IndexedDB/Blob lorsqu’OPFS n’est pas disponible.
- Utiliser `navigator.storage.estimate()` pour afficher l’espace utilisé/disponible lorsque possible.
- Demander le stockage persistant lorsque l’API et la plateforme le permettent.

### Froid

- Utiliser `.tatrip` pour archiver/exporter une session complète.
- Utiliser `.tabackup` pour sauvegarder l’application complète.
- Ne jamais supprimer automatiquement du RAW sans action explicite de l’utilisateur.
- Permettre d’archiver puis de supprimer localement le RAW uniquement après export validé et confirmation explicite.

## 9. Format des chunks internes

- Ne pas stocker l’IMU haute fréquence sous forme d’un énorme JSON.
- Utiliser des chunks binaires versionnés et documentés pour les canaux haute fréquence.
- Conserver les timestamps et métadonnées nécessaires à une reconstruction exacte.
- Permettre une compression sans perte lorsque cela apporte un gain significatif.
- Garder JSON/NDJSON/CSV pour l’interopérabilité et les exports humains, pas comme stockage primaire de plusieurs heures d’IMU 200–400 Hz.
- Le format `.tatrip` reste un conteneur ZIP versionné comportant un manifeste JSON, les métadonnées lisibles et les données RAW/chunks.

## 10. Paramètres physiques et AnalysisProfile

- Ne pas coder en dur les seuils empiriques importants.
- Créer un `AnalysisProfile` versionné par analyseur et éventuellement par contexte.
- Conserver avec chaque résultat :
  - `analysisVersion` ;
  - `analysisProfileVersion` ;
  - paramètres utilisés ;
  - qualité des sources ;
  - provenance.
- Fournir des valeurs par défaut raisonnables pour la première V1.
- Permettre leur calibration future sans migration destructrice des RAW.
- Les seuils peuvent être recalibrés après essais terrain sans modifier le modèle de données.

## 11. Réanalyse historique

- Ne pas détruire le résultat historique original lors d’une réanalyse.
- Conserver au minimum l’analyse d’origine et l’analyse courante.
- Rendre les analyses recalculables depuis les RAW avec une version plus récente du moteur.
- Permettre d’identifier clairement la version ayant produit une valeur ou un score.

## 12. Fusion multi-source

- Continuer à raisonner par canal, jamais par source globale unique.
- Utiliser en priorité une sélection fondée sur :
  - type de capteur ;
  - qualité mesurée ;
  - précision ;
  - fréquence ;
  - couverture ;
  - synchronisation ;
  - continuité.
- Conserver en parallèle les sources originales.
- Ne pas faire de moyenne naïve entre deux mesures redondantes.
- En V1, privilégier la sélection/commutation de la meilleure source par canal et les contrôles de cohérence.
- N’introduire une fusion mathématique complexe que lorsqu’elle apporte un bénéfice démontré et que les modèles d’erreur sont connus.
- La provenance d’une métrique doit toujours rester consultable.

## 13. Garmin FIT V1.0

- Utiliser le SDK FIT officiel Garmin pour JavaScript ou une intégration directe compatible avec le profil FIT officiel courant.
- Supporter les Activity FIT et conserver le fichier FIT binaire d’origine dans RAW.
- Décoder tous les messages et champs reconnus par le SDK.
- Mapper vers les canaux normalisés les champs connus utiles à TrackAnalyser, notamment selon présence :
  - timestamp ;
  - position GNSS ;
  - altitude ;
  - distance ;
  - vitesse ;
  - fréquence cardiaque ;
  - cadence ;
  - longueur de foulée ;
  - puissance ;
  - température ;
  - vitesse verticale ;
  - métriques de course ;
  - informations de tours/laps ;
  - événements ;
  - sport et sous-sport ;
  - informations de capteur/appareil ;
  - champs de session et d’activité.
- Conserver les champs FIT reconnus mais non encore utilisés dans une représentation RAW structurée.
- Conserver les Developer Data Fields avec nom, unité, valeur et métadonnées lorsqu’ils sont décodables.
- Ne pas jeter un champ uniquement parce qu’aucun analyseur TrackAnalyser ne l’utilise encore.
- Conserver le binaire original afin de permettre une réinterprétation future avec un profil FIT plus récent.
- Lors de l’import, choisir ou confirmer le participant avant de proposer une session à enrichir.

## 14. Fichier FIT d’exemple

La spécification prévoit une validation sur un fichier FIT réel issu de la Garmin Enduro 2 afin de :

- inventorier les messages réellement présents ;
- vérifier les Running Dynamics disponibles ;
- identifier les champs spécifiques au profil Garmin utilisé ;
- vérifier les Developer Data Fields ;
- ajouter des fixtures de régression au dépôt.

Ce fichier n’est pas actuellement disponible dans la conversation au moment de cette version. Son absence ne bloque pas l’architecture ni l’implémentation générique FIT V1.0.

## 15. Apple Watch / Apple Health

### V1.0

- Ne pas intégrer HealthKit directement depuis la PWA.
- Permettre l’import des fichiers exportés par des outils Apple Watch ou tiers lorsqu’ils utilisent un format déjà supporté : GPX, TCX, FIT, CSV ou JSON documenté.
- Conserver la provenance `Apple Watch` lorsque celle-ci peut être déterminée.

### V1.1

- Ajouter si possible un importeur d’export Apple Health `export.zip` / XML.
- Rattacher les échantillons et workouts au participant explicitement choisi.
- Ne pas introduire de connexion HealthKit native tant que TrackAnalyser reste une PWA.

## 16. Unités

- Utiliser exclusivement les unités SI dans le domaine et les calculs internes.
- Utiliser par défaut un profil d’affichage métrique.
- Rendre les unités d’affichage paramétrables.
- Prévoir notamment :
  - km / miles / milles nautiques ;
  - km/h / mph / nœuds / m/s ;
  - mètres / pieds ;
  - m/s / ft/min pour vitesse verticale ;
  - °C / °F ;
  - hPa lorsque pertinent.
- Permettre à terme des préférences par catégorie de métrique ou activité.

## 17. Internationalisation

### V1.0

- Interface française.
- Ne jamais écrire directement les textes d’interface dans les composants lorsque cela empêche l’internationalisation.
- Utiliser un catalogue de traduction dès la V1, avec `react-i18next` ou équivalent maintenu.

### V1.1

- Ajouter le catalogue anglais.
- Permettre le choix de langue et la détection de la langue système.

## 18. Décisions restant volontairement empiriques

Les points suivants ne constituent pas des questions d’architecture bloquantes :

- seuil exact d’un freinage brutal ;
- seuils de jerk ;
- seuils de micro-correction de trajectoire ;
- paramètres de détection de changement de voie ;
- paramètres de détection/centrage de thermique ;
- paramètres d’agitation bateau ;
- filtres et bandes fréquentielles optimales selon activité.

Les implémenter via `AnalysisProfile` avec valeurs initiales documentées et les recalibrer après essais réels.

## 19. Consigne agentique pour Codex

Considérer `SPEC.md` et ce document comme normatifs.

Lorsqu’une décision d’implémentation est explicitement définie dans ces documents, ne pas demander confirmation et l’appliquer.

Lorsqu’un seuil physique nécessite des données terrain, utiliser une valeur par défaut documentée et configurable plutôt que bloquer l’implémentation.

Ne demander une décision que si une contradiction empêche matériellement de produire une solution conforme.
