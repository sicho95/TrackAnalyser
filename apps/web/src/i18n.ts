import type { ActivityType, MetricChannel } from '@track-analyser/domain'

export const fr = {
  appName: 'TrackAnalyser',
  common: {
    unavailable: 'Indisponible', noData: 'Aucune donnée disponible', choose: 'Choisir', optional: 'Optionnel', samples: 'échantillons', confidence: 'confiance', coverage: 'Couverture', engine: 'Moteur', participantRequired: 'Le participant est obligatoire', offlineReady: 'Fonctions essentielles disponibles hors ligne', cancel: 'Annuler', continue: 'Continuer', delete: 'Supprimer',
  },
  activity: {
    GENERIC: 'Générique', CAR: 'Voiture', MOTORCYCLE: 'Moto', BIKE: 'Vélo', BOAT: 'Bateau', AIRCRAFT: 'Avion', PARAGLIDING: 'Parapente', HIKING: 'Randonnée', TRAIL_RUNNING: 'Trail', RUNNING: 'Course à pied',
  } satisfies Readonly<Record<ActivityType, string>>,
  metric: {
    speed: 'Vitesse', altitude: 'Altitude', verticalSpeed: 'Vario', heartRate: 'Cardio', cadence: 'Cadence', longitudinalAcceleration: 'Accélération', lateralAcceleration: 'Latéral', roll: 'Inclinaison', pitch: 'Tangage',
  } satisfies Partial<Record<MetricChannel, string>>,
  navigation: { home: 'Accueil', sessions: 'Sessions', compare: 'Comparer', profiles: 'Profils', settings: 'Réglages', aria: 'Navigation principale' },
  shell: { preparing: 'Préparation du stockage local…', loading: 'Chargement de la vue…', updateReady: 'Nouvelle version prête · Mettre à jour' },
  home: {
    eyebrow: 'Acquisition locale', title: 'Prêt à enregistrer', online: 'En ligne', offline: 'Hors ligne', kicker: 'Smartphone autonome', heroTitle: 'Chaque mouvement, avec sa source.', heroBody: 'GPS et mouvement sont enregistrés progressivement sur cet appareil. Aucun compte ni cloud n’est requis.', participant: 'Participant', required: 'Obligatoire', chooseParticipant: 'Choisir un participant', activity: 'Activité', equipment: 'Équipement', noEquipment: 'Sans équipement', participantNotice: 'Créer d’abord un participant dans Profils. Cette étape empêche toute contamination entre personnes.', authorizing: 'Autorisation des capteurs…', start: 'Démarrer la session', resume: 'Revenir à la session active', safetyTitle: 'Priorité à la sécurité', safetyBody: 'Démarrer avant de conduire ou piloter. Les détails d’analyse sont disponibles après l’arrêt.',
  },
  sessions: {
    title: 'Sessions', importAria: 'Importer un fichier', fileIdentified: 'Fichier identifié. Choisir maintenant le participant cible.', participantStep: '1. Participant obligatoire', sessionStep: '2. Session de ce participant', createSession: 'Créer une nouvelle session', isolationNotice: 'Les sessions similaires d’autres participants ne sont jamais proposées pour fusion.', importAction: 'Importer et analyser', emptyTitle: 'Aucune session', emptyDescription: 'Enregistrer avec ce smartphone ou importer un fichier Garmin, GPX, TCX ou Apple.', unknownParticipant: 'Participant inconnu', actions: 'Afficher les exports de la session', exportReady: 'Export préparé au format', deleteSession: 'Supprimer cette session', deleteTitle: 'Supprimer cette session ?', deleteFirstBody: 'Les données associées vont être sélectionnées pour suppression.', deleteFinalTitle: 'Confirmer la suppression définitive', deleteFinalBody: 'Les RAW, analyses et segments seront supprimés de cet appareil. Cette action est irréversible sans sauvegarde.', deleteForever: 'Supprimer définitivement', deleting: 'Suppression…',
  },
  record: {
    missing: 'Aucune session active. Une session interrompue peut être récupérée depuis Sessions.', waiting: 'En attente', motionUnavailable: 'Mouvement indisponible', recentSamples: 'échantillons récents', progressiveWrite: 'Écriture progressive active', finalizing: 'Finalisation et analyse…', stop: 'Arrêter et analyser', history: 'Historique', sourceDiagnostics: 'Diagnostic des sources', observed: 'mesures reçues', authorizedWaiting: 'autorisé, en attente', refused: 'indisponible',
  },
  profiles: {
    eyebrow: 'Séparation stricte des données', title: 'Profils', participants: 'Participants', participantName: 'Nom du participant', add: 'Ajouter', equipment: 'Équipements', equipmentExample: 'Nom, par ex. Vélo route', equipmentType: 'Type', addEquipment: 'Ajouter l’équipement', analysisTitle: 'Profils d’analyse versionnés', analysisBody: 'Créer une nouvelle version sans modifier les analyses ni les RAW existants.', noProfile: 'Aucun profil disponible.', sourceProfile: 'Profil source', nextVersion: 'Nouvelle version', name: 'Nom', parameters: 'Paramètres physiques', saveVersion: 'Conserver cette nouvelle version', calibratedSuffix: 'calibré',
  },
  detail: {
    missing: 'Session introuvable.', noEquipment: 'Sans équipement', sources: 'source(s)', noRoute: 'Trace cartographique indisponible.', mapAria: 'Carte du parcours', loadingMap: 'Chargement de la carte…', noAnalysis: 'Aucune analyse disponible.', events: 'Événements', noEvent: 'Aucun événement détecté avec les canaux disponibles.', history: 'Évolution des analyses', rawTitle: 'Réanalyser depuis les RAW', rawBody: 'Rejouer le pipeline complet sans modifier l’analyse originale.', profile: 'Profil versionné', running: 'Réanalyse en cours…', run: 'Lancer la réanalyse', technical: 'Données techniques et provenance', immutableRaw: 'RAW immuables', analysesKept: 'Analyses conservées',
    distribution: 'Distribution', evolution: 'Évolution', original: 'Originale', current: 'actuelle', source: 'Source', storage: 'Stockage', fingerprint: 'Empreinte', size: 'Taille', bytes: 'octets', version: 'Version', input: 'Entrée', role: 'Rôle', originalAnalysis: 'Analyse originale', reanalysis: 'Réanalyse',
    segmentsTitle: 'Segments de référence', segmentsBody: 'Conserver une portion du RAW pour la retrouver par sa trace GPS ou son contexte physique.', noSegment: 'Aucun segment conservé.', manualSegment: 'Manuel', automaticSegment: 'Détecté', segmentName: 'Nom', segmentStart: 'Début', segmentEnd: 'Fin', saveSegment: 'Conserver le segment', segmentSaving: 'Relecture du RAW…', segmentSaved: 'est disponible pour les comparaisons.',
  },
  compare: {
    eyebrow: 'Axes, unités et couvertures communs', title: 'Comparer', type: 'Type de comparaison', metric: 'Métrique', activity: 'Activité', associate: 'Associer à un ActivityGroup sans fusionner', requiredTitle: 'Deux séries comparables requises', requiredBody: 'Choisir des données ayant la même activité, la même unité et une couverture suffisante.', insufficientTitle: 'Historique insuffisant', insufficientBody: 'Deux sessions comparables du même participant sont nécessaires.', absoluteGap: 'Écart absolu', relativeGap: 'écart relatif', undefined: 'non défini',
    modes: { SESSION: 'Session contre session', PARTICIPANT: 'Participant contre participant', EQUIPMENT: 'Équipement contre équipement', GROUP: 'Même sortie commune', SEGMENT: 'Même segment reconnu', EVENT: 'Événements comparables', TEMPORAL: 'Évolution d’un participant', ANALYSIS: 'Versions d’analyse' },
    participantA: 'Participant A', participantB: 'Participant B', equipmentA: 'Équipement A', equipmentB: 'Équipement B', group: 'ActivityGroup', historySession: 'Session avec historique', participant: 'Participant', segmentA: 'Segment A', segmentB: 'Segment comparable', segmentGps: 'Trace GPS reconnue', segmentContext: 'Contexte physique compatible', segmentEmpty: 'Créer d’abord des segments dans le détail des sessions. Les participants restent strictement séparés.', eventType: 'Type d’événement', sessionA: 'Session A', sessionB: 'Session B', temporalEvolution: 'Évolution temporelle',
  },
  settings: {
    title: 'Réglages', appearance: 'Apparence', light: 'Clair', dark: 'Sombre', system: 'Système', maps: 'Cartographie', freeSource: 'Source libre', standardMap: 'OpenStreetMap standard', topoMap: 'OpenTopoMap relief', mapNotice: 'La carte dépend du réseau en V1. L’enregistrement, les analyses et la trace restent utilisables sans fond cartographique.', data: 'Données', backup: 'Sauvegarde complète', backupBody: 'Participants, équipements, appareils, groupes, sessions, segments, profils, analyses, réglages et RAW', restore: 'Restaurer .tabackup', restoreBody: 'Vérifier le format et les empreintes avant restauration', privacy: 'Local par défaut', privacyBody: 'Aucune télémétrie, aucun compte et aucun envoi automatique. Tout export est déclenché explicitement.',
  },
} as const

export type Messages = typeof fr
export const messages: Messages = fr
