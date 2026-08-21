# Fixture Garmin FIT

Ce dossier contient des fichiers FIT réels utilisés uniquement comme fixtures de non-régression pour l'import Garmin de TrackAnalyser.

- `24048447957_ACTIVITY.fit` : activité réelle fournie pour valider le décodage, la conservation du RAW, les champs inconnus/privés et l'enrichissement d'une session participant.

Ne pas modifier le fichier binaire de fixture. Les tests doivent conserver les champs non reconnus et ne jamais supposer que le profil FIT public décrit l'intégralité du contenu.
