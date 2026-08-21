# Modèle multi-participant

## Invariant

Une `Session` possède exactement un `participantId`. Une sortie partagée produit une session par personne. Une ressemblance de trace, d’heure, d’activité ou d’équipement ne constitue jamais une autorisation de fusion.

Le flux d’import impose cet ordre :

1. identifier le fichier et ses canaux ;
2. choisir ou confirmer le participant ;
3. appeler `sessionsEligibleForImport(participantId, sessions)` ;
4. enrichir une session de cette liste ou en créer une ;
5. conserver le rapport de provenance.

`validateImportTarget` refuse explicitement une session d’un autre participant. Les tests utilisent deux sessions aux mêmes horaires et vérifient cette interdiction.

Dans le détail d’une Session, la cible est déjà connue : le sélecteur de fichier affiche le Participant et la Session verrouillés avant confirmation. L’enrichissement conserve le binaire original, rejoue toutes les références RAW de la Session avec le nouveau fichier, puis crée un nouvel `AnalysisRun`. Il ne cherche jamais une Session ressemblante d’un autre Participant et n’analyse pas uniquement la dernière source ajoutée.

## ActivityGroup

`ActivityGroup` représente la sortie commune. L’association ajoute son identifiant aux sessions, sans déplacer leurs RAW ni leurs analyses. La comparaison peut ensuite afficher des participants différents dans le même groupe.

## Association d’appareil

`DeviceProfile.assignedParticipantId` sert uniquement de suggestion. L’utilisateur confirme toujours le participant pendant l’import. Changer la suggestion ne réattribue pas les sessions existantes.
