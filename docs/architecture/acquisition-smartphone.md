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

Le coordinateur crée et persiste `Session.activeRawStreamId` avant de démarrer les sources. Il écrit ensuite les mesures dans le flux RAW binaire compact V2, conserve une fenêtre courte pour l’écran et produit des checkpoints. Les anciennes Sessions NDJSON restent relisibles. Les erreurs d’une source restent isolées : si DeviceMotion échoue, Geolocation continue, et inversement tant qu’une source reste active.

L’action d’arrêt signifie désormais « arrêter et sauvegarder ». Elle attend seulement la fermeture du flux, son empreinte et le rattachement de la référence RAW. La Session devient alors immédiatement consultable avec `analysisStatus: PENDING`. L’analyse est lancée séparément ; les états `PENDING` et `RUNNING` sans `AnalysisRun` sont repris automatiquement au prochain chargement. Un échec est signalé sans déclasser la Session ni son RAW.

## Écran actif et stabilité Safari

`ScreenWakeLockController` appartient au cycle de l’acquisition. Il démarre dès le geste « Démarrer », en parallèle de la permission DeviceMotion, reste actif pendant le compte à rebours et la Session, puis s’arrête après la sauvegarde ou l’annulation. Il réacquiert le verrou natif après une libération, un retour de visibilité, un `pageshow` ou un retour de focus.

Les PWA iOS installées activent aussi le repli média local de `nosleep.js`, même lorsque `navigator.wakeLock` est exposé. Ce double chemin contourne les régressions WebKit du mode Home Screen ; le diagnostic distingue « écran maintenu actif » du mode de compatibilité. Le média est local, silencieux et arrêté avec la Session.

Éteindre ou verrouiller volontairement l’écran n’est pas un mode supporté pour l’acquisition smartphone V1 : iOS peut suspendre la page, DeviceMotion et Geolocation. Si le verrou natif et le repli échouent, l’écran d’acquisition affiche donc « ne pas verrouiller l’iPhone ». Les chunks et checkpoints restent la protection autoritaire contre une suspension malgré tout.

Une reprise après suspension ne transforme pas la période sans mesure en trajet observé. L’analyse sépare les portions de trace de part et d’autre du trou, exclut cet intervalle des distances et durées dynamiques, calcule une couverture temporelle sur la durée réelle de la Session et diminue la confiance des métriques en conséquence. Le récapitulatif affiche un avertissement lorsque cette couverture est inférieure à 95 %. La durée écoulée de la Session reste conservée comme donnée temporelle, sans prétendre que les capteurs ont couvert toute cette durée.

La vue d’enregistrement utilise une grille bornée à `100dvh`. Les cartes ont des pistes de hauteur stables et masquent la navigation générale. Le remplacement d’un état d’attente par une jauge ou une courbe ne change pas la hauteur du document et le bouton d’arrêt reste visible sans défilement.
