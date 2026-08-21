# Acquisition smartphone

`PhoneMotionSensorSource` et `PhoneLocationSensorSource` décrivent les capacités réellement observées. Aucun modèle de téléphone n’est codé en dur.

## Autorisation iOS

Sur iOS, `DeviceMotionEvent.requestPermission()` doit être invoqué pendant le geste utilisateur. L’écran de démarrage appelle donc cette méthode avant le premier accès asynchrone à IndexedDB. Le résultat est mémorisé par la source : le coordinateur peut ensuite démarrer le flux sans provoquer une seconde demande hors du geste. Un refus n’empêche pas le GPS de fonctionner ; le diagnostic expose séparément l’état GPS et mouvement.

Le Participant, l’activité et l’équipement du dernier enregistrement sont conservés dans `AppSettings.lastSessionDefaults`. Après autorisation, une préparation annulable de cinq secondes démarre `PhoneMotionSensorSource` sans créer de Session. À l’échéance seulement, l’orchestrateur conserve la calibration, crée la Session puis branche le coordinateur et l’écriture RAW. Une annulation arrête la source et ne laisse ni Session brouillon ni flux vide.

## Repères et provenance

Les axes `custom:acceleration-x/y/z` conservent la mesure linéaire originale de DeviceMotion. Lorsque le navigateur ne fournit que l’accélération avec gravité, un filtre passe-haut retire une estimation lente de la gravité avant publication.

Les canaux longitudinal, latéral et vertical sont projetés dans le repère de l’écran en tenant compte de son orientation. Ils sont marqués `original: false`. Avant l’enregistrement, `beginMountingZero` accumule les axes projetés et `completeMountingZero` en soustrait la moyenne. Les échantillons préparatoires ne sont jamais émis vers le coordinateur et ne contaminent donc pas les RAW. La provenance distingue explicitement `repère écran non calibré` de `repère écran avec zéro de fixation`.

Une calibration équipement doit déterminer matrice, biais et qualité pour transformer ce repère écran vers le repère voiture, moto ou bateau. Sa précision dépend de la fixation réelle du smartphone et nécessite des essais terrain. Les RAW d’axes restent disponibles pour recalculer une future version.

## Résilience

Le coordinateur écrit chaque mesure dans un flux NDJSON progressif, conserve une fenêtre courte pour l’écran et produit des checkpoints. Les erreurs d’une source restent isolées : si DeviceMotion échoue, Geolocation continue, et inversement tant qu’une source reste active.
