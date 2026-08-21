# Segments et contextes comparables

Un `Segment` appartient toujours à une seule `Session`. Il ne porte pas de participant autonome : l’identité du participant reste celle de la session, ce qui interdit toute fusion implicite de deux personnes ayant suivi la même trace.

## Création automatique

La V1 ne demande pas à l’utilisateur de placer des bornes. `detectRecurringRouteSegments` reçoit les aperçus de route des dernières analyses, rééchantillonne chaque trace à espacement métrique régulier et recherche les fenêtres observées au moins deux fois. Les occurrences peuvent appartenir à deux Sessions ou à deux passages non superposés de la même Session.

Le profil initial `AutomaticRouteSegmentProfile` 1.1.0 rééchantillonne tous les 10 m. Les deux réglages utilisateur sont normalisés avant chaque détection : similarité de 80 % à 99 %, à 90 % par défaut, et longueur minimale de 100 m à 5 km, à 100 m par défaut. La longueur minimale amorce la reconnaissance mais ne la borne pas : un tronçon de 20 km reste un seul tronçon si sa géométrie correspond jusqu’au bout.

Chaque nouvelle paire de points prolonge le candidat uniquement si la proportion de positions homologues dans la fenêtre glissante reste supérieure ou égale au seuil. La première fenêtre sous le seuil clôt le tronçon à la dernière position acceptée. La distance point à point maximale de 35 m, les extrémités initiales à moins de 50 m et l’écart de direction inférieur à 45 degrés servent à absorber le bruit et à aligner les occurrences ; aucune de ces distances ne constitue une longueur de segment.

Deux fenêtres doivent progresser dans le même sens. Une montée et sa descente sur la même géométrie sont donc refusées. Les fenêtres qui se recouvrent sont regroupées afin de produire un tronçon utile plutôt qu’une succession de doublons. Les événements analytiques restent des `Event` et ne sont pas convertis en segments GPS.

## Reconnaissance

Une signature est décimée à 24 points au maximum après rééchantillonnage. Son empreinte déterministe regroupe les occurrences détectées. Pour deux enregistrements indépendants, l’algorithme mesure la proportion de positions homologues dans la tolérance de Haversine et contrôle le cap début-fin. En l’absence de trace suffisante, les événements restent comparables séparément par leur `ComparableContext` : type, pente, rayon, vitesse et qualité.

Les seuils de comparaison sont regroupés dans `SegmentComparisonProfile` version 1.0.0. Le profil de détection effectif, notamment son seuil et sa longueur minimale, participe à l’empreinte déterministe et est copié dans les métadonnées de chaque occurrence. Une modification des réglages recalcule les segments automatiques depuis les aperçus issus des analyses sans modifier les RAW, les analyses ni les segments manuels.

Le réglage 90 % constitue le compromis V1 recommandé. Descendre vers 80 % accepte davantage de dérive mais augmente les faux positifs ; monter au-dessus de 95 % peut scinder une même route à cause du bruit GNSS. Ces paramètres nécessitent encore une calibration terrain sur plusieurs téléphones, environnements et qualités de réception.

## Comparaison

L’écran propose un segment de référence puis uniquement les segments reconnus comme comparables. Chaque série est ramenée à sa progression relative avant d’utiliser une unité et un axe partagés. Le nombre d’échantillons, la couverture et la confiance restent affichés. La similarité GPS ne rattache jamais une session à un autre participant et ne crée jamais d’`ActivityGroup`.
