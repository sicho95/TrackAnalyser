# RemoteDeviceSource

`SensorSource` définit `start`, `stop`, `getCapabilities` et `subscribe`. `RemoteDeviceSource` étend ce contrat sans dépendance au transport. `RemoteDeviceTransport` isolera WebSocket/HTTP.

L’ajout du boîtier ne change ni le domaine, ni les analyseurs, ni la fusion : les échantillons distants utilisent les mêmes `MetricChannel`, timestamps, qualité et provenance que le téléphone ou un fichier importé.

