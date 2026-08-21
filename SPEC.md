# TrackAnalyser — Spécification maître

**Statut :** spécification fonctionnelle, technique, matérielle et produit de référence  
**Version du document :** 1.1  
**Date :** 21 août 2026  
**Dépôt :** `sicho95/TrackAnalyser`  
**Destination SichoBrain :** `200_PROJECTS/TrackAnalyser/SPEC.md`

---

# 1. Vision

TrackAnalyser est une plateforme locale, multi-capteur, multi-source, multi-participant et multi-activité permettant :

- d’enregistrer un déplacement ou une activité ;
- de conserver les données physiques brutes ;
- de fusionner plusieurs sources de données issues d’appareils différents ;
- d’enrichir une session existante avec des données provenant d’une montre, d’une ceinture cardio, d’un fichier FIT, GPX, TCX, Apple Health ou d’un autre boîtier ;
- d’analyser le comportement d’une personne, d’un véhicule ou d’un équipement ;
- de comparer des sessions, participants, équipements, appareils et portions de parcours ;
- de reconnaître des portions ou événements comparables ;
- de suivre l’évolution statistique dans le temps ;
- de recalculer les analyses historiques lorsque les algorithmes évoluent ;
- de fonctionner avec un smartphone seul, un boîtier autonome seul ou les deux associés ;
- de rester utilisable sans connexion Internet.

TrackAnalyser ne doit pas être conçu comme un simple GPS logger ni comme une application dédiée à l’automobile.

Il doit constituer une plateforme générique d’analyse du mouvement et de comparaison objective.

---

# 2. Activités prises en charge en V1

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

Le mode `GENERIC` doit permettre d’utiliser immédiatement TrackAnalyser pour une activité non encore spécialisée, par exemple kayak, SUP, ski, roller, kart, kitesurf ou autre.

Une session initialement enregistrée en `GENERIC` doit pouvoir être réanalysée ultérieurement lorsqu’un analyseur spécifique devient disponible.

---

# 3. Principes d’architecture non négociables

## 3.1. Ne jamais dépendre d’un matériel unique

Ne jamais coder en dur :

- iPhone 15 Pro ;
- iPhone 13 ;
- Android ;
- T-Beam ;
- Waveshare ;
- Garmin ;
- Apple Watch ;
- un véhicule précis ;
- une activité précise.

Utiliser des abstractions génériques :

- `Participant`
- `ActivityGroup`
- `Session`
- `Equipment`
- `DeviceProfile`
- `SensorSource`
- `Segment`
- `Event`
- `MetricChannel`
- `ActivityAnalyzer`

L’iPhone 15 Pro utilisé au début du développement constitue uniquement le premier appareil de test.

## 3.2. Conserver les données brutes

Ne jamais conserver uniquement les scores ou les résultats calculés.

Toujours préserver autant que possible :

- GNSS ;
- IMU ;
- baromètre ;
- fréquence cardiaque ;
- cadence ;
- puissance ;
- température ;
- métriques de course ;
- métriques spécifiques provenant de FIT, GPX, TCX, Apple Health ou autres ;
- métadonnées de qualité ;
- timestamps d’origine.

Permettre de recalculer ultérieurement les résultats avec une nouvelle version des algorithmes.

## 3.3. Séparer acquisition, normalisation, fusion et analyse

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
COMPARISON / PROFILES
```

## 3.4. Local-first et offline-first

Permettre sans Internet :

- création d’une session ;
- enregistrement ;
- stockage ;
- analyse ;
- consultation ;
- comparaison locale ;
- import ;
- export ;
- backup ;
- restauration.

Ne pas imposer de compte ni de cloud.

---

# 4. Modèle multi-participant

## 4.1. Participant

Un `Participant` représente une personne dont les données physiologiques, sportives ou de pilotage sont analysées.

Exemples :

- Damien ;
- Claire ;
- autre personne.

Structure indicative :

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

Cette règle est essentielle pour éviter de mélanger les données de deux personnes ayant effectué le même trajet au même moment.

Exemple :

- Damien porte l’ESP32 et une Garmin Enduro 2 ;
- Claire effectue la même randonnée avec sa propre montre ou une Apple Watch ;
- les deux personnes parcourent exactement la même trace ;
- TrackAnalyser doit créer ou conserver deux sessions distinctes, chacune rattachée au bon participant.

## 4.3. ActivityGroup

Créer un objet `ActivityGroup` pour représenter une sortie réelle partagée par plusieurs participants.

Exemple :

```text
ActivityGroup : Randonnée du 21 août
│
├── Session Damien
│   ├── ESP32
│   └── Garmin Enduro 2
│
└── Session Claire
    └── Apple Watch
```

Structure indicative :

```ts
interface ActivityGroup {
  id: string
  activityType: ActivityType
  startTime?: string
  endTime?: string
  title?: string
  routeFingerprint?: string
  sessionIds: string[]
  metadata?: Record<string, unknown>
}
```

L’`ActivityGroup` permet ensuite de comparer directement les participants ayant partagé la même sortie.

Il ne doit jamais fusionner leurs données entre elles.

---

# 5. Règle d’import et d’enrichissement multi-participant

Lors de l’import d’une source externe destinée à enrichir une session, demander obligatoirement le participant cible avant toute fusion.

Flux obligatoire :

```text
Importer un fichier
      ↓
Identifier le format
      ↓
Choisir le participant
      ↓
Rechercher les sessions compatibles de CE participant
      ↓
Proposer la session correspondante
      ↓
