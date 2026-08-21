# Segments et contextes comparables

Un `Segment` appartient toujours à une seule `Session`. Il ne porte pas de participant autonome : l’identité du participant reste celle de la session, ce qui interdit toute fusion implicite de deux personnes ayant suivi la même trace.

## Création

- manuelle : relire le RAW immuable, convertir la fenêtre relative choisie en timestamps réels et conserver la portion sans altérer les échantillons ;
- automatique : transformer les événements durables produits par l’analyseur, par exemple une phase de vol ou un thermique, en segments identifiés par le run et l’événement.

Les événements ponctuels restent des événements et ne sont pas artificiellement étendus en segments.

## Reconnaissance

Une trace GPS est arrondie puis décimée à 24 points au maximum. Son empreinte déterministe permet l’égalité exacte. Pour deux enregistrements indépendants, l’algorithme compare jusqu’à 16 positions homologues avec la distance de Haversine moyenne. En l’absence de trace suffisante, il compare le `ComparableContext` : type, pente, rayon, vitesse et qualité.

Les seuils sont regroupés dans `SegmentComparisonProfile` version 1.0.0. Les valeurs initiales — 60 m de distance moyenne, qualité 0,35, 300 m d’écart d’altitude et écarts relatifs configurés — sont des amorces explicites à calibrer sur le terrain. Une nouvelle calibration doit produire une nouvelle version du profil ; elle ne modifie ni les segments ni les RAW.

## Comparaison

L’écran propose un segment de référence puis uniquement les segments reconnus comme comparables. Chaque série est ramenée à sa progression relative avant d’utiliser une unité et un axe partagés. Le nombre d’échantillons, la couverture et la confiance restent affichés. La similarité GPS ne rattache jamais une session à un autre participant et ne crée jamais d’`ActivityGroup`.
