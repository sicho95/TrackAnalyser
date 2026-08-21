# TrackAnalyser — Spécification maître unifiée

**Statut :** spécification fonctionnelle, technique, matérielle et produit autoritaire  
**Version du document :** 1.4
**Date :** 21 août 2026  
**Dépôt applicatif :** `sicho95/TrackAnalyser`  
**Mémoire SichoBrain :** `200_PROJECTS/TrackAnalyzer/SPEC.md`

> Ce document est la source normative unique du projet. En cas d’ambiguïté, cette version prévaut sur les échanges de conversation antérieurs. Toute évolution structurante doit être répercutée ici.

---

# 1. Vision

TrackAnalyser est une plateforme locale, multi-capteur, multi-source, multi-participant et multi-activité destinée à enregistrer, enrichir, fusionner, analyser, visualiser et comparer des déplacements et mouvements dans le temps.

Le projet doit permettre :

- d’enregistrer une activité avec un smartphone seul ;
- d’enregistrer une activité avec un boîtier ESP32 autonome ;
- d’utiliser un boîtier et un smartphone ensemble sans rendre le téléphone indispensable ;
- d’importer après coup des données issues d’une Garmin, Apple Watch, ceinture cardio, compteur vélo ou autre source ;
- de fusionner plusieurs sources appartenant au même participant ;
- de conserver plusieurs participants ayant réalisé la même sortie sans mélanger leurs données ;
- de comparer des participants, équipements, appareils, trajets, portions de parcours ou événements ;
- de conserver les données physiques brutes et la provenance de chaque métrique ;
- de recalculer les analyses lorsque les algorithmes évoluent ;
- de conserver l’historique des résultats produits par différentes versions du moteur ;
- de présenter les données sous forme de visualisations compréhensibles et adaptées à leur signification ;
- de fonctionner sans compte, sans cloud obligatoire et sans connexion Internet pour les fonctions essentielles.

TrackAnalyser n’est pas un simple GPS logger ni un analyseur automobile spécialisé. Il constitue une plateforme générique d’analyse objective du mouvement.

---

# 2. Activités V1 obligatoires

La V1 doit implémenter réellement les modes suivants :

- `GENERIC`
- `CAR`
- `MOTORCYCLE`
- `BIKE`
- `BOAT`
- `AIRCRAFT`
- `PARAGLIDING`
- `HIKING`
- `TRAIL_RUNNING`
- `RUNNING`

Le mode `GENERIC` doit permettre d’utiliser immédiatement TrackAnalyser pour une activité non encore spécialisée : kayak, SUP, ski, roller, kart, kitesurf ou autre.

Une session enregistrée en `GENERIC` doit pouvoir être réanalysée ultérieurement lorsqu’un analyseur spécialisé devient disponible.

---

# 3. Principes non négociables

## 3.1. Indépendance matérielle

Ne jamais coder en dur comme cas métier :

- iPhone 15 Pro ;
- iPhone 13 ;
- Android ;
- T-Beam ;
- Waveshare ;
- Garmin ;
- Apple Watch ;
- un véhicule précis ;
- une activité précise.

Utiliser des abstractions :

- `Participant`
- `ActivityGroup`
- `Session`
- `Equipment`
- `DeviceProfile`
- `SensorSource`
- `MetricChannel`
- `Segment`
- `Event`
- `ActivityAnalyzer`
- `AnalysisProfile`
- `AnalysisRun`
- `VisualizationSpec`

L’iPhone 15 Pro constitue seulement le premier appareil de test.

## 3.2. Local-first et offline-first

Sans Internet, permettre :

- création et configuration d’une session ;
- acquisition ;
- enregistrement ;
- stockage ;
- analyse ;
- historique ;
- comparaison des données locales ;
- import ;
- export ;
- backup ;
- restauration.

Ne pas imposer de compte, serveur ou cloud.

## 3.3. Données brutes immuables

Ne jamais remplacer les données sources par des données calculées.

Pipeline obligatoire :

```text
RAW
 ↓
NORMALIZED
 ↓
SYNCHRONIZED
 ↓
FUSED
 ↓
DERIVED
 ↓
ANALYSIS
 ↓
VISUALIZATION / COMPARISON / PROFILES
```

Les couches calculées doivent être supprimables et recalculables sans modifier `RAW`.

## 3.4. Explicabilité

Toute métrique dérivée et tout score doivent permettre de retrouver :

- les canaux sources ;
- leur qualité ;
- la méthode ;
- les paramètres ;
- la version du moteur ;
- la version du profil d’analyse.

Ne pas produire de score opaque.

---

# 4. Modèle multi-participant

## 4.1. Participant

```ts
interface Participant {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  archived: boolean
  metadata?: Record<string, unknown>
}
```

## 4.2. Une session appartient à un seul participant

Chaque `Session` doit être rattachée à exactement un participant.

Deux personnes effectuant la même trace au même moment possèdent deux sessions distinctes.

Exemple :

```text
Randonnée commune
│
├── Session Damien
│   ├── ESP32
│   ├── Garmin Enduro 2
│   └── ceinture cardio éventuelle
│
└── Session Claire
    ├── Apple Watch ou Garmin
    └── téléphone éventuel
```

Ne jamais fusionner des données physiologiques ou sportives entre participants sur la seule base d’une similarité temporelle ou géographique.

## 4.3. ActivityGroup

Créer `ActivityGroup` pour représenter une sortie réelle partagée.

```ts
interface ActivityGroup {
  id: string
  activityType: ActivityType
  title?: string
  startTime?: string
  endTime?: string
  routeFingerprint?: string
  sessionIds: string[]
  metadata?: Record<string, unknown>
}
```

L’`ActivityGroup` sert à regrouper et comparer plusieurs sessions sans les fusionner.

---

# 5. Import et enrichissement multi-participant

L’import destiné à enrichir une session doit obligatoirement déterminer le participant avant la session cible.

Flux :

```text
Sélectionner le fichier
 ↓
Identifier le format et les canaux
 ↓
Choisir ou confirmer le participant
 ↓
Rechercher uniquement les sessions de ce participant
 ↓
Proposer les correspondances
 ↓
Enrichir / choisir une autre session / créer une nouvelle session
 ↓
Afficher le rapport de fusion
```

Si l’appareil ou le fichier est déjà associé à un participant, le suggérer sans supprimer la possibilité de confirmer ou modifier.