Fusionner ou créer une nouvelle session
```

Ne jamais rechercher d’abord la session uniquement sur la base du trajet et de l’heure puis fusionner automatiquement.

Deux personnes peuvent parcourir exactement la même trace au même moment.

## 5.1. Suggestion de participant

Si le fichier contient une identité ou un appareil déjà associé à un participant, suggérer ce participant.

Demander néanmoins confirmation lorsque le risque d’ambiguïté existe.

## 5.2. Recherche de session cible

Une fois le participant choisi, rechercher uniquement parmi ses sessions en utilisant :

- heure de départ ;
- heure de fin ;
- durée ;
- localisation de départ ;
- localisation d’arrivée ;
- recouvrement spatial ;
- activité ;
- équipement éventuel.

Afficher un score de correspondance.

Exemple :

```text
Session probable de Damien : 99,3 %
21/08/2026 — 10:03 → 12:48
Randonnée
```

Proposer :

- `Enrichir cette session`
- `Choisir une autre session`
- `Créer une nouvelle session`

## 5.3. Sortie partagée

Si une session très similaire existe chez un autre participant :

- ne pas proposer de la fusionner ;
- proposer éventuellement de rattacher les deux sessions au même `ActivityGroup` ;
- permettre ensuite leur comparaison.

---

# 6. Equipment

Un `Equipment` représente l’engin ou l’équipement utilisé.

Exemples :

- Ford Kuga ;
- moto ;
- vélo ;
- parapente ;
- bateau ;
- avion.

Un équipement peut être absent.

Exemple : course à pied sans équipement spécifique.

Structure indicative :

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

---

# 7. DeviceProfile

Un `DeviceProfile` représente un appareil physique produisant des données.

Exemples :

- iPhone de Damien ;
- iPhone de Claire ;
- Android ;
- T-Beam Supreme ;
- Waveshare ESP32-S3 ;
- Garmin Enduro 2 ;
- Apple Watch ;
- ceinture cardio ;
- capteur de puissance vélo.

Structure indicative :

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

Ne jamais déterminer les capacités uniquement à partir du nom commercial.

---

# 8. SensorCapabilities et qualité réelle

Chaque appareil doit déclarer et mesurer ses capacités.

Exemple :

```ts
interface SensorCapabilities {
  gnss?: {
    available: boolean
    nominalFrequencyHz?: number
    observedFrequencyHz?: number
    supportsPps?: boolean
  }
  accelerometer?: {
    available: boolean
    nominalFrequencyHz?: number
    observedFrequencyHz?: number
    rangeG?: number
  }
  gyroscope?: {
    available: boolean
    nominalFrequencyHz?: number
    observedFrequencyHz?: number
  }
  barometer?: {
    available: boolean
    observedFrequencyHz?: number
  }
  heartRate?: { available: boolean }
  cadence?: { available: boolean }
  strideLength?: { available: boolean }
  power?: { available: boolean }
  temperature?: { available: boolean }
}
```

Au démarrage et pendant une session, mesurer ce qui est réellement observé :

- fréquence moyenne ;
- jitter ;
- trous d’échantillonnage ;
- qualité GNSS ;
- précision déclarée ;
- couverture ;
- dérive éventuelle.

---

# 9. Modes de fonctionnement

## 9.1. Smartphone autonome

Le smartphone assure :

- acquisition ;
- enregistrement ;
- analyse ;
- stockage ;
- affichage ;
- comparaison.

Ce mode reste une fonction complète du produit même après l’ajout des boîtiers.

## 9.2. Boîtier + smartphone

Le boîtier devient la source primaire.

Le smartphone fournit :

- configuration ;
- choix participant ;
- choix activité ;
- choix équipement ;
- supervision ;
- affichage temps réel ;
- historique ;
- analyses ;
- comparaison ;
- synchronisation ;
- import/export.

Le boîtier doit continuer à enregistrer si le smartphone :

- se verrouille ;
- perd la connexion ;
- quitte l’application ;
- s’éteint.

## 9.3. Boîtier autonome

Permettre sans téléphone :

- reprendre le dernier participant ;
- choisir un participant ;
- reprendre ou choisir une activité ;
- reprendre ou choisir un équipement ;
- démarrer ;
- arrêter ;
- enregistrer ;
- afficher l’état ;
- afficher quelques métriques ;
- afficher un bilan simplifié ;
- conserver les sessions.

## 9.4. Synchronisation différée

Associer chaque session à un UUID.

Lors de la reconnexion :

- lister les sessions inconnues ;
- récupérer les chunks manquants ;
- éviter les doublons ;
- reprendre un transfert interrompu.

---

# 10. Matériel cible

## 10.1. Smartphone

Première plateforme de test : iOS/PWA.

Support Android prévu par l’architecture.

Ne pas dépendre d’un modèle précis.

## 10.2. Waveshare ESP32-S3 existant

Utiliser comme plateforme intermédiaire :

- ESP32-S3 ;
- QMI8658 ;
- microSD ;
- Wi-Fi ;
- Bluetooth ;
- écran tactile.

Permettre :

- acquisition IMU ;
- stockage local ;
- affichage ;
- communication avec l’application.

Ajouter un GNSS externe si nécessaire.

## 10.3. T-Beam Supreme

Cible privilégiée pour un boîtier autonome complet :

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

---

# 11. Fréquences de mesure

## Smartphone

Accepter les fréquences réellement fournies.

Ne jamais supposer une cadence constante.

Utiliser les timestamps réels.

## Boîtier

Cibles :

```text
IMU mouvement : 200 Hz
IMU vibration : 200 à 400 Hz
GNSS : 10 Hz ou davantage si la qualité reste bonne
Baromètre : 10 à 25 Hz
Affichage : 5 à 10 Hz
```

Privilégier la qualité et la stabilité à une fréquence GNSS maximale artificielle.

---

# 12. Fixation et calibration

## 12.1. Règle générale

Exiger une fixation :

- solide ;
- stable ;
- sans glissement ;
- sans oscillation propre importante.

Ne pas exiger une orientation exactement reproductible.

## 12.2. Automobile

Position recommandée : proche de l’axe longitudinal central du véhicule, idéalement entre les sièges avant ou sur la console centrale.

Utiliser si besoin :

- scratch ;
- Velcro industriel ;
- collier ;
- support court et rigide.

## 12.3. Calibration automatique

À chaque montage :

1. détecter l’immobilité ;
2. estimer les biais ;
3. utiliser la gravité pour déterminer la verticale ;
4. utiliser le GNSS et les phases de déplacement pour déterminer l’axe longitudinal ;
5. reconstruire le repère de l’activité ;
6. calculer une qualité de calibration ;
7. conserver la matrice avec la session.

Repère automobile :

```text
X = avant
Y = latéral
Z = vertical
```

## 12.4. Vibrations

Indiquer que les analyses vibratoires fines nécessitent une fixation plus rigide et reproductible.

Une fixation souple peut filtrer ou amplifier certaines fréquences.

---

# 13. Architecture logicielle

```text
Sources physiques / fichiers
          │
          ▼
