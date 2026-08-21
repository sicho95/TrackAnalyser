# Cartographie

La PWA utilise MapLibre GL JS. Deux styles raster interchangeables sont fournis : OpenStreetMap standard et OpenTopoMap. Le domaine ne dépend d’aucun fournisseur ni d’une API payante.

Le récapitulatif n’ajoute aucune barre HTML par-dessus la carte. Le zoom, l’orientation, le choix du fond et le plein écran appartiennent tous au rail de contrôles MapLibre. Le plein écran repose sur `FullscreenControl` avec son repli pseudo-plein-écran pour Safari iOS. Le choix du fond est un `IControl` MapLibre : un bouton unique ouvre un menu qui énumère chaque entrée de `MAP_PROVIDER_IDS`. Le même contrôle reste donc présent en plein écran et aucun bouton propre à un fournisseur ne doit être ajouté sur la carte.

Le fournisseur choisi est écrit dans `AppSettings.mapProvider`, ce qui synchronise la carte réduite, la carte plein écran et les réglages généraux. Le catalogue crée un nouveau `StyleSpecification` à chaque activation afin de ne pas partager un objet mutable entre plusieurs instances MapLibre.

Si le réseau ou les tuiles sont indisponibles, la session, sa route numérique, ses analyses et ses exports restent accessibles. La V1.1 pourra ajouter PMTiles, packs de zones, raster-dem et terrain par une source MapLibre dédiée, avec un stockage séparé des sessions.