Une session similaire appartenant à un autre participant peut être proposée pour rattachement au même `ActivityGroup`, jamais pour fusion.

Depuis le détail d’une Session, l’action « Enrichir cette session » doit accepter au minimum GPX, TCX, FIT et les formats TrackAnalyser compatibles. Dans ce contexte, le Participant et la Session cible sont verrouillés par la Session consultée et affichés avant confirmation. Le moteur doit alors rejouer l’ensemble des RAW déjà rattachés plus le nouveau fichier, fusionner par canal et produire un nouvel `AnalysisRun`. Il ne doit pas analyser uniquement le dernier fichier ni remplacer silencieusement les mesures antérieures.

---

# 6. Equipment

```ts
interface Equipment {
  id: string
  type: string
  name: string
  manufacturer?: string
  model?: string
  metadata?: Record<string, unknown>
}
```

Exemples : voiture, moto, vélo, parapente, bateau, avion. `equipmentId` reste optionnel pour marche, trail ou course à pied.

L’iconographie d’un équipement doit être déterminée par son `type` normalisé. Une voiture doit utiliser une icône automobile, une moto une icône moto, un vélo une icône vélo, etc. Une valeur historique ou localisée doit être normalisée avant le choix de l’icône ; une icône vélo générique ne doit pas servir de fallback visuel à tous les équipements.

---

# 7. DeviceProfile et SensorCapabilities

Un `DeviceProfile` représente un appareil réel produisant des données.

```ts
interface DeviceProfile {
  id: string
  displayName: string
  manufacturer?: string
  model?: string
  deviceType: string
  os?: string
  osVersion?: string
  capabilities: SensorCapabilities
  calibrationProfiles?: string[]
  assignedParticipantId?: string
  createdAt: string
  updatedAt: string
}
```

Les capacités sont déclarées puis mesurées réellement : fréquence obtenue, jitter, trous, précision, qualité GNSS, couverture et dérive éventuelle.

Canaux à prévoir au minimum :

- GNSS ;
- accéléromètre ;
- gyroscope ;
- baromètre ;
- fréquence cardiaque ;
- cadence ;
- longueur de foulée ;
- puissance ;
- température ;
- métriques spécifiques importées.

Ne jamais déduire les capacités uniquement du nom commercial.

---

# 8. Modes de fonctionnement

## 8.1. Smartphone autonome

Le smartphone assure acquisition, stockage, analyse, historique et comparaison.

Ce mode reste complet après l’arrivée des boîtiers.

## 8.2. Boîtier + smartphone

Le boîtier devient normalement la source primaire et la source de vérité de l’enregistrement.

Le smartphone sert à :

- configurer ;
- choisir participant, activité et équipement ;
- afficher les données temps réel ;
- synchroniser ;
- analyser ;
- visualiser ;
- comparer ;
- importer/exporter.

Le boîtier continue à enregistrer si le smartphone se verrouille, se déconnecte, quitte l’application ou s’éteint.

## 8.3. Boîtier autonome

Permettre :

- choix ou reprise du participant ;
- choix ou reprise de l’activité ;
- choix ou reprise de l’équipement ;
- démarrage/arrêt ;
- enregistrement progressif ;
- état GNSS, stockage et batterie ;
- métriques principales temps réel ;
- bilan simplifié ;
- stockage de sessions non synchronisées.

## 8.4. Synchronisation différée

Chaque session utilise un UUID.

Permettre reprise de transfert, déduplication, téléchargement de chunks manquants et synchronisation ultérieure.

---

# 9. Matériel cible

## 9.1. Smartphone

Première plateforme : iOS/PWA. Prévoir Android sans refonte.

## 9.2. Waveshare ESP32-S3 existant

Utilisable comme plateforme intermédiaire avec :

- ESP32-S3 ;
- QMI8658 ;
- microSD ;
- Wi-Fi ;
- Bluetooth ;
- écran tactile.

Ajouter un GNSS externe si nécessaire.

## 9.3. T-Beam Supreme

Cible privilégiée pour le boîtier complet :

- ESP32-S3 ;
- IMU ;
- GNSS u-blox MAX-M10S ou équivalent ;
- PPS ;
- baromètre ;
- microSD ;
- écran ;
- batterie ;
- Wi-Fi ;
- Bluetooth ;
- LoRa disponible mais non requis par TrackAnalyser.

## 9.4. Fréquences cibles boîtier

```text
IMU mouvement : 200 Hz
IMU vibration : 200 à 400 Hz
GNSS : 10 Hz ou plus si la qualité reste bonne
Baromètre : 10 à 25 Hz
Affichage : 5 à 10 Hz
```

Privilégier fiabilité, horodatage et qualité à une fréquence maximale artificielle.

---

# 10. Fixation et calibration

Exiger une fixation stable, sans glissement ni oscillation propre notable. L’orientation exacte ne doit pas être reproduite grâce à la calibration.

Pour l’automobile, recommander une position proche de l’axe longitudinal central, idéalement entre les sièges avant ou sur la console centrale.

Velcro industriel, scratch, colliers ou support court rigide conviennent aux analyses générales.

Calibration automatique :

1. détecter l’immobilité ;
2. estimer les biais ;
3. utiliser la gravité pour déterminer la verticale ;
4. exploiter GNSS et phases de déplacement pour déterminer l’axe longitudinal ;
5. reconstruire le repère de l’activité ;
6. produire une qualité de calibration ;
7. conserver la matrice dans la session.

## 10.1. Démarrage d’une Session sur smartphone

L’écran de démarrage reprend par défaut le Participant, l’activité et l’équipement de la dernière Session réellement lancée. L’utilisateur peut modifier ces trois choix avant chaque départ. Ces préférences sont conservées dans les réglages sauvegardables, et non déduites de la dernière Session importée.

Après l’action « Démarrer » :

1. demander les permissions sensibles, notamment `DeviceMotion`, pendant le geste utilisateur requis par iOS ;
2. afficher un compte à rebours de cinq secondes ;
3. permettre l’annulation pendant le compte à rebours sans créer de Session ni de RAW ;
4. demander de fixer le téléphone et de ne plus le déplacer ;
5. observer les mesures pendant ces cinq secondes pour estimer le zéro de fixation et sa qualité ;
6. ne pas inclure les mesures du compte à rebours dans le RAW de la Session ;
7. à l’issue du compte à rebours, conserver un `CalibrationSnapshot`, créer réellement la Session puis démarrer l’écriture progressive ;
8. si `DeviceMotion` reste indisponible, démarrer avec GNSS et les autres sources disponibles sans inventer les canaux IMU.