SensorSource / ImportSource
          │
          ▼
RAW store
          │
          ▼
Normalisation
          │
          ▼
Synchronisation temporelle
          │
          ▼
DataFusionEngine
          │
          ▼
Analytics Core
          │
          ▼
Activity Analyzer
          │
          ▼
Profiles / Segments / Comparisons
          │
          ▼
UI
```

---

# 14. Technologies V1

Application :

- React ;
- TypeScript strict ;
- Vite ;
- PWA ;
- IndexedDB derrière une couche repository ;
- Service Worker ;
- WebAssembly pour le cœur analytique portable.

Cœur analytique :

- C++ portable ;
- compilation WebAssembly pour la PWA ;
- compilation native ESP32 prévue sans réécriture du cœur.

Importeurs et orchestration : TypeScript lorsque plus approprié.

---

# 15. Conventions de commentaires et de code

Commentaires :

- en français ;
- de préférence à l’infinitif ;
- sinon style impersonnel ou troisième personne ;
- expliquer ce que fait le code ;
- expliquer comment il fonctionne ;
- expliquer pourquoi lorsqu’un choix n’est pas évident ;
- ne pas utiliser de ton conversationnel ;
- ne pas utiliser d’emoji ;
- ne pas employer de formulations évoquant une génération par IA.

Exemple :

```cpp
// Convertir l'accélération brute depuis le repère du capteur
// vers le repère calibré de l'équipement.
// Conserver la valeur en m/s² afin d'éviter les conversions implicites.
```

Ne pas ajouter de « mode IA » ou de branding IA dans l’interface.

---

# 16. UI/UX

Direction :

- moderne ;
- premium ;
- mobile-first ;
- inspirée des conventions iOS ;
- sobre ;
- lisible ;
- interactions simples ;
- détails techniques accessibles progressivement ;
- mode clair ;
- mode sombre ;
- respect du thème système.

Ne pas utiliser d’emoji comme icônes fonctionnelles.

Utiliser de vraies icônes vectorielles cohérentes.

Navigation principale proposée :

```text
Accueil
Sessions
Comparer
Profils
Réglages
```

---

# 17. Création d’une session

Flux :

```text
Nouvelle session
      ↓
Participant
      ↓
Activité
      ↓
Équipement éventuel
      ↓
Source(s)
      ↓
Qualité / calibration
      ↓
Démarrer
```

Préselectionner les derniers choix mais permettre leur modification.

---

# 18. Écran temps réel

Limiter l’information pendant une activité nécessitant de l’attention.

Afficher principalement :

- état d’enregistrement ;
- participant ;
- activité ;
- équipement ;
- durée ;
- distance ;
- une ou plusieurs métriques principales ;
- état GNSS ;
- état stockage ;
- batterie si disponible.

Ne pas imposer une consultation détaillée pendant la conduite, le pilotage ou le vol.

---

# 19. Modèle de session

Structure indicative :

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
  analysisVersion: number
  rawDataReferences: RawDataReference[]
  normalizedDataReference?: string
  fusedDataReference?: string
  derivedDataReference?: string
  analysisReference?: string
}
```

---

# 20. RAW

Conserver les données originales sans modification.

Exemple :

```text
raw/
  tbeam/
  iphone/
  garmin/
  apple-health/
  heart-rate/
```

---

# 21. NORMALIZED

Normaliser :

- unités ;
- noms de champs ;
- timestamps ;
- repères d’axes ;
- conventions de signe.

Unités internes :

```text
distance : m
temps : s
vitesse : m/s
accélération : m/s²
angles calcul : rad
altitude : m
pression : Pa
fréquence cardiaque : bpm
puissance : W
```

---

# 22. Synchronisation temporelle

Utiliser en priorité UTC.

Affiner si nécessaire en comparant des événements communs :

- départ ;
- arrêt ;
- accélération ;
- freinage ;
- virage ;
- changements d’altitude ;
- signatures communes.

Conserver le décalage estimé et le niveau de confiance.

---

# 23. DataFusionEngine

Responsabilités :

1. recevoir plusieurs sources du même participant ;
2. normaliser ;
3. synchroniser ;
4. calculer la qualité de chaque canal ;
5. sélectionner une source privilégiée par métrique ;
6. fusionner lorsque cela est pertinent ;
7. conserver les sources originales ;
8. conserver la provenance ;
9. produire un flux unifié ;
10. exposer les divergences entre sources.

