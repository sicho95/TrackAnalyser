# Stockage chaud, tiède et froid

## Chaud

L’acquisition ne garde qu’une fenêtre récente pour l’affichage et un tampon de checkpoint. Le flux complet V2 est sérialisé progressivement en frames binaires ; plusieurs heures d’IMU ne forment pas un objet JSON unique. Le NDJSON est réservé à la compatibilité des RAW V1.

Le RAW V2 mutualise les métadonnées dans des définitions et regroupe les mesures simultanées en frames binaires. Les nombres physiques restent en `Float64`. Le replay accepte aussi le NDJSON V1, filtre les canaux et fusionne plusieurs références triées avec un seul curseur par source.

Le pipeline n’utilise jamais les formes `push(...tableau)` ou `Math.max(...tableau)` sur une collection non bornée : Safari limite le nombre d’arguments bien avant la taille possible d’une Session. L’empreinte d’analyse repose sur les SHA-256 RAW. Une analyse longue lit des fenêtres de cinq minutes ou 75 000 mesures au maximum, conserve un échantillon de continuité par source/canal et libère chaque pipeline intermédiaire avant la fenêtre suivante. Les résultats partiels sont combinés par la sémantique de leurs métriques.

À l’écriture, les enregistrements sont regroupés dans des chunks cibles de 256 Kio au lieu de créer un chunk IndexedDB par mesure. Un flush maximal de cinq secondes borne la perte possible lors d’une suspension brutale. Le miroir est supprimé par lots bornés après validation. L’accueil compare le quota restant à deux copies du RAW dix heures projeté plus 128 Mio de marge.

## Tiède

`ProgressiveRawStore` écrit dans OPFS lorsque `navigator.storage.getDirectory` est disponible. Le fallback stocke des chunks IndexedDB indexés par `streamId`. Chaque référence contient la taille, le nombre de chunks et le SHA-256 du flux complet.

Pendant une acquisition OPFS, chaque chunk reste également miré dans IndexedDB jusqu’à ce que la référence finale soit rattachée à la Session. `activeRawStreamId` est inscrit avant la première mesure. Si le processus disparaît, `recoverReference` contrôle l’ordre et le SHA-256 de chaque chunk, reconstruit l’empreinte globale et rattache une référence `INDEXED_DB` à la Session. Le miroir OPFS n’est nettoyé en tâche différée qu’après le commit métier et une relecture réussie par l’analyse ; une suspension intermédiaire laisse donc le fallback intact.

Les objets métier sont accessibles uniquement par `LocalRepositories`. Le schéma IndexedDB 4 ajoute un store `segments`, indexé par session et empreinte de route. Les migrations créent les stores progressivement et marquent comme interrompues les anciennes sessions incomplètes sans toucher à leurs références RAW.

Une écriture sous une clé RAW existante avec un contenu différent est refusée. Les checkpoints enregistrent l’identifiant de Session active et celui de son flux. Au prochain lancement, une Session encore `RECORDING` avec des chunks valides devient `COMPLETED`, reçoit sa référence RAW et passe en analyse `PENDING`. Sans chunk récupérable, elle devient `INTERRUPTED`. Dans les deux cas, `AppSettings.activeSessionId` est effacé pour éviter un verrou fantôme.

La suppression explicite d’une session efface son fichier OPFS ou ses chunks IndexedDB, puis supprime atomiquement la session, ses AnalysisRuns et ses segments. Les ActivityGroups sont mis à jour sans toucher aux sessions des autres participants. L’interface exige deux confirmations ; une sauvegarde préalable reste le seul moyen de restauration.

## Froid

- `.tatrip` transporte une session, ses segments, ses AnalysisRuns, des aperçus normalisés et tous ses fichiers RAW ;
- `.tabackup` transporte réglages, participants, équipements, appareils, calibrations, ActivityGroups, sessions, segments, profils, analyses et RAW.

La restauration vérifie les empreintes RAW avant d’inscrire le snapshot métier.