Le zéro immobile corrige le biais de fixation observable. L’identification complète du repère de l’activité peut continuer pendant le déplacement à partir de la gravité, du GNSS et des phases dynamiques. La qualité doit refléter cette différence et ne pas présenter une projection écran comme une calibration véhicule parfaite.

Pour les vibrations fines, signaler qu’une fixation plus rigide et reproductible est nécessaire.

---

# 11. Stack V1 figée

## 11.1. Web

- React ;
- TypeScript strict ;
- Vite ;
- PWA ;
- `pnpm` workspaces ;
- IndexedDB derrière des repositories ;
- OPFS pour les gros flux lorsque disponible ;
- Service Worker via `vite-plugin-pwa` en mode `injectManifest` ;
- WebAssembly pour le cœur analytique.

## 11.2. Cœur analytique

- C++ portable ;
- CMake ;
- Emscripten pour la compilation WebAssembly ;
- CTest pour les tests C++ ;
- voie de compilation native ESP32 sans réécriture du cœur.

## 11.3. Firmware

Utiliser ESP-IDF natif pour TrackAnalyser.

## 11.4. Tests

- Vitest pour TypeScript ;
- React Testing Library pour UI ;
- Playwright pour E2E Chromium et WebKit ;
- CTest/CMake pour C++ ;
- fixtures et replays déterministes ;
- mocks explicites des capteurs et du stockage ;
- tests réels iPhone pour les API capteurs impossibles à simuler fidèlement.

---

# 12. Hébergement et CI/CD

Hébergement V1 : **100 % GitHub Pages**.

Utiliser GitHub Actions pour CI, build et déploiement.

Déclenchements :

- `pull_request` : lint, typecheck, tests, build ;
- `push` vers `main` : CI complète puis déploiement si succès ;
- `workflow_dispatch` : lancement manuel.

Configurer Vite pour `/TrackAnalyser/`.

Utiliser un routage compatible Pages, `HashRouter` en V1 afin de ne pas dépendre de réécritures serveur.

Le déploiement ne doit jamais pouvoir interrompre une session active côté client.

---

# 13. PWA, cache et hot refresh

Objectif : éviter qu’un iPhone conserve indéfiniment une ancienne version.

Mettre en place :

- assets hashés ;
- manifeste de version distant ;
- `APP_VERSION`, `BUILD_ID`, `GIT_COMMIT`, `SCHEMA_VERSION`, `ANALYSIS_VERSION` ;
- vérification au lancement et au retour au premier plan si réseau disponible ;
- téléchargement de la nouvelle version ;
- activation contrôlée ;
- invalidation des caches obsolètes ;
- reload automatique uniquement lorsqu’aucune session active n’est en danger.

Pendant une session active, différer obligatoirement la mise à jour jusqu’à persistance complète de la session.

---

# 14. Conventions de développement

Commentaires :

- en français ;
- de préférence à l’infinitif ;
- sinon style impersonnel ou troisième personne ;
- expliquer ce que fait le code, comment et pourquoi si nécessaire ;
- ne pas utiliser de ton conversationnel ;
- ne pas utiliser d’emoji ;
- ne pas laisser de marqueurs évoquant une génération IA.

Exemple :

```cpp
// Convertir l'accélération brute depuis le repère du capteur
// vers le repère calibré de l'équipement.
// Conserver les unités en m/s² afin d'éviter les conversions implicites.
```

Ne pas créer de mode « IA » ni de branding IA dans le produit.

---

# 15. Modèle de session

```ts
interface Session {
  id: string
  participantId: string
  activityGroupId?: string
  activityType: ActivityType
  equipmentId?: string
  sourceIds: string[]
  startTime: string
  endTime?: string
  calibration?: CalibrationSnapshot
  schemaVersion: number
  rawDataReferences: RawDataReference[]
  normalizedDataReference?: string
  fusedDataReference?: string
  analysisRunIds: string[]
  originalAnalysisRunId?: string
  latestAnalysisRunId?: string
}
```

---

# 16. Historique et versionnement des analyses

Une réanalyse ne doit jamais écraser silencieusement un résultat antérieur.

Créer :

```ts
interface AnalysisRun {
  id: string
  sessionId: string
  analysisVersion: string
  analysisProfileVersion: string
  engineBuildId: string
  gitCommit?: string
  createdAt: string
  isOriginal: boolean
  metricsReference: string
  eventsReference: string
  scoresReference?: string
  qualityReference?: string
}
```

Règles :

- conserver immuablement le premier résultat produit pour une session ;
- conserver le résultat le plus récent ;
- conserver l’historique des `AnalysisRun` ;
- ne jamais altérer les RAW lors d’une réanalyse ;
- permettre de comparer « analyse originale » et « analyse actuelle » ;
- expliquer les changements de scores ou métriques entre versions ;
- permettre, lorsque l’ancienne version du moteur reste disponible, de régénérer une analyse historique à partir du RAW ;
- à défaut de conserver tous les anciens moteurs embarqués, conserver suffisamment de sorties et métadonnées pour restituer les résultats historiques sans ambiguïté.

L’UI doit pouvoir afficher la version utilisée et signaler qu’une nouvelle analyse est disponible.

---

# 17. AnalysisProfile et seuils

Les seuils physiques empiriques ne doivent pas être dispersés en constantes codées en dur.

Créer des `AnalysisProfile` versionnés par activité.

Exemples de paramètres :

- seuil accélération réelle ;
- seuil freinage brutal ;
- fenêtres de filtrage ;
- seuil de correction latérale ;
- détection thermique ;
- seuils de qualité GNSS ;
- fenêtres d’agrégation ;
- critères de segmentation.

Chaque `AnalysisRun` conserve la version du profil utilisée afin de garantir la reproductibilité.

---

# 18. Stockage chaud / tiède / froid

## 18.1. Chaud

Mémoire vive : buffers courts nécessaires à l’acquisition, aux calculs temps réel et à l’affichage.

## 18.2. Tiède

- OPFS pour les gros flux RAW/chunks lorsque disponible ;
- IndexedDB pour métadonnées, index, participants, équipements, appareils, sessions, événements, analyses et références de chunks ;
- fallback IndexedDB si OPFS indisponible.

Ne pas stocker des heures d’IMU haute fréquence dans un gigantesque objet JSON.