---

# 24. Source de vérité par canal

Ne pas définir une source unique pour toute la session.

Exemple :

```text
Position                 T-Beam
Altitude                 T-Beam barométrique
IMU                      T-Beam
Fréquence cardiaque      ceinture cardio
Cadence course           Garmin
Longueur de foulée       Garmin
Puissance vélo           capteur puissance
```

---

# 25. Données dupliquées

Prévoir quatre stratégies :

## PRIORITY

Utiliser une source choisie explicitement.

## AUTO

Choisir la meilleure source en fonction de sa qualité.

## FUSION

Fusionner mathématiquement lorsque la méthode est justifiée.

## PARALLEL

Conserver les séries séparément pour contrôle ou comparaison.

Ne jamais moyenner naïvement plusieurs capteurs.

---

# 26. Provenance

Toute métrique importante doit pouvoir indiquer :

- source ;
- fichier ;
- appareil ;
- nombre d’échantillons ;
- couverture ;
- qualité ;
- méthode de calcul ;
- version de l’algorithme.

---

# 27. Contrôle qualité multi-capteurs

Comparer les sources lorsqu’elles mesurent la même grandeur.

Exemple :

```text
Distance ESP32 : 21,42 km
Distance Garmin : 21,71 km
Écart : 1,35 %
```

Signaler les écarts inhabituels.

---

# 28. Importeurs V1

Implémenter :

- FIT ;
- GPX ;
- TCX ;
- JSON TrackAnalyser ;
- package `.tatrip` ;
- backup `.tabackup` ;
- Apple Health export lorsque fourni sous forme de données exportables, avec prise en charge au minimum des entraînements, fréquence cardiaque, distance, durée, altitude et routes disponibles.

Pour Apple Watch, ne pas dépendre d’un accès direct HealthKit depuis la PWA.

Permettre l’import d’un export Apple Health ou d’un FIT/GPX/TCX produit par un outil compatible.

---

# 29. Assistant d’import V1

Étapes UI obligatoires :

1. sélectionner le fichier ;
2. analyser le format ;
3. afficher les types de données trouvés ;
4. choisir le participant cible ;
5. proposer les sessions correspondantes uniquement pour ce participant ;
6. choisir enrichissement ou nouvelle session ;
7. afficher les données qui seront ajoutées ;
8. choisir les priorités en cas de doublons si nécessaire ;
9. effectuer la fusion ;
10. afficher un rapport de fusion.

---

# 30. Exemple multi-participant obligatoire à couvrir par tests

Scénario :

- Damien et Claire effectuent ensemble la même randonnée ;
- Damien porte l’ESP32 ;
- Damien dispose d’une Garmin Enduro 2 ;
- Claire dispose de sa propre montre ou Apple Watch ;
- les traces et horaires sont presque identiques.

Résultat attendu :

```text
ActivityGroup : randonnée commune
│
├── Session Damien
│   ├── ESP32
│   └── Garmin Enduro 2
│
└── Session Claire
    └── Apple Watch
```

Ne jamais fusionner les données physiologiques de Claire dans la session Damien ou inversement.

Permettre ensuite :

```text
Comparer Damien / Claire
sur la même sortie
```

---

# 31. Export d’une session

Prévoir :

## Résumé JSON

Lisible humainement.

## CSV

Pour tableur, Python ou R.

## Package `.tatrip`

ZIP versionné contenant :

```text
manifest.json
session.json
summary.json
events.json
raw/
normalized/
fused/
derived/
```

---

# 32. Stockage haute fréquence

Ne pas stocker plusieurs heures d’IMU dans un énorme tableau JSON.

Utiliser :

- chunks ;
- NDJSON compressé ;
- ou format binaire ouvert et documenté si nécessaire.

Favoriser la pérennité, l’exportabilité et la possibilité de récupération sans service propriétaire.

---

# 33. Backup complet

Extension :

```text
.tabackup
```

Contenir au minimum :

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

Permettre de restaurer l’état complet sur une nouvelle installation.

---

# 34. Versionnement

Conserver :

```text
schemaVersion
appVersion
buildId
gitCommit
analysisVersion
createdAt
```

Implémenter les migrations de schéma.

---

# 35. Recalcul historique

Séparer strictement :

- mesures originales ;
- données fusionnées ;
- métriques calculées ;
- scores.

Permettre de recalculer une ancienne session avec une nouvelle `analysisVersion`.

---

# 36. CoreMetrics

Calculer lorsque les données existent :

- position ;
- distance ;
- vitesse ;
- accélération ;
- jerk ;
- vitesse verticale ;
- altitude ;
- dénivelé positif ;
- dénivelé négatif ;
- pente ;
- roulis ;
- tangage ;
- lacet ;
- taux de rotation ;
- accélération longitudinale ;
- accélération latérale ;
- accélération verticale ;
- RMS ;
- variance ;
- percentiles ;
- événements génériques.

---

# 37. Statistiques

Prévoir selon les métriques :

- moyenne ;
- médiane ;
- minimum ;
- maximum ;
- P50 ;
- P90 ;
- P95 ;
- P99 ;
- RMS ;
- variance ;
- écart-type ;
- fréquence ;
- durée ;
- valeur/km ;
- valeur/minute.

Ne pas utiliser les maxima seuls comme indicateurs principaux.

---

# 38. Segments et événements

Permettre :

- segmentation automatique ;
- segmentation manuelle ;
- reconnaissance de portions GPS ;
- comparaison d’un même segment ;
- comparaison d’événements similaires.

