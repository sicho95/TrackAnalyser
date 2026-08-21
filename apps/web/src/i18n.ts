const fr = {
  appName: 'TrackAnalyser',
  unavailable: 'Indisponible',
  noData: 'Aucune donnée disponible',
  participantRequired: 'Le participant est obligatoire',
  offlineReady: 'Fonctions essentielles disponibles hors ligne',
} as const

export type TranslationKey = keyof typeof fr

export function t(key: TranslationKey): string {
  return fr[key]
}