## 18.3. Froid

Exports versionnés :

- `.tatrip` pour une session ;
- `.tabackup` pour sauvegarde complète.

Conserver des formats documentés, inspectables et récupérables sans service propriétaire.

---

# 19. Normalisation

Unités internes SI :

```text
distance : m
temps : s
vitesse : m/s
accélération : m/s²
angles : rad en calcul interne
altitude : m
pression : Pa
fréquence cardiaque : bpm
puissance : W
```

L’UI convertit selon les préférences.

Par défaut : système métrique.

Pour les activités terrestres en système métrique, afficher notamment la vitesse en `km/h` dans les vues principales, tout en conservant `m/s` dans le pipeline interne et la vue technique de provenance lorsque pertinent.

Prévoir configuration d’unités pour autres pays et activités : km/h, mph, nœuds, ft, ft/min, °C/°F, etc.

---

# 20. DataFusionEngine

Responsabilités :

1. recevoir plusieurs sources du même participant ;
2. normaliser ;
3. synchroniser les horloges ;
4. calculer la qualité de chaque canal ;
5. sélectionner la meilleure source par canal ;
6. basculer de source lorsque la qualité le justifie ;
7. conserver les séries originales ;
8. conserver la provenance ;
9. exposer les divergences ;
10. produire un flux unifié.

## 20.1. Stratégie de fusion

La stratégie de référence est **priorité/qualité par canal**.

Modes possibles :

- `PRIORITY` : source explicitement prioritaire ;
- `AUTO` : choisir la meilleure source selon qualité ;
- `FUSION` : fusion mathématique uniquement lorsqu’elle est justifiée et validée ;
- `PARALLEL` : conserver plusieurs séries en parallèle.

Ne jamais moyenner naïvement plusieurs altitudes, vitesses ou positions.

Une fusion Kalman universelle n’est pas un objectif de V1 et ne doit pas être imposée si elle réduit l’explicabilité ou la fiabilité.

---

# 21. Synchronisation temporelle

Utiliser UTC en priorité.

Affiner si nécessaire avec des événements communs : départ, arrêt, accélération, virage, variations d’altitude ou signatures communes.

Conserver :

- offset estimé ;
- méthode ;
- confiance ;
- dérive éventuelle.

---

# 22. Provenance et qualité

Toute métrique importante doit exposer :

- source/appareil ;
- fichier éventuel ;
- canal ;
- nombre d’échantillons ;
- couverture ;
- qualité ;
- méthode ;
- version du moteur ;
- version du profil d’analyse.

La qualité de session doit inclure au minimum : GNSS, IMU, horloge, calibration, couverture, fusion et confiance.

---

# 23. Import V1

Formats obligatoires :

- FIT ;
- GPX ;
- TCX ;
- JSON TrackAnalyser ;
- `.tatrip` ;
- `.tabackup` ;
- exports Apple Health/Apple Watch exploitables sous forme de fichiers, sans accès HealthKit direct depuis la PWA.

V1.1 peut enrichir l’import Apple Health ZIP/XML si nécessaire.

---

# 24. FIT Garmin — exigences V1

Utiliser le SDK/profil FIT officiel Garmin comme référence de décodage.

Règles :

- conserver le fichier FIT binaire original dans RAW ou dans une référence d’import persistante ;
- décoder toutes les données définies par le profil FIT pris en charge ;
- conserver les Developer Data Fields ;
- conserver les messages et champs inconnus ou privés de façon opaque lorsque leur décodage métier n’est pas disponible ;
- ne jamais jeter une donnée uniquement parce que TrackAnalyser ne sait pas encore l’exploiter ;
- stocker numéro de message global, numéro de champ, type brut, valeur brute et contexte nécessaires à une réinterprétation future ;
- mettre à jour le profil FIT sans invalider les anciens imports ;
- séparer le décodage brut du mapping vers les `MetricChannel` TrackAnalyser.

## 24.1. Fixture réelle fournie

Le fichier utilisateur `24048447957_ACTIVITY.fit` doit être utilisé comme fixture réelle de course à pied lorsqu’il est présent dans le dépôt de tests.

Constats sur ce fichier :

- taille approximative : 122 ko ;
- activité nommée « Course à pied » ;
- 1 319 messages `record` ;
- présence de position GNSS ;
- fréquence cardiaque ;
- cadence ;
- distance ;
- puissance de course ;
- vitesse et altitude enrichies ;
- métriques de dynamique de course telles que oscillation verticale, temps de contact au sol, ratio vertical, équilibre du temps de contact et longueur de pas lorsque les champs sont interprétables par le profil ;
- présence de nombreux messages Garmin additionnels, dont certains privés/non documentés dans le profil public.

Ce fichier impose un test de non-régression : l’import doit conserver l’intégralité du contenu même lorsque certaines données ne sont pas encore exposées dans l’UI.

---

# 25. Export

## 25.1. Résumé JSON

Lisible humainement, adapté à l’archivage et à des traitements externes.

## 25.2. CSV

Pour tableur, Python ou R.

## 25.3. `.tatrip`

ZIP versionné contenant par exemple :

```text
manifest.json
session.json
summary.json
events.json
analysis/
raw/
normalized/
fused/
derived/
```

Les gros flux peuvent être binaires/chunkés ; NDJSON reste possible lorsqu’il apporte lisibilité et streaming.

## 25.4. `.tabackup`

Contenir :

```text
manifest.json
settings.json
participants.json
equipment.json
devices.json
calibrations.json
activity-groups.json
sessions/
profiles/
statistics/
```

Permettre restauration complète sur une nouvelle installation.

---

# 26. Cartographie

Utiliser **MapLibre GL JS** avec fournisseurs de cartes interchangeables.

V1 :

- carte standard libre basée sur OSM ou source compatible ;
- source topo de type OpenTopoMap lorsque ses conditions techniques le permettent ;
- architecture permettant d’ajouter une source IGN/Géoplateforme ou autre sans coupler le domaine à un fournisseur ;
- possibilité de basculer entre styles/sources lorsque disponible ;
- relief/topographie lorsque la source fournit les données nécessaires.

V1.1 :

- mode cartographique hors ligne ;
- privilégier PMTiles pour packs locaux vectoriels/raster ;
- prévoir support terrain/DEM lorsque disponible ;
- gestion du stockage des cartes séparée du stockage des sessions.

L’absence de cartes hors ligne V1.0 ne doit jamais empêcher l’enregistrement et l’analyse offline.