Exemples :

- même montée ;
- même virage ;
- même portion droite ;
- même descente ;
- même thermique ;
- même transition.

---

# 39. ComparableContext

Décrire les conditions nécessaires à une comparaison équitable.

Exemple automobile :

```text
virage
rayon 80–120 m
vitesse entrée 45–55 km/h
pente ±2 %
```

Exemple trail :

```text
montée
pente 10–15 %
longueur > 200 m
```

Exemple parapente :

```text
thermique
ascendance moyenne 1–2 m/s
```

---

# 40. Profils statistiques

Maintenir progressivement :

- `ParticipantProfile`
- `EquipmentProfile`
- `ParticipantEquipmentProfile`
- `SegmentProfile`
- `DeviceQualityProfile`
- `ActivityProfile`

---

# 41. Scores

Les scores doivent être explicables.

Un score doit toujours permettre d’afficher les métriques physiques qui l’ont produit.

Ne jamais remplacer les valeurs physiques par un score opaque.

---

# 42. GenericAnalyzer — V1 obligatoire

Analyser selon les capteurs disponibles :

- temps ;
- position ;
- distance ;
- altitude ;
- vitesse ;
- vitesse verticale ;
- accélérations ;
- rotations ;
- D+ ;
- D- ;
- pente ;
- cardio ;
- cadence ;
- puissance ;
- événements génériques.

Permettre la réanalyse ultérieure par un analyseur spécialisé.

---

# 43. CarAnalyzer — V1 obligatoire

## Vitesse

- moyenne totale ;
- moyenne roulante ;
- médiane ;
- maximum ;
- temps par plage.

## Accélération

- phases réelles ;
- durée ;
- moyenne ;
- P95 ;
- maximum ;
- jerk.

## Freinage

- nombre ;
- décélération ;
- progressivité ;
- freinages brusques ;
- freinages tardifs ;
- jerk.

## Stabilité de trajectoire

Sur portions adaptées :

- yaw RMS ;
- variance ;
- inversions gauche/droite ;
- amplitude des corrections ;
- corrections/km ;
- jerk latéral.

Ne pas prétendre mesurer la position exacte dans la voie sans système adapté.

## Virages

- vitesse entrée ;
- vitesse minimale ;
- vitesse sortie ;
- accélération latérale ;
- yaw ;
- jerk ;
- roulis ;
- freinage ;
- reprise.

## Roulis et tangage

- amplitude ;
- vitesse de prise ;
- plongée ;
- cabrage ;
- retour ;
- oscillation ;
- stabilisation.

## Scores

- fluidité ;
- stabilité ;
- freinage ;
- anticipation ;
- virages ;
- régularité ;
- dynamisme.

---

# 44. MotorcycleAnalyzer — V1 obligatoire

Métriques :

- vitesse ;
- accélération ;
- reprise ;
- freinage ;
- jerk ;
- virages ;
- angle d’inclinaison ;
- angle maximal ;
- vitesse de mise sur l’angle ;
- temps sur l’angle ;
- redressement ;
- symétrie gauche/droite ;
- accélération en sortie ;
- régularité ;
- stabilité de trajectoire.

Tenir compte de la dynamique spécifique de la moto lors de l’estimation du roulis.

---

# 45. BikeAnalyzer — V1 obligatoire

Métriques :

- distance ;
- vitesse ;
- altitude ;
- D+ ;
- D- ;
- pente ;
- vitesse ascensionnelle ;
- vitesse de descente ;
- accélération ;
- ralentissement ;
- virages ;
- inclinaison ;
- vibrations ;
- régularité.

Ajouter si disponibles :

- fréquence cardiaque ;
- cadence ;
- puissance ;
- température ;
- métriques externes.

---

# 46. HikingAnalyzer — V1 obligatoire

Métriques :

- distance ;
- temps total ;
- temps en mouvement ;
- pauses ;
- vitesse ;
- allure ;
- altitude ;
- D+ ;
- D- ;
- pente ;
- vitesse ascensionnelle ;
- vitesse de descente ;
- répartition du temps par pente ;
- régularité.

Ajouter si disponibles :

- fréquence cardiaque ;
- cadence de pas ;
- longueur de foulée ;
- température ;
- données Garmin/Apple Health.

---

# 47. TrailRunningAnalyzer — V1 obligatoire

Étendre les métriques randonnée avec :

- allure en mouvement ;
- allure ajustée par pente si la méthode est documentée ;
- cadence ;
- longueur de foulée ;
- fréquence cardiaque ;
- puissance si disponible ;
- vitesse ascensionnelle ;
- efficacité en montée ;
- efficacité en descente ;
- comparaison par segments de pente ;
- régularité ;
- pauses ;
- dynamique de course lorsque disponible dans les imports.

---

# 48. RunningAnalyzer — V1 obligatoire

Métriques :

- distance ;
- durée ;
- allure ;
- vitesse ;
- splits ;
- régularité ;
- cadence ;
- longueur de foulée ;
- fréquence cardiaque ;
- puissance si disponible ;
- D+ ;
- D- ;
- métriques de course supplémentaires si présentes dans la source.

Permettre la comparaison de deux participants sur le même parcours ou la même séance.

---

# 49. BoatAnalyzer — V1 obligatoire

Métriques :

- vitesse fond ;
- cap ;
- stabilité du cap ;
- accélérations ;
- roulis ;
- tangage ;
- lacet ;
- mouvements verticaux ;
- impacts ;
- vibrations ;
- fréquence des oscillations.

Créer des indicateurs :

