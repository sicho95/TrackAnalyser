# Format RAW

Les RAW sont immuables et conservent la donnée reçue avant normalisation.

## Acquisition smartphone

Le média est `application/x-ndjson`. Chaque ligne contient un `SensorSample` avec timestamp réel en millisecondes UTC, canal, valeur, unité, source, qualité, couche et provenance. L’écriture est progressive.

## Imports

Le fichier binaire ou XML original est conservé octet pour octet. FIT utilise `application/vnd.ant.fit`. Les champs décodés ne remplacent jamais ce fichier.

## Référence

`RawDataReference` contient stockage, chemin, taille, SHA-256, nombre de chunks, nom importé et source. Le hash porte sur le flux complet et reste stable quel que soit le découpage des chunks.