Dans le récapitulatif d’une Session, la carte doit pouvoir passer en plein écran puis revenir au récapitulatif sans perdre son état. Le sélecteur de fond standard/topographique doit être accessible directement sur la carte réduite et sur la carte plein écran. Le choix est persisté dans les réglages. La trace et les analyses restent consultables lorsque le fond réseau ne charge pas.

---

# 27. UI/UX générale

Direction :

- moderne ;
- premium ;
- mobile-first ;
- inspirée des conventions iOS ;
- sobre ;
- lisible ;
- interactions simples ;
- mode clair/sombre/système ;
- vraie iconographie vectorielle ;
- aucune interface ressemblant à un écran de télémétrie brut par défaut.

Navigation principale proposée :

```text
Accueil
Sessions
Comparer
Profils
Réglages
```

UI V1 en français.

Toutes les chaînes doivent être externalisées dès la V1 afin d’ajouter l’anglais en V1.1 sans refonte.

## 27.1. Liste et suppression des Sessions

Sur mobile, chaque bulle de Session suit une interaction de glissement de type iOS :

- glissement de gauche vers la droite : révéler les exports JSON, CSV et `.tatrip` ;
- glissement de droite vers la gauche : révéler la suppression ;
- ne pas ajouter un menu « … » redondant lorsque toutes ses actions sont déjà accessibles par glissement et dans le détail ;
- présenter les rails d’action comme la continuité arrondie de la bulle, sans boutons carrés détachés ;
- conserver une translucidité premium de la façade, mais suffisamment opaque et floutée pour ne pas laisser lire les boutons masqués sous la Session.

La suppression doit aussi être accessible au bas du détail d’une Session. Toute suppression est explicite et exige deux confirmations successives indiquant que les RAW, analyses et segments locaux seront supprimés. Aucun nettoyage automatique ne doit supprimer ces données.

---

# 28. Visualisation analytique — exigence V1

Sur iPhone, les valeurs brutes ne doivent jamais constituer la seule représentation principale d’une métrique.

Chaque métrique doit disposer d’une représentation visuelle cohérente avec sa nature.

Créer un registre `VisualizationSpec` indépendant des écrans :

```ts
interface VisualizationSpec {
  metricId: string
  semanticType: string
  preferredLiveView: VisualizationType
  preferredSessionView: VisualizationType
  preferredComparisonView: VisualizationType
  unitPolicy: string
  scalePolicy: ScalePolicy
  referenceZones?: ReferenceZone[]
}
```

## 28.1. Types de visualisations

Prévoir au minimum :

- cartes de synthèse avec valeur, unité, tendance et sparkline ;
- jauges circulaires ou semi-circulaires pour valeurs bornées ou instantanées ;
- jauges divergentes pour valeurs signées autour de zéro ;
- courbes temporelles ;
- profils distance/temps ;
- histogrammes et distributions ;
- barres comparatives et dumbbell charts ;
- nuages de points pour corrélations ;
- cartes de parcours colorées par métrique ;
- profil d’altitude synchronisé avec la carte ;
- heatmaps lorsque pertinentes ;
- graphiques de segments/événements ;
- éventuel radar uniquement pour quelques scores synthétiques, jamais pour masquer les valeurs physiques.

## 28.2. Règles d’échelle

Les échelles doivent être cohérentes, lisibles et non trompeuses.

- utiliser la même échelle lorsqu’on compare deux séries équivalentes ;
- afficher zéro lorsque sa présence est sémantiquement nécessaire ;
- utiliser des échelles divergentes centrées sur zéro pour roulis, tangage, accélération latérale ou vario signé lorsqu’approprié ;
- utiliser des plages physiques ou de référence documentées pour les jauges ;
- permettre une échelle dynamique avec marge lorsque cela améliore la lecture sans fausser la comparaison ;
- afficher unités, min/max et zones de référence ;
- ne pas utiliser uniquement la couleur pour transmettre une information ;
- conserver une palette accessible et cohérente entre écrans.

## 28.3. Temps réel

Le pipeline de calcul conserve sa fréquence native ; l’UI est rafraîchie à une cadence raisonnable, typiquement 5 à 10 Hz, afin de rester fluide et économe.

Exemples :

- vitesse : valeur principale + mini-courbe récente ;
- accélération longitudinale : jauge signée + historique court ;
- accélération latérale : jauge signée ;
- moto : inclinaison gauche/droite avec jauge centrée ;
- parapente : vario signé + altitude + trace ;
- course : allure + FC + cadence sous forme de cartes/courbes ;
- bateau : roulis/tangage en jauges signées avec agitation récente.

Pendant conduite/pilotage, limiter le nombre d’éléments et maximiser la lisibilité.

## 28.4. Analyse d’une session

Présenter une synthèse visuelle avant les détails techniques :

- carte ;
- chronologie ;
- altitude ;
- vitesse/allure ;
- métriques spécifiques activité ;
- événements ;
- distributions ;
- scores explicables ;
- qualité/provenance accessible par détail.

Les tableaux de données brutes doivent être réservés à une vue technique avancée.

Dans le récapitulatif principal, ne rendre que les métriques dont le statut est `AVAILABLE`. Ne pas remplir l’expérience principale de blocs « Indisponible ». Lorsqu’un enrichissement apporte un nouveau canal, les blocs correspondants apparaissent après réanalyse. Les motifs d’indisponibilité, canaux absents et diagnostics restent accessibles dans la vue technique.

## 28.5. Comparaison

Utiliser des graphiques permettant une comparaison immédiate :

- axes et unités communs ;
- courbes superposées ou juxtaposées ;
- différences absolues et relatives ;
- distributions ;
- intervalles/percentiles ;
- nombre d’événements comparables ;
- couverture et confiance ;
- synchronisation par temps, distance, segment ou événement.

---

# 29. CoreMetrics

Calculer lorsque les données existent :

- position ;
- distance ;
- vitesse ;
- accélération ;
- jerk ;
- vitesse verticale ;
- altitude ;
- D+ ;
- D- ;
- pente ;
- roulis ;
- tangage ;
- lacet ;
- taux de rotation ;
- accélérations longitudinale, latérale et verticale ;
- RMS ;
- variance ;
- percentiles ;
- événements génériques.

Statistiques possibles : moyenne, médiane, min, max, P50, P90, P95, P99, RMS, variance, écart-type, fréquence, durée, valeur/km, valeur/minute.

