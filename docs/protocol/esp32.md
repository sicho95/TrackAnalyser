# Protocole ESP32 futur

Transport cible : Wi-Fi avec WebSocket pour le direct et HTTP pour les transferts reprenables. Web Bluetooth n’est pas requis sur iOS.

Chaque enveloppe contient `protocolVersion`, `messageId`, `deviceId`, `sessionId` éventuel, `sentAtUtc`, `type` et `payload`.

Messages V1.1 prévus :

- `HELLO`, `DEVICE_INFO`, `CAPABILITIES` ;
- `START_SESSION`, `STOP_SESSION` ;
- `LIVE_SAMPLE` ;
- `SESSION_LIST`, `SESSION_DOWNLOAD` ;
- `SYNC_STATUS`, `TIME_SYNC`.

Les chunks portent index, taille, SHA-256 et indicateur final. Le smartphone demande les index manquants. L’UUID de session assure déduplication et reprise. Le boîtier continue à enregistrer sans téléphone.
