# DataFusionEngine

## Choix par canal

Chaque `MetricChannel` reçoit une politique indépendante. La note `AUTO` combine qualité observée, couverture, précision et fréquence. Une Garmin peut donc fournir position/altitude tandis qu’une ceinture fournit le cardio et le téléphone l’IMU.

Modes :

- `PRIORITY` : sélectionner la première source disponible de la liste explicite ;
- `AUTO` : sélectionner la meilleure note déterministe ;
- `PARALLEL` : conserver toutes les séries sans source unique ;
- `FUSION` : appliquer uniquement à la liste de canaux continus validés.

La V1 utilise une médiane pondérée robuste par qualité et précision pour les canaux autorisés. Elle refuse `FUSION` pour position, altitude et vitesse, puis choisit la meilleure source explicable. Aucune moyenne universelle ou Kalman opaque n’est appliqué.

## Provenance

Le rapport conserve sources retenues/rejetées, stratégie, motif, qualité, couverture et nombre de bascules. Les séries originales restent dans RAW et sont accessibles par leurs références.

## Synchronisation

La V1 utilise UTC et accepte des offsets explicites par source. Le rapport contient méthode, offsets, dérive et confiance. La corrélation d’événements est prévue par le type `SynchronizationReport` pour une calibration ultérieure.