Ne pas utiliser le maximum seul comme métrique principale lorsqu’il peut être dominé par un artefact.

---

# 30. Segments, événements et ComparableContext

Les `Segment` de parcours V1 sont détectés automatiquement ; l’utilisateur ne définit pas manuellement leur début et leur fin.

Un tronçon comparable est une portion de trace GPS observée au moins deux fois, dans une même Session ou plusieurs Sessions, avec un coefficient minimal de similarité par défaut de 90 %. Le seuil, la distance minimale, la tolérance GPS, l’espacement de rééchantillonnage et le nombre minimal d’occurrences appartiennent à un profil versionné et calibrable, jamais à des constantes UI.

La reconnaissance doit :

- rééchantillonner spatialement les traces pour réduire la dépendance aux cadences GNSS ;
- comparer des points correspondants avec une tolérance métrique adaptée à la qualité GPS ;
- exiger la même direction de parcours et refuser une trace inversée, même si sa géométrie est identique ;
- regrouper les occurrences qui se recouvrent afin d’éviter une multitude de fenêtres quasi identiques ;
- conserver pour chaque occurrence la Session, les bornes temporelles, la signature de route, la version de l’algorithme et la qualité de correspondance ;
- ne jamais fusionner les Sessions ni les Participants qui partagent un tronçon.

Exemples : même montée dans le même sens, même virage abordé dans le même sens, même descente ou même portion de boucle. Les événements analytiques comme un freinage ou un thermique restent des `Event` et ne doivent pas être transformés automatiquement en segments GPS.

`ComparableContext` décrit les conditions d’une comparaison équitable : type, pente, rayon, vitesse, durée, altitude, qualité, etc.

---

# 31. Profils statistiques

Maintenir progressivement :

- `ParticipantProfile` ;
- `EquipmentProfile` ;
- `ParticipantEquipmentProfile` ;
- `SegmentProfile` ;
- `DeviceQualityProfile` ;
- `ActivityProfile`.

Les profils agrègent plusieurs sessions sans supprimer les sessions originales.

---

# 32. GenericAnalyzer — V1

Analyser selon les capteurs disponibles : temps, position, distance, altitude, vitesse, vitesse verticale, accélérations, rotations, D+/D-, pente, cardio, cadence, puissance et événements génériques.

---

# 33. CarAnalyzer — V1

## Vitesse

Moyenne totale, moyenne roulante, médiane, maximum, temps par plage.

## Accélération

Détecter les phases réelles et calculer durée, moyenne, P95, maximum et jerk.

## Freinage

Nombre, décélération, progressivité, freinages brusques/tardifs et jerk.

## Stabilité de trajectoire

Sur portions adaptées : yaw RMS, variance, inversions gauche/droite, amplitude des corrections, corrections/km, jerk latéral.

Ne pas prétendre mesurer la position exacte dans la voie sans système adapté.

## Virages

Vitesse entrée/minimum/sortie, accélération latérale, yaw, jerk, roulis, freinage et reprise.

## Roulis/tangage

Amplitude, vitesse de prise, plongée, cabrage, retour, oscillations et stabilisation.

Scores séparés : fluidité, stabilité, freinage, anticipation, virages, régularité, dynamisme.

---

# 34. MotorcycleAnalyzer — V1

Vitesse, accélération, reprise, freinage, jerk, virages, angle d’inclinaison, angle maximal, vitesse de mise sur l’angle, temps sur l’angle, redressement, symétrie gauche/droite, accélération en sortie, régularité et stabilité.

Tenir compte de la dynamique propre à la moto lors de l’estimation du roulis.

---

# 35. BikeAnalyzer — V1

Distance, vitesse, altitude, D+/D-, pente, vitesse ascensionnelle/descente, accélération, ralentissement, virages, inclinaison, vibrations, régularité.

Ajouter cardio, cadence, puissance, température et métriques externes si disponibles.

---

# 36. HikingAnalyzer — V1

Distance, temps total, temps en mouvement, pauses, vitesse, allure, altitude, D+/D-, pente, vitesse ascensionnelle/descente, temps par pente, régularité.

Ajouter cardio, cadence de pas, longueur de foulée, température et données importées.

---

# 37. TrailRunningAnalyzer — V1

Étendre Hiking avec allure en mouvement, cadence, longueur de foulée, FC, puissance si disponible, vitesse ascensionnelle, efficacité montée/descente, segments de pente, régularité, pauses et Running Dynamics.

Toute allure ajustée à la pente doit utiliser une méthode documentée et versionnée.

---

# 38. RunningAnalyzer — V1

Distance, durée, allure, vitesse, splits, régularité, cadence, longueur de foulée, fréquence cardiaque, puissance, D+/D- et métriques de course disponibles.

Permettre comparaison entre participants sur même séance ou parcours.

---

# 39. BoatAnalyzer — V1

Vitesse fond, cap, stabilité du cap, accélérations, roulis, tangage, lacet, mouvements verticaux, impacts, vibrations, fréquence des oscillations.

Indicateurs : agitation rencontrée, stabilité, réponse du bateau, confort dynamique.

Ne pas présenter l’agitation comme hauteur de vague scientifique sans capteur adapté.

---

# 40. ParaglidingAnalyzer — V1

Détecter : décollage, transition, thermique, descente, approche, atterrissage.

Variométrie : instantané, moyenne, min/max, temps ascendant/descendant.

Thermiques : entrée/sortie, altitudes, gain, durée, ascendance moyenne/max, rayon, sens, nombre de tours, efficacité de centrage.

Finesse sol : distance horizontale / altitude perdue.

Ne pas qualifier la finesse d’aérodynamique tant que le vent n’est pas corrigé.

Permettre corrélation avec données physiologiques importées.

---

# 41. AircraftAnalyzer — V1

Vitesse sol, altitude, montée/descente, roulis, tangage, lacet, accélérations, virages, stabilité, vibrations.

Détecter autant que possible taxi, décollage, montée, croisière, virage, descente, approche et atterrissage.

TrackAnalyser n’est pas un instrument certifié et ne doit pas être utilisé comme source de navigation ou de pilotage.

---

# 42. Comparaison

Permettre :

- même participant, même équipement, même parcours ;
- participants différents, même équipement ;
- même participant, équipements différents ;
- participants différents dans le même `ActivityGroup` ;
- sessions différentes avec événements comparables ;
- même segment dans le temps ;
- même session analysée avec deux versions de moteur.