- agitation rencontrée ;
- stabilité ;
- réponse du bateau ;
- confort dynamique.

Ne pas présenter l’agitation comme une hauteur de vague scientifique.

---

# 50. ParaglidingAnalyzer — V1 obligatoire

## Phases

Détecter :

- décollage ;
- transition ;
- thermique ;
- descente ;
- approche ;
- atterrissage.

## Variométrie

- vario instantané ;
- moyenne ;
- maximum ;
- minimum ;
- temps ascendant ;
- temps descendant.

## Thermiques

Calculer :

- entrée ;
- sortie ;
- altitude entrée ;
- altitude sortie ;
- gain ;
- durée ;
- ascendance moyenne ;
- ascendance maximale ;
- rayon moyen ;
- sens de rotation ;
- nombre de tours ;
- efficacité de centrage.

## Finesse

Calculer la finesse sol :

```text
distance horizontale / altitude perdue
```

Ne pas appeler cette valeur finesse aérodynamique tant que le vent n’est pas corrigé.

## Données physiologiques

Permettre de corréler les données de vol avec :

- fréquence cardiaque ;
- autres données importées.

---

# 51. AircraftAnalyzer — V1 obligatoire

Métriques :

- vitesse sol ;
- altitude ;
- montée ;
- descente ;
- roulis ;
- tangage ;
- lacet ;
- accélérations ;
- virages ;
- stabilité ;
- vibrations.

Détecter autant que possible :

- taxi ;
- décollage ;
- montée ;
- croisière ;
- virage ;
- descente ;
- approche ;
- atterrissage.

Afficher clairement que TrackAnalyser n’est pas un instrument certifié de navigation ou de pilotage.

---

# 52. Comparaison

Permettre :

- même participant, même équipement, même parcours ;
- participants différents, même équipement ;
- même participant, équipements différents ;
- participants différents sur la même sortie ;
- sessions différentes mais événements comparables ;
- même segment dans le temps.

Pour une sortie partagée, utiliser l’`ActivityGroup` afin de comparer les sessions individuelles sans mélanger leurs données.

---

# 53. UI de comparaison multi-participant

Permettre :

```text
Comparer

Sortie : Randonnée du 21 août

Participant A : Damien
Participant B : Claire

Même parcours : oui
Durée comparable : oui

[Comparer]
```

Afficher :

- valeurs ;
- écarts absolus ;
- écarts relatifs ;
- distributions ;
- couverture des capteurs ;
- qualité ;
- nombre d’événements comparables.

---

# 54. PWA V1

La V1 doit être réellement utilisable sans boîtier.

Fonctions obligatoires :

- installation PWA ;
- iOS ;
- architecture compatible Android ;
- offline ;
- création de participants ;
- création d’équipements ;
- profils d’appareils ;
- enregistrement ;
- historique ;
- comparaison ;
- import ;
- fusion ;
- export ;
- backup ;
- restauration ;
- diagnostics capteurs ;
- toutes les activités V1.

---

# 55. SensorSource

Interface indicative :

```ts
interface SensorSource {
  start(): Promise<void>
  stop(): Promise<void>
  getCapabilities(): Promise<SensorCapabilities>
  subscribe(callback: (sample: SensorSample) => void): () => void
}
```

Implémenter V1 :

- `PhoneMotionSensorSource`
- `PhoneLocationSensorSource`
- `ImportedFileSource`

Prévoir sans refonte :

- `RemoteDeviceSource`

---

# 56. Stockage PWA

Utiliser des repositories dédiés.

Exemples :

- `SessionRepository`
- `ParticipantRepository`
- `ActivityGroupRepository`
- `EquipmentRepository`
- `DeviceRepository`
- `RawChunkRepository`

Ne pas disperser directement les appels IndexedDB dans l’UI.

---

# 57. Résilience

Enregistrer par chunks.

Créer des checkpoints.

Permettre de récupérer une session interrompue lorsque possible.

Une panne de l’interface ne doit pas détruire toute la session.

Sur boîtier, écrire progressivement sur le stockage.

---

# 58. Communication futur boîtier

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

Versionner le protocole.

Messages prévus :

- `HELLO`
- `DEVICE_INFO`
- `CAPABILITIES`
- `START_SESSION`
- `STOP_SESSION`
- `LIVE_SAMPLE`
- `SESSION_LIST`
- `SESSION_DOWNLOAD`
- `SYNC_STATUS`
- `TIME_SYNC`

---

# 59. Écran boîtier

Afficher au minimum :

- participant ;
- activité ;
- équipement ;
- enregistrement ;
- durée ;
- distance ;
- métrique principale ;
- GNSS ;
- stockage ;
- batterie.

À la fin :

- résumé ;
- métriques principales ;
- comparaison simple éventuelle.

---

# 60. Pipeline GitHub

Workflow de développement :

```text
feature branch
      ↓
commits
      ↓
push
      ↓
pull request
      ↓
tests
      ↓
merge main
      ↓
build
      ↓
deploy
```

Éviter le développement direct sur `main` hors bootstrap initial d’un dépôt vide.

---

# 61. Version et build

Générer :

- `APP_VERSION`
- `BUILD_ID`
- `GIT_COMMIT`
- `SCHEMA_VERSION`
- `ANALYSIS_VERSION`

Afficher ces informations dans une page technique.

---

# 62. Hot refresh et invalidation de cache

Objectif : éviter qu’une ancienne version PWA reste utilisée après un déploiement.

Mettre en place :

- assets hashés ;
- manifeste de version distant ;
- détection d’un nouveau build ;
- mise à jour Service Worker ;
- invalidation des anciens caches ;
- activation contrôlée ;
- reload automatique lorsque sûr.

