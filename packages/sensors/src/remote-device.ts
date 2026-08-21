import type { SensorCapabilities, SensorSample, SensorSource } from '@track-analyser/domain'

export interface RemoteDeviceTransport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(message: unknown): Promise<void>
  subscribe(callback: (message: unknown) => void): () => void
}

// Définir le contrat V1.1 sans coupler le domaine à Web Bluetooth.
export abstract class RemoteDeviceSource implements SensorSource {
  abstract start(): Promise<void>
  abstract stop(): Promise<void>
  abstract getCapabilities(): Promise<SensorCapabilities>
  abstract subscribe(callback: (sample: SensorSample) => void): () => void
}