Afficher valeurs, écarts absolus/relatifs, distributions, couverture, qualité et nombre d’événements comparables.

---

# 43. SensorSource

```ts
interface SensorSource {
  start(): Promise<void>
  stop(): Promise<void>
  getCapabilities(): Promise<SensorCapabilities>
  subscribe(callback: (sample: SensorSample) => void): () => void
}
```

V1 :

- `PhoneMotionSensorSource`
- `PhoneLocationSensorSource`
- `ImportedFileSource`

Sur iOS, la demande de permission `DeviceMotionEvent.requestPermission()` doit être déclenchée depuis l’action explicite de démarrage. La source doit rester indépendante du modèle commercial du téléphone, publier ses axes bruts originaux séparément des projections calculées et conserver la méthode/qualité du zéro de fixation.

Prévoir sans refonte : `RemoteDeviceSource`.

---

# 44. Communication futur boîtier

Ne pas dépendre de Web Bluetooth sur iOS.

Prévoir :

```text
ESP32
  │
Wi-Fi
  │
WebSocket / HTTP
  │
PWA
```

Protocole versionné avec au minimum : `HELLO`, `DEVICE_INFO`, `CAPABILITIES`, `START_SESSION`, `STOP_SESSION`, `LIVE_SAMPLE`, `SESSION_LIST`, `SESSION_DOWNLOAD`, `SYNC_STATUS`, `TIME_SYNC`.

---

# 45. Écran boîtier

Afficher au minimum participant, activité, équipement, état d’enregistrement, durée, distance, métrique principale, GNSS, stockage et batterie.

Après arrêt : résumé et métriques principales, éventuellement comparaison simple avec profil/dernière session.

---

# 46. Résilience

Écrire progressivement.

Utiliser chunks et checkpoints.

Une panne UI ne doit pas détruire une session complète.

Prévoir récupération de session interrompue et reprise de synchronisation.

---

# 47. Confidentialité

Par défaut :

- aucune télémétrie ;
- aucun upload automatique ;
- aucun compte obligatoire ;
- aucune synchronisation cloud imposée ;
- données locales.

Toute exportation ou partage doit être explicite.

---

# 48. Sécurité d’utilisation

En voiture, moto, bateau, parapente ou avion : limiter les interactions, utiliser de gros contrôles et reporter les analyses complexes après l’arrêt.

TrackAnalyser est un outil d’analyse non certifié et ne remplace aucun dispositif réglementaire, de sécurité ou de navigation.

---

# 49. Structure de dépôt cible

```text
TrackAnalyser/
├── apps/
│   └── web/
├── packages/
│   ├── domain/
│   ├── storage/
│   ├── sensors/
│   ├── importers/
│   ├── exporters/
│   ├── fusion/
│   ├── visualization/
│   └── ui/
├── core/
│   └── analytics/
│       ├── cpp/
│       └── wasm/
├── firmware/
│   ├── common/
│   ├── tbeam/
│   └── waveshare/
├── tests/
│   ├── fixtures/
│   │   └── garmin/
│   ├── replay/
│   └── integration/
└── docs/
    ├── architecture/
    ├── data-format/
    ├── protocol/
    ├── metrics/
    └── visualization/
```

---

# 50. Documentation obligatoire

Créer et maintenir au minimum :

- architecture générale ;
- multi-participant ;
- fusion ;
- stockage ;
- formats de session/export/backup ;
- protocole boîtier ;
- profils d’analyse ;
- historique de versions d’analyse ;
- chaque analyseur d’activité ;
- règles de visualisation ;
- cartographie ;
- import FIT.

La documentation technique doit rester cohérente avec `SPEC.md`.

---

# 51. Tests obligatoires

## Unitaires

Conversions, statistiques, filtres, événements, fusion, provenance, imports, scores, migrations, profils d’analyse et visualisation specs.

## Replay

Garantir :

```text
mêmes RAW
+ même analysisVersion
+ même analysisProfileVersion
= mêmes résultats
```

## Simulation

Accélération, freinage, virage, montée, descente, thermique, vibration, perte GNSS, décalage d’horloge.

## Multi-participant

Tester explicitement deux participants sur la même sortie et interdire toute contamination croisée.

## Garmin

Utiliser la fixture FIT réelle fournie pour vérifier : décodage, preservation du RAW, métriques reconnues, champs inconnus conservés et enrichissement du bon participant.

## Visualisation

Tester les échelles de comparaison, unités, absence de données, grandes valeurs, valeurs négatives et changement de système d’unités.

---

# 52. Scope V1.0 obligatoire

La V1.0 doit être un produit réellement utilisable.

## Application

- React/TypeScript/Vite ;
- PWA installable iOS ;
- architecture Android ;
- offline-first ;
- GitHub Pages ;
- clair/sombre/système ;
- français avec i18n prêt ;
- visualisations analytiques complètes.

## Domaine

- participants ;
- ActivityGroups ;
- équipements ;
- appareils ;
- sessions ;
- segments ;
- événements ;
- AnalysisProfiles ;
- AnalysisRuns.

## Acquisition

- GNSS smartphone ;
- DeviceMotion ;
- timestamps réels ;
- diagnostic fréquence/qualité.

## Analyseurs

- Generic ;
- Car ;
- Motorcycle ;
- Bike ;
- Boat ;
- Aircraft ;
- Paragliding ;
- Hiking ;
- TrailRunning ;
- Running.

## Import

- FIT ;
- GPX ;
- TCX ;
- fichiers Apple Health/Watch exploitables ;
- JSON TrackAnalyser ;
- `.tatrip` ;
- `.tabackup`.

## Fusion

- choix obligatoire du participant ;
- recherche de session après participant ;
- priorité/qualité par canal ;
- provenance ;
- rapport de fusion ;
- conservation RAW.

## Comparaison

- sessions ;
- participants ;
- équipements ;
- ActivityGroups ;
- segments ;
- événements comparables ;
- versions d’analyse.

## Export/backup

- JSON ;
- CSV ;
- `.tatrip` ;
- `.tabackup`.

## CI/CD

- pnpm ;
- GitHub Actions ;
- CI PR/main ;
- déploiement Pages ;
- hot refresh sécurisé ;
- tests automatisés.

---

# 53. V1.1 prévue sans refonte

