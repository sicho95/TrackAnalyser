# AnalysisProfile et AnalysisRun

Tous les seuils empiriques se trouvent dans un `AnalysisProfile` versionné par activité. Aucun seuil physique n’est placé dans l’UI.

`AnalysisRun` conserve version moteur, version profil, build, commit, date, références de sorties, fingerprint d’entrée et résultat complet. Le premier run reste `isOriginal`. La session garde séparément `originalAnalysisRunId` et `latestAnalysisRunId`.

Le fingerprint déterministe inclut RAW normalisé, participant, session, profil et version moteur. Les tests garantissent :

```text
mêmes RAW + même profil + même analysisVersion = même résultat
```

Une évolution de score peut être expliquée par les méthodes des métriques et la différence entre le run original et le run courant. Les anciens résultats ne nécessitent pas de réexécuter un moteur retiré pour rester consultables.

## Calibration terrain

Les valeurs V1 sont des amorces documentées : seuil de mouvement, pause, freinage, accélération latérale, impact, vario, thermique et rotation. Elles nécessitent des acquisitions contrôlées sur plusieurs appareils, fixations, activités et conditions. Toute correction produit une nouvelle version du profil ; elle ne modifie jamais un run existant.

