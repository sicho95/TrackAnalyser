# Segments et contextes comparables

Un `Segment` appartient toujours à une seule `Session`. Il ne porte pas de participant autonome : l’identité du participant reste celle de la session, ce qui interdit toute fusion implicite de deux personnes ayant suivi la même trace.

## Création automatique

La V1 ne demande pas à l’utilisateur de placer des bornes. `detectRecurringRouteSegments` reçoit les aperçus de route des dernières analyses, rééchantillonne chaque trace à espacement métrique régulier et recherche les fenêtres observées au moins deux fois. Les occurrences peuvent appartenir à deux Sessions ou à deux passages non superposés de la même Session.

Le profil initial exige une longueur de 180 m, une similarité de 90 %, une distance point à point maximale de 35 m, des extrémités à moins de 50 m et un écart de direction inférieur à 45 degrés. Ces valeurs forment `AutomaticRouteSegmentProfile` version 1.0.0 et nécessitent une calibration terrain sur plusieurs qualités GNSS.

Deux fenêtres doivent progresser dans le même sens. Une montée et sa descente sur la même géométrie sont donc refusées. Les fenêtres qui se recouvrent sont regroupées afin de produire un tronçon utile plutôt qu’une succession de doublons. Les événements analytiques restent des `Event` et ne sont pas convertis en segments GPS.

## Reconnaissance

Une signature est décimée à 24 points au maximum après rééchantillonnage. Son empreinte déterministe regroupe les occurrences détectées. Pour deux enregistrements indépendants, l’algorithme mesure la proportion de positions homologues dans la tolérance de Haversine et contrôle le cap début-fin. En l’absence de trace suffisante, les événements restent comparables séparément par leur `ComparableContext` : type, pente, rayon, vitesse et qualité.

Les seuils de comparaison sont regroupés dans `SegmentComparisonProfile` version 1.0.0. Il reprend le seuil de similarité de 90 %, la tolérance point à point et le contrôle de direction, avec les critères de contexte existants. Une nouvelle calibration doit produire une nouvelle version de profil ; elle ne modifie ni les RAW ni les analyses historiques.

## Comparaison

L’écran propose un segment de référence puis uniquement les segments reconnus comme comparables. Chaque série est ramenée à sa progression relative avant d’utiliser une unité et un axe partagés. Le nombre d’échantillons, la couverture et la confiance restent affichés. La similarité GPS ne rattache jamais une session à un autre participant et ne crée jamais d’`ActivityGroup`.