- firmware Waveshare ;
- firmware T-Beam ;
- IMU 200 Hz ;
- GNSS boîtier ;
- baromètre ;
- microSD ;
- streaming Wi-Fi ;
- synchronisation différée ;
- écran autonome ;
- cartographie PMTiles hors ligne avec topo/relief lorsque disponible ;
- anglais ;
- import Apple Health ZIP/XML amélioré.

---

# 54. Évolutions ultérieures

Prévoir :

- OBD/CAN ;
- seconde IMU ;
- capteurs roue/suspension ;
- capteurs nautiques ;
- météo/vent ;
- finesse air corrigée du vent ;
- analyseurs kayak, SUP, ski, etc. ;
- capteurs spécialisés ;
- synchronisation facultative entre appareils personnels.

---

# 55. Critères d’acceptation V1

La V1 est acceptable si notamment :

1. la PWA s’installe sur iPhone ;
2. une session s’enregistre sans Internet ;
3. le participant est obligatoire ;
4. les dix activités sont réellement analysées ;
5. les RAW sont conservés ;
6. les fréquences/qualités capteurs sont mesurées ;
7. un FIT enrichit la bonne session du bon participant ;
8. une trace identique d’un autre participant n’est jamais fusionnée ;
9. les données Garmin et ESP32 d’un même participant peuvent coexister et être fusionnées par canal ;
10. les champs FIT inconnus restent conservés ;
11. la provenance est consultable ;
12. deux sessions/participants/équipements peuvent être comparés ;
13. les visualisations utilisent des unités et échelles cohérentes ;
14. l’iPhone ne présente pas seulement des nombres bruts pour les vues principales ;
15. les données brutes restent accessibles dans une vue technique ;
16. `.tatrip` est réimportable ;
17. `.tabackup` restaure l’application ;
18. une réanalyse ne détruit pas l’analyse originale ;
19. l’original et la dernière analyse sont consultables ;
20. la différence entre deux versions d’analyse peut être expliquée ;
21. mêmes RAW + mêmes versions donnent les mêmes résultats ;
22. une nouvelle PWA remplace l’ancienne sans interrompre une session ;
23. aucun téléphone précis n’est codé comme cas métier ;
24. `RemoteDeviceSource` peut être ajouté sans refonte ;
25. le cœur analytique se compile en WASM et dispose d’une voie ESP-IDF/C++ native ;
26. GitHub Actions valide puis déploie GitHub Pages ;
27. les tests multi-participant empêchent toute contamination ;
28. la fixture Garmin réelle passe les tests d’import et de conservation ;
29. le démarrage reprend les derniers choix et laisse cinq secondes annulables avant la création du RAW ;
30. le zéro de fixation est conservé avec sa qualité et les mesures préparatoires ne contaminent pas le RAW ;
31. la carte de récapitulatif passe en plein écran et change de fond dans les deux modes ;
32. l’enrichissement GPX/TCX/FIT est accessible depuis la Session et rejoue tous ses RAW ;
33. les métriques indisponibles sont absentes du récapitulatif principal mais explicables techniquement ;
34. les segments GPS sont détectés automatiquement à partir d’au moins deux occurrences comparables ;
35. une même trace parcourue en sens inverse n’est pas déclarée comparable ;
36. les exports et la suppression sont accessibles par glissement, et la suppression exige deux confirmations.

---

# 56. Priorités de conception

En cas de compromis :

1. intégrité des données ;
2. rattachement au bon participant ;
3. fiabilité de l’enregistrement ;
4. provenance et reproductibilité ;
5. architecture durable ;
6. qualité de fusion ;
7. explicabilité ;
8. visualisation fidèle ;
9. simplicité d’utilisation ;
10. performance ;
11. esthétique ;
12. fonctions accessoires.

---

# 57. Interdictions

Ne pas :

- coder un modèle de téléphone comme cas métier ;
- lier le domaine à l’automobile ;
- fusionner deux participants parce que leurs traces se ressemblent ;
- importer sans participant cible ;
- supprimer automatiquement ou silencieusement les RAW ; une suppression locale explicitement demandée et doublement confirmée par l’utilisateur reste autorisée ;
- écraser une analyse historique ;
- moyenner arbitrairement des capteurs ;
- produire des scores opaques ;
- afficher uniquement des données numériques brutes dans l’UI principale ;
- utiliser des échelles visuelles trompeuses ;
- imposer Internet ou cloud ;
- rendre téléphone ou boîtier mutuellement indispensables ;
- recharger la PWA pendant une session active ;
- utiliser des emojis dans le code ou les commentaires ;
- ajouter des marqueurs de génération IA ;
- disperser les règles d’activité dans l’UI ;
- mélanger stockage, domaine, capteurs, analyse et présentation.

---

# 58. Instruction de démarrage Codex

Codex doit lire **intégralement ce fichier comme source autoritaire unique** avant toute modification.

Objectif : implémenter la V1 de bout en bout sans demander confirmation sur les décisions déjà tranchées.

Ordre recommandé :

1. créer le monorepo pnpm ;
2. configurer GitHub Actions et GitHub Pages ;
3. créer le domaine ;
4. implémenter repositories et stockage chaud/tiède/froid ;
5. définir les formats versionnés ;
6. implémenter capteurs smartphone ;
7. implémenter pipeline RAW → NORMALIZED → SYNCHRONIZED → FUSED → DERIVED → ANALYSIS ;
8. implémenter DataFusionEngine ;
9. implémenter multi-participant et ActivityGroup ;
10. implémenter AnalysisProfile/AnalysisRun ;
11. mettre en place le cœur C++/CMake/WASM ;
12. implémenter les dix analyseurs V1 ;
13. implémenter les importeurs FIT/GPX/TCX/Apple ;
14. implémenter exports et backup ;
15. implémenter MapLibre ;
16. implémenter le registre VisualizationSpec et les graphiques adaptés ;
17. implémenter comparaison ;
18. intégrer les tests et replays ;
19. intégrer la fixture Garmin réelle si disponible ;
20. documenter chaque sous-système ;
21. préparer `RemoteDeviceSource`, protocole Wi-Fi et firmware ESP-IDF sans devoir les finaliser en V1.0 ;
22. terminer avec CI verte et déploiement GitHub Pages fonctionnel.

Lorsque des seuils physiques nécessitent une calibration terrain, utiliser des valeurs initiales raisonnables dans un `AnalysisProfile` versionné, les documenter et ne pas bloquer le développement.

Ne pas réduire le scope V1 sous prétexte que les premières données viennent d’un seul téléphone ou d’un seul participant.
