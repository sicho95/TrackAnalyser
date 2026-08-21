import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class MockDeviceMotionEvent extends Event {
      static requestPermission() {
        ;(window as unknown as { motionPermissionRequested: boolean }).motionPermissionRequested = true
        return Promise.resolve('granted' as const)
      }
      acceleration = { x: 0.5, y: 0.2, z: 0.1 }
      accelerationIncludingGravity = this.acceleration
      rotationRate = { alpha: 1, beta: 2, gamma: 3 }
      interval = 20
    }
    Object.defineProperty(window, 'DeviceMotionEvent', { value: MockDeviceMotionEvent, configurable: true })
    if ('storage' in navigator) Object.defineProperty(navigator.storage, 'getDirectory', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition(success: PositionCallback) {
          for (let index = 0; index < 14; index += 1) setTimeout(() => success({ timestamp: Date.now(), coords: { latitude: 48 + index * 0.00003, longitude: 2 + index * 0.00012, altitude: 100 + index, accuracy: 4, altitudeAccuracy: 8, heading: 0, speed: 3, toJSON: () => ({}) } } as GeolocationPosition), 20 + index * 30)
          return 1
        },
        clearWatch: () => undefined,
      },
    })
  })
  await page.goto('./')
})

test('crée un participant puis enregistre et analyse hors cloud', async ({ page }) => {
  test.setTimeout(60_000)
  await page.getByRole('link', { name: /Profils/ }).click()
  await page.getByLabel('Nom du participant').fill('Damien')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Damien')).toBeVisible()
  await page.getByPlaceholder('Nom, par ex. Vélo route').fill('Kuga')
  await page.getByRole('combobox', { name: 'Type' }).selectOption({ label: 'Voiture' })
  await page.getByRole('button', { name: 'Ajouter l’équipement' }).click()
  await expect(page.getByRole('img', { name: 'Équipement voiture' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Profil source' }).selectOption({ label: 'CAR · Profil CAR V1 · 1.0.0' })
  await page.getByRole('button', { name: 'Conserver cette nouvelle version' }).click()
  await expect(page.getByText(/version 1\.1\.0 conservé/)).toBeVisible()
  await page.getByRole('link', { name: /Accueil/ }).click()
  await page.getByRole('combobox', { name: /Participant/ }).selectOption({ label: 'Damien' })
  await page.getByRole('combobox', { name: /Activité/ }).selectOption({ label: 'Voiture' })
  await page.getByRole('combobox', { name: /Équipement/ }).selectOption({ label: 'Kuga' })
  await page.getByRole('button', { name: 'Démarrer la session' }).click()
  await expect(page.getByRole('heading', { name: 'Fixez le téléphone' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { motionPermissionRequested?: boolean }).motionPermissionRequested)).toBe(true)
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByRole('button', { name: 'Démarrer la session' })).toBeEnabled()
  await page.getByRole('button', { name: 'Démarrer la session' }).click()
  await page.evaluate(() => { for (let index = 0; index < 60; index += 1) window.dispatchEvent(new DeviceMotionEvent('devicemotion')) })
  await expect(page.getByText('RECORDING')).toBeVisible({ timeout: 8_000 })
  await page.evaluate(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion')))
  await expect(page.getByText('Mouvement · mesures reçues')).toBeVisible()
  await expect(page.getByText('km/h')).toBeVisible()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Arrêter et analyser' }).click()
  await expect(page.getByText('Données techniques et provenance')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Indisponible')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Afficher la carte en plein écran' })).toBeVisible()
  await page.getByRole('button', { name: 'Topo' }).click()
  await page.getByRole('button', { name: 'Afficher la carte en plein écran' }).click()
  await expect(page.getByRole('button', { name: 'Réduire la carte' })).toBeVisible()
  await page.getByRole('button', { name: 'Réduire la carte' }).click()
  await expect(page.getByText('Enrichir cette session')).toBeVisible()
  await page.locator('.enrichment-file input').setInputFiles({
    name: 'complement.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from('<?xml version="1.0"?><gpx version="1.1"><trk><name>Complément</name><trkseg><trkpt lat="48.0001" lon="2.0001"><ele>101</ele><time>2026-08-21T20:00:00Z</time></trkpt><trkpt lat="48.0002" lon="2.0003"><ele>102</ele><time>2026-08-21T20:00:02Z</time></trkpt></trkseg></trk></gpx>'),
  })
  await expect(page.getByText(/Cible verrouillée :/)).toBeVisible()
  await page.getByRole('button', { name: 'Enrichir et réanalyser' }).click()
  await expect(page.getByText(/Session enrichie/)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('combobox', { name: 'Profil versionné' }).selectOption({ label: 'Profil CAR V1 calibré · 1.1.0' })
  await page.getByRole('button', { name: 'Lancer la réanalyse' }).click()
  await expect(page.getByText(/L’analyse originale reste conservée/)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: /Accueil/ }).click()
  await expect(page.getByRole('combobox', { name: /Participant/ })).toHaveValue(/.+/)
  await expect(page.getByRole('combobox', { name: /Activité/ })).toHaveValue('CAR')
  await expect(page.getByRole('combobox', { name: /Équipement/ })).not.toHaveValue('')
  await page.getByRole('link', { name: /Sessions/ }).click()
  await page.locator('.session-card-main').first().click()
  await page.getByRole('button', { name: 'Supprimer cette session' }).click()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page.getByRole('heading', { name: 'Confirmer la suppression définitive' })).toBeVisible()
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click()
  await expect(page.getByRole('heading', { name: 'Aucune session' })).toBeVisible()
})

test('reste consultable après passage hors ligne', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Le basculement réseau Playwright provoque une erreur interne WebKit ; le flux principal WebKit reste couvert.')
  await expect(page.getByRole('heading', { name: 'Prêt à enregistrer' })).toBeVisible()
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Prêt à enregistrer' })).toBeVisible()
})
