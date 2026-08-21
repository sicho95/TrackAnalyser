# Cartographie

La PWA utilise MapLibre GL JS. Deux styles raster interchangeables sont fournis : OpenStreetMap standard et OpenTopoMap. Le domaine ne dépend d’aucun fournisseur ni d’une API payante.

Le récapitulatif expose le choix Plan/Topo directement au-dessus de la carte. Le même contrôle reste disponible en plein écran ; `Échap` ou le bouton de réduction referme cette vue. Le fournisseur choisi est écrit dans `AppSettings.mapProvider`, ce qui synchronise la carte réduite, la carte plein écran et les réglages généraux.

Si le réseau ou les tuiles sont indisponibles, la session, sa route numérique, ses analyses et ses exports restent accessibles. La V1.1 pourra ajouter PMTiles, packs de zones, raster-dem et terrain par une source MapLibre dédiée, avec un stockage séparé des sessions.
