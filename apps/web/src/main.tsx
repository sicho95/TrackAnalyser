import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { AppDataProvider } from './context'
import './styles.css'
import { registerControlledUpdate } from './update'

registerControlledUpdate((controller) => {
  window.dispatchEvent(new CustomEvent('track-analyser:update-ready', { detail: controller }))
})

const root = document.querySelector('#root')
if (root === null) throw new Error('Élément racine introuvable.')

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </HashRouter>
  </StrictMode>,
)
