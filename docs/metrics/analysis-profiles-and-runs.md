# AnalysisProfile et AnalysisRun

Tous les seuils empiriques se trouvent dans un `AnalysisProfile` versionné par activité. Aucun seuil physique n’est placé dans l’UI.

`AnalysisRun` conserve version moteur, version profil, build, commit, date, références de sorties, fingerprint d’entrée et résultat complet. Le premier run reste `isOriginal`. La session garde séparément `originalAnalysisRunId` et `latestAnalysisRunId`.

Le fingerprint déterministe inclut les SHA-256 des références RAW immuables, le participant, la session, le profil et la version moteur. Il n’exige donc pas de sérialiser en une chaîne géante toutes les mesures du pipeline. Les tests garantissent :

```text
mêmes RAW + même profil + même analysisVersion = même résultat
```

Une évolution de score peut être expliquée par les méthodes des métriques et la différence entre le run original et le run courant. Les anciens résultats ne nécessitent pas de réexécuter un moteur retiré pour rester consultables.

L’écran Profils dérive une nouvelle version sémantique sans modifier le profil source. Le détail d’une session relit ses références RAW pour une réanalyse : NDJSON smartphone en streaming, binaire importé avec son parseur d’origine, ou RAW embarqués dans un `.tatrip`. Si l’empreinte existe déjà, l’AnalysisRun existant est réutilisé au lieu d’être réécrit.

La Session conserve aussi `analysisAttemptVersion`. Un échec explicite n’est pas relancé en boucle avec le même moteur. Lorsqu’une version plus récente est installée et qu’aucun `AnalysisRun` n’existe, la Session est automatiquement remise en analyse. Le moteur 1.0.1 remplace les expansions de grands tableaux en arguments de fonction par des parcours itératifs compatibles avec les gros RAW Safari.

Le moteur 1.1.0 traite les longues Sessions par fenêtres bornées. Il combine les quantités additives, extrema, moyennes, variances et RMS selon leur sémantique à partir des résultats de fenêtres et de leurs échantillons de continuité. Les percentiles globaux sont une combinaison pondérée déterministe des percentiles locaux et sont donc signalés comme résultat d’analyse séquentielle. Les événements temporels adjacents de même type sont réunis lorsque leur continuité traverse une frontière, puis les nombres d’événements sont recalculés depuis cette chronologie réunie. Le fingerprint reste fondé sur le RAW complet, le profil et la version moteur.

Le moteur 1.2.0 et les profils initiaux 1.0.1 ajoutent `maximumContinuousGapSeconds`, fixé à 60 secondes par défaut. Une coupure plus longue crée une frontière dure : aucune distance, trajectoire, durée dynamique ni continuité d’événement ne traverse cette frontière. La carte conserve plusieurs segments et le GPX produit plusieurs `trkseg`. La couverture temporelle vaut la somme des durées réellement observées divisée par la durée écoulée de la Session ; elle est exposée dans la qualité et pondère la confiance. Le profil 1.0.0 reste conservé pour reproduire les analyses existantes.

## Calibration terrain

Les valeurs V1 sont des amorces documentées : seuil de mouvement, pause, freinage, accélération latérale, impact, vario, thermique et rotation. Elles nécessitent des acquisitions contrôlées sur plusieurs appareils, fixations, activités et conditions. Toute correction produit une nouvelle version du profil ; elle ne modifie jamais un run existant.
