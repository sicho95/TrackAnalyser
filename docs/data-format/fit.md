# Import Garmin FIT

La V1 utilise `@garmin/fitsdk`, SDK JavaScript officiel Garmin, profil 21.213.0.

Options de décodage : échelle/offset, sous-champs, composants, types, dates, fusion des messages HR, memo globs et surtout `includeUnknownData`.

Deux représentations sont conservées :

1. le binaire original en RAW avec SHA-256 ;
2. le décodage brut complet, définitions de messages, champs numériques inconnus, Developer Data Fields et contexte.

Le mapping vers TrackAnalyser est séparé et couvre position, distance, vitesse/enhanced speed, altitude/enhanced altitude, cardio, cadence, puissance, vario, température, pression et Running Dynamics disponibles.

La fixture réelle `tests/fixtures/garmin/24048447957_ACTIVITY.fit` fait 122 330 octets, contient 1 319 records et possède l’empreinte `1a6ab020cd0d168f921867465bcd4add77d6588e72703864dfeef3b9d2dc3af4`.