Ne jamais recharger pendant une session active.

Si une version arrive pendant l’enregistrement :

```text
Nouvelle version disponible
Mise à jour après la session
```

Après sauvegarde complète : appliquer puis recharger.

---

# 63. Qualité du code

Exiger :

- TypeScript strict ;
- C++ portable documenté ;
- modules cohérents ;
- dépendances limitées ;
- gestion explicite des erreurs ;
- logs structurés ;
- tests unitaires ;
- tests d’intégration ;
- tests de replay ;
- migrations testées ;
- pas de duplication majeure.

---

# 64. Structure de dépôt recommandée

```text
TrackAnalyser/
│
├── apps/
│   └── web/
│
├── packages/
│   ├── domain/
│   ├── storage/
│   ├── sensors/
│   ├── importers/
│   ├── exporters/
│   ├── fusion/
│   └── ui/
│
├── core/
│   └── analytics/
│       ├── cpp/
│       └── wasm/
│
├── firmware/
│   ├── common/
│   ├── tbeam/
│   └── waveshare/
│
├── tests/
│   ├── fixtures/
│   ├── replay/
│   └── integration/
│
└── docs/
    ├── architecture/
    ├── data-format/
    ├── protocol/
    └── metrics/
```

---

# 65. Documentation technique obligatoire

Créer au minimum :

```text
docs/architecture/overview.md
docs/architecture/multi-participant.md
docs/architecture/data-fusion.md

docs/data-format/session.md
docs/data-format/raw-data.md
docs/data-format/import-export.md
docs/data-format/backup.md

docs/protocol/remote-device.md

docs/metrics/core.md
docs/metrics/car.md
docs/metrics/motorcycle.md
docs/metrics/bike.md
docs/metrics/hiking.md
docs/metrics/trail-running.md
docs/metrics/running.md
docs/metrics/boat.md
docs/metrics/paragliding.md
docs/metrics/aircraft.md
```

---

# 66. Tests

## Unitaires

Tester :

- conversions ;
- statistiques ;
- filtres ;
- événements ;
- fusion ;
- provenance ;
- imports ;
- scores ;
- migrations.

## Replay

Garantir :

```text
mêmes RAW
+ même analysisVersion
= mêmes résultats
```

## Simulation

Créer des fixtures synthétiques :

- accélération ;
- freinage ;
- virage ;
- montée ;
- descente ;
- thermique ;
- vibration ;
- perte GNSS ;
- décalage d’horloge.

## Multi-participant

Tester explicitement la randonnée Damien/Claire décrite plus haut.

Vérifier qu’une correspondance spatiale et temporelle parfaite ne provoque jamais une fusion inter-participant.

---

# 67. Confidentialité

Par défaut :

- aucune télémétrie ;
- aucun upload automatique ;
- aucun compte obligatoire ;
- aucune synchronisation cloud imposée ;
- données locales.

Toute exportation doit être initiée explicitement.

---

# 68. Sécurité d’utilisation

En voiture, moto, bateau ou avion :

- limiter les interactions pendant le déplacement ;
- présenter de gros contrôles ;
- reporter les analyses complexes après l’arrêt ;
- ne pas inciter à manipuler l’écran en situation de conduite ou pilotage.

TrackAnalyser est un outil d’analyse non certifié.

Il ne remplace aucun instrument réglementaire, dispositif de sécurité, système de navigation ou instrument de vol.

---

# 69. Scope V1.0 obligatoire

La V1.0 doit livrer un produit utilisable et non une simple architecture vide.

## Application

- React + TypeScript + Vite ;
- PWA installable ;
- iOS fonctionnel ;
- architecture Android ;
- offline-first ;
- clair/sombre ;
- UI moderne iOS-like.

## Domaine

- participants ;
- ActivityGroups ;
- équipements ;
- appareils ;
- sessions ;
- segments ;
- événements.

## Acquisition

- GNSS smartphone ;
- DeviceMotion ;
- timestamps ;
- diagnostic de fréquence et qualité.

## Analyseurs réellement implémentés

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
- Apple Health export utilisable ;
- JSON TrackAnalyser ;
- `.tatrip` ;
- `.tabackup`.

## Fusion

- choix obligatoire du participant ;
- détection de session cible après choix participant ;
- ActivityGroup pour sortie partagée ;
- priorité par canal ;
- provenance ;
- rapport de fusion ;
- conservation RAW.

## Comparaison

- deux sessions ;
- deux participants ;
- même ActivityGroup ;
- deux équipements ;
- même segment ;
- événements comparables.

## Export

- résumé JSON ;
- CSV ;
- `.tatrip` ;
- `.tabackup`.

## Maintenance

- migrations ;
- analysisVersion ;
- recalcul ;
- anti-cache ;
- hot refresh sécurisé ;
- tests.

---

# 70. V1.1 matériel

Ajouter sans refonte :

- firmware Waveshare ;
- firmware T-Beam ;
- IMU 200 Hz ;
- GNSS boîtier ;
- baromètre ;
- microSD ;
- streaming Wi-Fi ;
- synchronisation différée ;
- écran autonome.

La V1.0 doit déjà contenir toutes les interfaces nécessaires à cette extension.

---

# 71. Évolutions ultérieures

Prévoir sans les imposer en V1 :

- OBD/CAN automobile ;
- seconde IMU ;
- capteurs roue/suspension ;
- capteurs nautiques ;
- capteurs vélo complémentaires ;
- météo externe ;
- vent pour finesse air réelle ;
- analyseurs kayak, SUP, ski et autres ;
- synchronisation facultative entre appareils personnels.

