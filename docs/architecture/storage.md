# Stockage chaud, tiède et froid

## Chaud

L’acquisition ne garde qu’une fenêtre récente pour l’affichage et un tampon de checkpoint. Le flux complet est sérialisé progressivement en NDJSON ; plusieurs heures d’IMU ne forment pas un objet JSON unique.

## Tiède

`ProgressiveRawStore` écrit dans OPFS lorsque `navigator.storage.getDirectory` est disponible. Le fallback stocke des chunks IndexedDB indexés par `streamId`. Chaque référence contient la taille, le nombre de chunks et le SHA-256 du flux complet.

Les objets métier sont accessibles uniquement par `LocalRepositories`. La base courante est versionnée. Les migrations créent les stores progressivement et marquent comme interrompues les anciennes sessions incomplètes sans toucher à leurs références RAW.

Une écriture sous une clé RAW existante avec un contenu différent est refusée. Les checkpoints enregistrent l’identifiant de session active. Au prochain lancement, une session encore `RECORDING` devient `INTERRUPTED` et peut être retrouvée.

## Froid

- `.tatrip` transporte une session, ses AnalysisRuns, des aperçus normalisés et tous ses fichiers RAW ;
- `.tabackup` transporte réglages, participants, équipements, appareils, calibrations, ActivityGroups, sessions, profils, analyses et RAW.

La restauration vérifie les empreintes RAW avant d’inscrire le snapshot métier.
