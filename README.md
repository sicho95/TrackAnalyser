# TrackAnalyser

TrackAnalyser est une PWA locale d’acquisition, d’analyse et de comparaison de mouvements multi-source et multi-participant.

La source produit normative est [SPEC.md](./SPEC.md). L’architecture technique détaillée se trouve dans [`docs/`](./docs/).

## Développement

Prérequis : Node.js 20+, pnpm 10, CMake et, pour le build WebAssembly, Emscripten.

```bash
pnpm install
pnpm dev
pnpm verify
```

L’application est servie avec le chemin GitHub Pages `/TrackAnalyser/` et utilise un routage par hash.

