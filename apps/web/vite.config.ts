import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const buildId = process.env.BUILD_ID ?? new Date().toISOString().replaceAll(/\D/g, '').slice(0, 14)
const appVersion = process.env.APP_VERSION ?? '1.0.0'
const gitCommit = process.env.GITHUB_SHA ?? 'local'

export default defineConfig({
  base: '/TrackAnalyser/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_ID__: JSON.stringify(buildId),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __SCHEMA_VERSION__: '3',
    __ANALYSIS_VERSION__: JSON.stringify('1.0.0'),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'prompt',
      manifest: {
        id: '/TrackAnalyser/',
        name: 'TrackAnalyser',
        short_name: 'TrackAnalyser',
        description: 'Acquisition et analyse locale multi-activité',
        lang: 'fr',
        start_url: '/TrackAnalyser/#/',
        scope: '/TrackAnalyser/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#07111f',
        theme_color: '#07111f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'] },
      devOptions: { enabled: true, type: 'module' },
    }),
    {
      name: 'track-analyser-version-manifest',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ appVersion, buildId, gitCommit, schemaVersion: 3, analysisVersion: '1.0.0' }),
        })
      },
    },
  ],
  build: { sourcemap: true },
})

