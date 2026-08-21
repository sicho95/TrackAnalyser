# Calibration de fixation

`calibrateDevice` utilise des paramètres versionnables et trois étapes :

1. détecter suffisamment d’échantillons immobiles avec vitesse faible et norme proche de la gravité ;
2. estimer biais et verticale à partir de la gravité moyenne ;
3. projeter les indices longitudinaux issus des phases GNSS synchronisées dans le plan horizontal, puis reconstruire un repère orthonormé avant/lateral/vertical.

Le snapshot conserve matrice, biais, méthode et qualité. L’algorithme refuse une calibration si l’immobilité ou les phases de déplacement sont insuffisantes. Les tolérances initiales nécessitent une calibration terrain selon fixation, appareil et activité. Les vibrations fines exigent une fixation rigide et reproductible.

La préparation smartphone ajoute un premier `CalibrationSnapshot` de zéro de fixation. Pendant les cinq secondes annulables, les moyennes longitudinale, latérale et verticale dans le repère écran sont estimées ainsi que leur dispersion. Au moins cinq mesures sont exigées ; la qualité combine couverture et stabilité et reste plafonnée à 0,75, car cette phase immobile ne détermine pas à elle seule l’axe longitudinal du véhicule. La calibration dynamique complète pourra ensuite exploiter gravité, GNSS et phases de déplacement sans modifier les axes RAW originaux.
