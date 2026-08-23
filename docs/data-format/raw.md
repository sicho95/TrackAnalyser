# Format RAW

Les RAW sont immuables et conservent la donnée reçue avant normalisation.

## Acquisition smartphone V2

Le média est `application/vnd.track-analyser.raw;version=2`. Le flux commence par la signature `TARAW`, la version et un séparateur de contrôle. Il contient ensuite deux types d’enregistrements préfixés par leur taille :

- définition : canal, unité, source, couche et provenance statique ;
- frame : timestamp UTC commun, identifiants de définition, valeurs, qualité, précision et séquence optionnelles.

Les valeurs numériques physiques utilisent `Float64`. Position, chaînes, booléens et vecteurs possèdent un encodage explicite. Les propriétés optionnelles sont indiquées par flags. La reconstruction restitue un `SensorSample` complet sans réduire la fréquence ni supprimer les axes originaux.

Les frames sont écrites progressivement. Le regroupement vise 256 Kio, avec un flush de récupération au plus tard toutes les cinq secondes. La définition de format active est persistée dans la Session avec l’identité du flux afin qu’une interruption Safari rattache la bonne référence.

## Compatibilité V1

Le média historique `application/x-ndjson` reste décodé en streaming. Une ancienne Session n’est jamais convertie ou remplacée silencieusement ; son SHA-256 et ses octets restent inchangés.

## Longues Sessions

À 50 frames DeviceMotion/s et onze canaux, le test projette dix heures sous 512 Mio. L’analyse consomme le flux par fenêtres bornées à cinq minutes ou 75 000 mesures avec continuité par source/canal. Le RAW n’est pas décimé. Les fenêtres ne sont qu’une représentation de calcul temporaire.

## Imports

Le fichier binaire ou XML original est conservé octet pour octet. FIT utilise `application/vnd.ant.fit`. Les champs décodés ne remplacent jamais ce fichier.

## Référence

`RawDataReference` contient stockage, chemin, taille, SHA-256, nombre de chunks, version de format, nom importé et source. Le hash porte sur le flux complet et reste stable quel que soit le découpage des chunks.