---

# 72. Critères d’acceptation V1

La V1 est considérée fonctionnelle si :

1. une PWA peut être installée sur iPhone ;
2. une session peut être enregistrée sans Internet ;
3. le participant est obligatoire ;
4. une activité V1 peut être choisie ;
5. un équipement peut être associé ;
6. les fréquences réelles des capteurs sont mesurées ;
7. les RAW sont conservés ;
8. les dix analyseurs V1 produisent des métriques utiles ;
9. deux sessions peuvent être comparées ;
10. deux participants d’une même sortie peuvent être comparés sans fusion de leurs données ;
11. un FIT peut enrichir une session ;
12. le participant doit être choisi avant l’enrichissement ;
13. un fichier Claire ne peut pas être fusionné automatiquement dans une session Damien même si la trace est identique ;
14. les sessions communes peuvent être liées dans un ActivityGroup ;
15. les données Garmin et ESP32 d’un même participant peuvent être fusionnées ;
16. les données Apple Watch exportées peuvent enrichir la session du participant choisi ;
17. la provenance de chaque métrique est consultable ;
18. les doublons de capteurs ne sont pas moyennés naïvement ;
19. `.tatrip` exporté peut être réimporté ;
20. `.tabackup` restaure l’application ;
21. les anciennes sessions peuvent être réanalysées ;
22. une nouvelle PWA déployée remplace réellement l’ancienne ;
23. aucune mise à jour ne recharge l’application pendant une session ;
24. aucun modèle de téléphone n’est codé comme cas métier ;
25. `RemoteDeviceSource` peut être ajouté sans refonte ;
26. le cœur analytique dispose d’une compilation WebAssembly et d’une voie native ESP32 ;
27. les tests de replay sont déterministes ;
28. les tests multi-participant empêchent toute contamination de données entre participants.

---

# 73. Priorités de conception

En cas de compromis, respecter cet ordre :

1. intégrité des données ;
2. rattachement correct au participant ;
3. fiabilité d’enregistrement ;
4. provenance ;
5. architecture durable ;
6. fusion multi-source ;
7. explicabilité ;
8. simplicité d’utilisation ;
9. performance ;
10. esthétique ;
11. fonctions accessoires.

---

# 74. Règles à ne pas enfreindre

Ne pas :

- coder l’iPhone 15 Pro comme cas spécial ;
- lier le domaine à l’automobile ;
- fusionner deux participants parce qu’ils ont le même trajet ;
- importer des données sans choisir ou confirmer leur participant cible ;
- supprimer les RAW ;
- moyenner arbitrairement plusieurs capteurs ;
- produire des scores non explicables ;
- imposer Internet ;
- imposer un cloud ;
- rendre le téléphone indispensable au futur boîtier ;
- rendre le boîtier indispensable à l’application ;
- empêcher la réanalyse ;
- recharger la PWA pendant une session ;
- utiliser des emojis dans le code ou les commentaires ;
- écrire des commentaires de style artificiel ou conversationnel ;
- disperser les conditions d’activité dans l’UI ;
- mélanger stockage, domaine, capteurs et présentation.

---

# 75. Architecture conceptuelle finale

```text
                         ActivityGroup
                       /               \
                 Session A          Session B
                 Participant A      Participant B
                    │                  │
          ┌─────────┼─────────┐        ├──────────┐
          │         │         │        │          │
       ESP32      Garmin    Phone   AppleWatch   Phone
          │         │         │        │          │
          └─────────┼─────────┘        └────┬─────┘
                    ▼                       ▼
                 RAW A                    RAW B
                    │                       │
                    ▼                       ▼
             Normalisation           Normalisation
                    │                       │
                    ▼                       ▼
               Fusion A                 Fusion B
                    │                       │
                    ▼                       ▼
              Analyse A                Analyse B
                    │                       │
                    └──────────┬────────────┘
                               ▼
                         Comparaison
```

---

# 76. Instruction de démarrage pour Codex

À partir de cette spécification :

1. créer l’architecture complète du dépôt ;
2. créer les modèles de domaine ;
3. implémenter `Participant`, `ActivityGroup`, `Session`, `Equipment` et `DeviceProfile` ;
4. implémenter les interfaces de capteurs ;
5. implémenter le stockage offline ;
6. définir les formats versionnés ;
7. implémenter le pipeline RAW → NORMALIZED → SYNCHRONIZED → FUSED → DERIVED → ANALYSIS ;
8. implémenter le `DataFusionEngine` ;
9. imposer la sélection du participant avant fusion d’un import ;
10. implémenter la logique ActivityGroup ;
11. mettre en place le cœur analytique portable ;
12. compiler le cœur vers WebAssembly ;
13. développer la PWA React/TypeScript/Vite ;
14. implémenter les dix analyseurs V1 ;
15. implémenter FIT, GPX, TCX et Apple Health export ;
16. implémenter import, export et backup ;
17. implémenter les comparaisons multi-participant ;
18. créer les diagnostics capteurs ;
19. créer les tests multi-participant et de replay ;
20. mettre en place le pipeline GitHub ;
21. mettre en place la gestion fiable de mise à jour PWA ;
22. documenter l’architecture et chaque analyseur ;
23. préparer `RemoteDeviceSource` et le protocole futur ESP32 ;
24. ne pas réduire le scope V1 aux seuls modes Generic et Car ;
25. ne pas simplifier le modèle multi-participant sous prétexte que les premières données de test proviennent d’une seule personne.

La V1 doit être construite comme une vraie base produit durable et directement extensible vers les boîtiers ESP32, sans réécriture du modèle métier ni du cœur analytique.
