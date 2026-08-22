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

Le coordinateur crée et persiste `Session.activeRawStreamId` avant de démarrer les sources. Il écrit ensuite chaque mesure dans un flux NDJSON progressif, conserve une fenêtre courte pour l’écran et produit des checkpoints. Les erreurs d’une source restent isolées : si DeviceMotion échoue, Geolocation continue, et inversement tant qu’une source reste active.

L’action d’arrêt signifie désormais « arrêter et sauvegarder ». Elle attend seulement la fermeture du flux, son empreinte et le rattachement de la référence RAW. La Session devient alors immédiatement consultable avec `analysisStatus: PENDING`. L’analyse est lancée séparément ; les états `PENDING` et `RUNNING` sans `AnalysisRun` sont repris automatiquement au prochain chargement. Un échec est signalé sans déclasser la Session ni son RAW.

## Écran actif et stabilité Safari

Pendant l’acquisition, `ScreenWakeLockController` demande `navigator.wakeLock.request('screen')`, expose son état et réacquiert le verrou au retour de visibilité. Il le libère après la sauvegarde. Le navigateur peut toujours lever ce verrou pour raisons système ; les chunks et checkpoints restent donc la protection autoritaire.

La vue d’enregistrement utilise une grille bornée à `100dvh`. Les cartes ont des pistes de hauteur stables et masquent la navigation générale. Le remplacement d’un état d’attente par une jauge ou une courbe ne change pas la hauteur du document et le bouton d’arrêt reste visible sans défilement.
