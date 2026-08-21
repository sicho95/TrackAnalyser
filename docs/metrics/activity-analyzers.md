# Analyseurs V1

Les dix activités possèdent un analyseur enregistré. Chaque métrique renvoie `AVAILABLE` ou `UNAVAILABLE` avec motif, échantillonnage, confiance, méthode et provenance.

- `GENERIC` : métriques communes, rotation et pente ;
- `CAR` : vitesse, accélération/freinage, stabilité de lacet, latéral, roulis et tangage ;
- `MOTORCYCLE` : inclinaison, symétrie, freinage et charge latérale ;
- `BIKE` : pente, ascension, vibration, cardio, cadence, puissance et température ;
- `BOAT` : roulis, tangage, cap, impacts et agitation non assimilée à une hauteur de vague ;
- `AIRCRAFT` : vitesse sol, montée/descente, attitude et vibrations, sans fonction certifiée ;
- `PARAGLIDING` : vario, thermiques versionnés, gain et finesse sol non corrigée du vent ;
- `HIKING` : allure, mouvement, pauses, pente et dénivelé ;
- `TRAIL_RUNNING` : randonnée étendue avec allure mobile, ascension et Running Dynamics ;
- `RUNNING` : allure, cadence, cardio, puissance, foulée et Running Dynamics.

Les maximums sensibles aux artefacts sont accompagnés de percentiles robustes. Les scores opaques sont exclus.
